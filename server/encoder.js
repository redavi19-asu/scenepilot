import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";

const HOST = process.env.ENCODER_HOST || "127.0.0.1";
const PORT = Number(process.env.ENCODER_PORT || 8788);
const API_TOKEN = String(process.env.ENCODER_API_TOKEN || "").trim();
const INPUT_BASE = String(
  process.env.SCENEPILOT_INPUT_BASE || "rtmp://127.0.0.1/live"
).replace(/\/+$/, "");
const PUBLIC_INGEST_URL = String(
  process.env.SCENEPILOT_PUBLIC_INGEST_URL || "wss://encoder.icomputeranything.com"
).replace(/\/+$/, "");
const INGEST_TOKEN_TTL_MS = 10 * 60 * 1000;

const jobs = new Map();

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  if (!API_TOKEN) return false;
  return request.headers.authorization === `Bearer ${API_TOKEN}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeRoom(value) {
  const room = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(room)) {
    throw new Error("Room must contain only letters, numbers, underscores, or hyphens.");
  }
  return room;
}

function outputUrl(destination) {
  const base = String(destination?.url || "").trim().replace(/\/+$/, "");
  const key = String(destination?.streamKey || destination?.key || "").trim();
  if (!base || !key) return "";
  if (!/^rtmps?:\/\//i.test(base)) return "";
  return `${base}/${key}`;
}

function stopJob(job) {
  try {
    job.socket?.close(1000, "Broadcast stopped");
  } catch (_) {}

  try {
    job.ingestProcess?.stdin?.end();
  } catch (_) {}

  if (job.ingestProcess && !job.ingestProcess.killed) {
    job.ingestProcess.kill("SIGTERM");
  }

  for (const process of job.processes) {
    if (!process.killed) process.kill("SIGTERM");
  }
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function startIngest(input, room) {
  return spawn("/usr/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "warning",
    "-fflags", "+genpts+discardcorrupt",
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-keyint_min", "60",
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "128k",
    "-f", "flv",
    `${input}/${room}`
  ], {
    stdio: ["pipe", "ignore", "pipe"]
  });
}

function startRestream(input, target, metadata) {
  const args = [
    "-hide_banner", "-loglevel", "warning",
    "-i", input,
    "-c", "copy",
    "-f", "flv",
    target
  ];

  const child = spawn("/usr/bin/ffmpeg", args, {
    stdio: ["ignore", "ignore", "pipe"]
  });

  child.stderr.on("data", chunk => {
    process.stderr.write(`[${metadata.eventId}:${metadata.destinationId}] ${chunk}`);
  });

  return child;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, {
      ok: true,
      service: "scenepilot-encoder",
      authenticated: Boolean(API_TOKEN),
      activeJobs: jobs.size
    });
  }

  if (!authorized(request)) {
    return json(response, 401, { error: "ScenePilot encoder authorization required." });
  }

  try {
    if (request.method === "POST" && url.pathname === "/broadcast/start") {
      const body = await readJson(request);
      const room = safeRoom(body.room);
      const eventId = String(body.eventId || crypto.randomUUID());
      const input = `${INPUT_BASE}/${room}`;
      const destinations = Array.isArray(body.destinations) ? body.destinations : [];

      if (jobs.has(room)) stopJob(jobs.get(room));

      const processes = [];
      const accepted = [];

      for (const destination of destinations) {
        const destinationId = String(destination?.id || "custom");

        // The local RTMP application already records and creates HLS.
        if (destinationId === "self") {
          accepted.push({ id: destinationId, mode: "local-hls" });
          continue;
        }

        const target = outputUrl(destination);
        if (!target) continue;

        processes.push(startRestream(input, target, { eventId, destinationId }));
        accepted.push({ id: destinationId, mode: "rtmp-restream" });
      }

      const ingestToken = randomBytes(32).toString("base64url");
      const job = {
        eventId,
        room,
        input,
        processes,
        accepted,
        ingestToken,
        ingestExpiresAt: Date.now() + INGEST_TOKEN_TTL_MS,
        ingestProcess: null,
        socket: null,
        startedAt: Date.now()
      };
      jobs.set(room, job);

      return json(response, 202, {
        ok: true,
        status: "ready",
        eventId,
        room,
        input,
        destinations: accepted,
        ingest: {
          url: `${PUBLIC_INGEST_URL}/ingest/${encodeURIComponent(room)}`,
          protocol: `scenepilot-ingest.${ingestToken}`,
          expiresAt: job.ingestExpiresAt
        },
        watchUrl: `https://live.icomputeranything.com/hls/live/${encodeURIComponent(room)}/index.m3u8`
      });
    }

    if (request.method === "POST" && url.pathname === "/broadcast/stop") {
      const body = await readJson(request);
      const room = safeRoom(body.room);
      const job = jobs.get(room);
      if (job) stopJob(job);
      jobs.delete(room);
      return json(response, 200, { ok: true, status: "stopped", room });
    }

    return json(response, 404, { error: "Not found." });
  } catch (error) {
    return json(response, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

const websocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: 4 * 1024 * 1024
});

server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const match = url.pathname.match(/^\/ingest\/([A-Za-z0-9_-]{1,80})$/);
    const room = match?.[1] || "";
    const job = jobs.get(room);
    const requestedProtocol = String(request.headers["sec-websocket-protocol"] || "")
      .split(",")
      .map(value => value.trim())
      .find(value => value.startsWith("scenepilot-ingest."));
    const token = requestedProtocol?.slice("scenepilot-ingest.".length) || "";

    if (
      !job ||
      !requestedProtocol ||
      Date.now() > job.ingestExpiresAt ||
      !equalSecret(token, job.ingestToken) ||
      job.socket
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, ws => {
      websocketServer.emit("connection", ws, request, { room, job, requestedProtocol });
    });
  } catch (_) {
    socket.destroy();
  }
});

websocketServer.on("connection", (ws, _request, context) => {
  const { room, job } = context;
  const ingestProcess = startIngest(INPUT_BASE, room);
  job.socket = ws;
  job.ingestProcess = ingestProcess;
  job.ingestToken = "";

  ingestProcess.stderr.on("data", chunk => {
    process.stderr.write(`[${job.eventId}:ingest] ${chunk}`);
  });

  ingestProcess.once("exit", code => {
    if (code && ws.readyState < 2) ws.close(1011, "Encoder stopped");
  });

  ws.on("message", (data, isBinary) => {
    if (!isBinary || !ingestProcess.stdin.writable) return;
    ingestProcess.stdin.write(data);
  });

  ws.on("close", () => {
    try { ingestProcess.stdin.end(); } catch (_) {}
    job.socket = null;
    job.ingestProcess = null;
  });

  ws.on("error", error => {
    process.stderr.write(`[${job.eventId}:websocket] ${error.message}\n`);
  });
});

function shutdown() {
  for (const job of jobs.values()) stopJob(job);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, HOST, () => {
  console.log(`ScenePilot encoder API listening on http://${HOST}:${PORT}`);
});
