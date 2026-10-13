import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, rename, stat, statfs, unlink } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { sessionStatus, standbyFfmpegArgs } from "./standby.js";

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
const RECORDING_ROOT = String(
  process.env.SCENEPILOT_RECORDING_ROOT || "/home/ryan/scenepilot-data/recordings"
).replace(/\/+$/, "");
const RECORDING_RETENTION_HOURS = Math.max(
  1,
  Number(process.env.SCENEPILOT_RECORDING_RETENTION_HOURS || 72)
);
const OWNER_RECORDING_ROOT = join(RECORDING_ROOT, "owner");
const STORAGE_WARNING_PERCENT = Math.min(
  99,
  Math.max(1, Number(process.env.SCENEPILOT_STORAGE_WARNING_PERCENT || 80))
);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RECORDING_EXTENSIONS = new Set([".flv", ".mkv", ".mov", ".mp4", ".webm"]);

const jobs = new Map();

function scheduleStandby(job, delayMs = 1500) {
  if (
    !job || job.stopped || jobs.get(job.room) !== job ||
    job.socket || job.ingestProcess || job.standbyProcess || job.reconnecting ||
    Date.now() >= job.streamExpiresAt
  ) return;
  clearTimeout(job.standbyTimer);
  job.standbyTimer = setTimeout(() => {
    job.standbyTimer = null;
    if (
      job.stopped || jobs.get(job.room) !== job || job.socket ||
      job.ingestProcess || job.standbyProcess || job.reconnecting
    ) return;

    const proc = spawn("/usr/bin/ffmpeg", standbyFfmpegArgs(INPUT_BASE, job.room), {
      stdio: ["ignore", "ignore", "pipe"]
    });
    job.standbyProcess = proc;
    console.log(`[${job.eventId}:standby] Server fallback broadcast started.`);
    proc.stderr.on("data", data => {
      process.stderr.write(`[${job.eventId}:standby] ${data}`);
    });
    proc.on("error", error => console.error("[standby] Encoder failed:", error.message));
    proc.once("close", (code, signal) => {
      if (job.standbyProcess !== proc) return;
      job.standbyProcess = null;
      console.log(`[${job.eventId}:standby] Closed code=${code} signal=${signal}`);
      // Avoid tight process restart loops if FFmpeg is missing or unsupported.
      scheduleStandby(job, 30000);
    });
  }, delayMs);
  job.standbyTimer.unref?.();
}

function stopStandby(job) {
  clearTimeout(job?.standbyTimer);
  if (job) job.standbyTimer = null;
  const proc = job?.standbyProcess;
  if (!proc) return Promise.resolve();
  job.standbyProcess = null;
  return new Promise(resolve => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 2500);
    proc.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill("SIGTERM");
  });
}

async function archiveOwnerRecordings(job) {
  if (!job || job.retentionClass !== "owner") return { movedFiles: 0, movedBytes: 0 };

  let movedFiles = 0;
  let movedBytes = 0;

  for (const kind of ["program", "iso"]) {
    const sourceDir = join(RECORDING_ROOT, kind);
    const targetDir = join(OWNER_RECORDING_ROOT, kind);
    await mkdir(targetDir, { recursive: true });

    let entries = [];
    try {
      entries = await readdir(sourceDir, { withFileTypes: true });
    } catch (error) {
      console.error(`[owner-retention] Cannot scan ${sourceDir}: ${error.message}`);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.includes(job.room)) continue;

      const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (!RECORDING_EXTENSIONS.has(extension)) continue;

      const source = join(sourceDir, entry.name);
      const destination = join(
        targetDir,
        `${job.networkId || "owner"}-${job.eventId}-${entry.name}`
      );

      try {
        const details = await stat(source);
        await rename(source, destination);
        movedFiles += 1;
        movedBytes += details.size;
      } catch (error) {
        console.error(`[owner-retention] Cannot archive ${source}: ${error.message}`);
      }
    }
  }

  if (movedFiles) {
    console.log(
      `[owner-retention] Archived ${movedFiles} owner recording(s), ` +
      `${(movedBytes / 1024 / 1024).toFixed(1)} MiB, outside temporary cleanup.`
    );
  }

  return { movedFiles, movedBytes };
}

async function cleanupRecordings() {
  const cutoff = Date.now() - RECORDING_RETENTION_HOURS * 60 * 60 * 1000;
  let deletedFiles = 0;
  let deletedBytes = 0;

  for (const directory of [join(RECORDING_ROOT, "program"), join(RECORDING_ROOT, "iso")]) {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      console.error(`[retention] Cannot scan ${directory}: ${error.message}`);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
      if (!RECORDING_EXTENSIONS.has(extension)) continue;

      const path = join(directory, entry.name);
      try {
        const details = await stat(path);
        if (details.mtimeMs >= cutoff) continue;
        await unlink(path);
        deletedFiles += 1;
        deletedBytes += details.size;
      } catch (error) {
        console.error(`[retention] Cannot remove ${path}: ${error.message}`);
      }
    }
  }

  try {
    const filesystem = await statfs(RECORDING_ROOT);
    const total = Number(filesystem.blocks) * Number(filesystem.bsize);
    const available = Number(filesystem.bavail) * Number(filesystem.bsize);
    const usedPercent = total > 0 ? ((total - available) / total) * 100 : 0;

    if (usedPercent >= STORAGE_WARNING_PERCENT) {
      console.warn(
        `[storage] WARNING: recording disk is ${usedPercent.toFixed(1)}% full ` +
        `(warning threshold ${STORAGE_WARNING_PERCENT}%).`
      );
    }
  } catch (error) {
    console.error(`[storage] Cannot read recording disk usage: ${error.message}`);
  }

  if (deletedFiles) {
    console.log(
      `[retention] Deleted ${deletedFiles} recording(s), ` +
      `${(deletedBytes / 1024 / 1024).toFixed(1)} MiB, older than ` +
      `${RECORDING_RETENTION_HOURS} hours.`
    );
  }
}

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

function stopJob(job, closeCode = 1000, closeReason = "Broadcast stopped") {
  if (!job) return;
  job.stopped = true;
  void stopStandby(job);
  if (job?.limitTimer) {
    clearTimeout(job.limitTimer);
    job.limitTimer = null;
  }

  try {
    job.socket?.close(closeCode, closeReason);
  } catch {}

  try {
    job.ingestProcess?.stdin?.end();
  } catch {}

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
    // MediaRecorder containers arrive on a non-seekable pipe. Direct AVIO
    // bypasses the probe buffer and loses the WebM header before demuxing.
    // Preserve probe packets (including the first keyframe) for decoding.
    "-fflags", "+genpts+discardcorrupt",
    "-i", "pipe:0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    // nginx-rtmp can only close an HLS segment on a video keyframe. A fixed
    // one-second GOP makes its one-second HLS target deterministic at 30 fps.
    "-g", "30",
    "-keyint_min", "30",
    "-sc_threshold", "0",
    "-force_key_frames", "expr:gte(t,n_forced*1)",
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "128k",
    "-flush_packets", "1",
    "-muxdelay", "0",
    "-muxpreload", "0",
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
      activeJobs: jobs.size,
      temporaryRetentionHours: RECORDING_RETENTION_HOURS,
      ownerRetention: "permanent",
      ownerRecordingRoot: OWNER_RECORDING_ROOT
    });
  }

  if (!authorized(request)) {
    return json(response, 401, { error: "ScenePilot encoder authorization required." });
  }

  try {
    if (request.method === "GET" && url.pathname === "/broadcast/status") {
      const room = safeRoom(url.searchParams.get("room"));
      const job = jobs.get(room);
      return json(response, 200, sessionStatus(job));
    }

    if (request.method === "POST" && url.pathname === "/broadcast/resume") {
      const body = await readJson(request);
      const room = safeRoom(body.room);
      const job = jobs.get(room);
      if (!job || job.stopped || job.streamExpiresAt <= Date.now()) {
        return json(response, 404, { error: "Broadcast session is no longer active." });
      }
      if (job.networkId !== String(body.networkId || "")) {
        return json(response, 403, { error: "Broadcast network access denied." });
      }
      if (job.socket || job.reconnecting) {
        return json(response, 409, { error: "Another Director is already publishing this program." });
      }
      job.ingestToken = randomBytes(32).toString("base64url");
      job.ingestExpiresAt = Date.now() + INGEST_TOKEN_TTL_MS;
      return json(response, 200, {
        ...sessionStatus(job),
        ingest: {
          url: `${PUBLIC_INGEST_URL}/ingest/${encodeURIComponent(room)}`,
          protocol: `scenepilot-ingest.${job.ingestToken}`,
          expiresAt: job.ingestExpiresAt
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/broadcast/start") {
      const body = await readJson(request);
      const room = safeRoom(body.room);
      const eventId = String(body.eventId || crypto.randomUUID());
      const input = `${INPUT_BASE}/${room}`;
      const destinations = Array.isArray(body.destinations) ? body.destinations : [];
      const networkId = String(body.networkId || "").trim();
      const requestedMaxDurationSeconds = Number(body.maxDurationSeconds);
      const maxDurationSeconds = Number.isFinite(requestedMaxDurationSeconds)
        ? Math.max(60, Math.min(24 * 60 * 60, Math.floor(requestedMaxDurationSeconds)))
        : 4 * 60 * 60;

      if (networkId) {
        for (const [existingRoom, existingJob] of jobs.entries()) {
          if (existingRoom !== room && existingJob?.networkId === networkId) {
            stopJob(existingJob, 4009, "Another production started");
            if (existingJob.retentionClass === "owner") {
              await new Promise(resolve => setTimeout(resolve, 500));
              await archiveOwnerRecordings(existingJob);
            }
            jobs.delete(existingRoom);
          }
        }
      }

      if (jobs.has(room) && !jobs.get(room)?.stopped) {
        // START SESSION is intentionally not a way to steal or restart an
        // already-running public feed. Resume its ingest or end it explicitly.
        return json(response, 409, {
          error: "Broadcast session is already active. Use RESUME LIVE or END SESSION."
        });
      }

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
        networkId,
        ownerUserId: String(body.ownerUserId || ""),
        ownerRole: String(body.ownerRole || "user"),
        retentionClass: body.retentionClass === "owner" ? "owner" : "temporary",
        processes,
        accepted,
        ingestToken,
        ingestExpiresAt: Date.now() + INGEST_TOKEN_TTL_MS,
        ingestProcess: null,
        socket: null,
        standbyProcess: null,
        standbyTimer: null,
        reconnecting: false,
        stopped: false,
        startedAt: Date.now(),
        maxDurationSeconds,
        streamExpiresAt: Date.now() + maxDurationSeconds * 1000,
        limitTimer: null
      };
      jobs.set(room, job);
      // Keep the public room populated if the Director never connects, or
      // loses its browser/tab later. Only explicit END or quota expiry stops it.
      scheduleStandby(job, 2500);

      job.limitTimer = setTimeout(async () => {
        if (jobs.get(room) !== job) return;

        console.warn(
          `[limit] Streaming limit reached for room ${room} after ${maxDurationSeconds} seconds.`
        );
        stopJob(job, 4008, "Streaming allowance reached");

        if (job.retentionClass === "owner") {
          await new Promise(resolve => setTimeout(resolve, 500));
          await archiveOwnerRecordings(job);
        }

        jobs.delete(room);
      }, maxDurationSeconds * 1000);
      job.limitTimer.unref?.();

      return json(response, 202, {
        ok: true,
        status: "ready",
        eventId,
        room,
        input,
        destinations: accepted,
        maxDurationSeconds: job.maxDurationSeconds,
        streamExpiresAt: job.streamExpiresAt,
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
      let ownerArchive = null;

      if (job) {
        stopJob(job);

        if (job.retentionClass === "owner") {
          await new Promise(resolve => setTimeout(resolve, 500));
          ownerArchive = await archiveOwnerRecordings(job);
        }

        jobs.delete(room);
      }

      return json(response, 200, {
        ok: true,
        status: "stopped",
        room,
        retentionClass: job?.retentionClass || "temporary",
        ownerArchive
      });
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

server.on("upgrade", async (request, socket, head) => {
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
      job.socket ||
      job.reconnecting
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    job.reconnecting = true;
    await stopStandby(job);
    if (job.stopped || jobs.get(room) !== job) {
      job.reconnecting = false;
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, ws => {
      job.reconnecting = false;
      websocketServer.emit("connection", ws, request, { room, job, requestedProtocol });
    });
  } catch {
    socket.destroy();
  }
});

websocketServer.on("connection", (ws, _request, context) => {
  const { room, job } = context;
  const ingestProcess = startIngest(INPUT_BASE, room);
  job.socket = ws;
  job.ingestProcess = ingestProcess;
  job.ingestToken = "";

  let finished = false;
  let killTimer;
  let lastPacketAt = Date.now();
  const stallTimer = setInterval(() => {
    if (!finished && Date.now() - lastPacketAt > 7000) {
      finish(1011, "Director stopped sending video; switching to server standby");
    }
  }, 2000);
  stallTimer.unref?.();
  function finish(code, reason) {
    if (finished) return;
    finished = true;
    clearInterval(stallTimer);
    console.log(`[${job.eventId}:ingest] ${reason}`);
    ws.resume();
    if (ws.readyState < 2) ws.close(code, reason);
    try { ingestProcess.stdin.end(); } catch {}
    // Allow FFmpeg to flush its final packets, but never leave an orphan
    // encoder waiting forever after a disconnected or failed producer.
    killTimer = setTimeout(() => {
      if (ingestProcess.exitCode === null && ingestProcess.signalCode === null) {
        ingestProcess.kill("SIGKILL");
      }
    }, 5000);
    killTimer.unref();
  }

  ingestProcess.on("error", () => finish(1011, "Encoder could not start"));
  // An FFmpeg failure closes stdin. Handle EPIPE so a bad broadcast cannot
  // crash the API process and disconnect every production.
  ingestProcess.stdin.on("error", () => finish(1011, "Encoder input failed"));
  ingestProcess.stdin.on("drain", () => {
    if (!finished && ws.readyState === 1) ws.resume();
  });

  ingestProcess.stderr.on("data", chunk => {
    process.stderr.write(`[${job.eventId}:ingest] ${chunk}`);
  });

  ingestProcess.once("close", (code, signal) => {
    console.log(`[${job.eventId}:ingest] FFmpeg closed: code=${code} signal=${signal}`);
    finish(1011, "Encoder stopped");
    clearTimeout(killTimer);
    if (job.ingestProcess === ingestProcess) job.ingestProcess = null;
    if (!job.socket) scheduleStandby(job);
  });

  ws.on("message", (data, isBinary) => {
    if (finished || !isBinary || !ingestProcess.stdin.writable) return;
    lastPacketAt = Date.now();
    // Bound the queue when the encoder cannot keep up with the producer.
    if (!ingestProcess.stdin.write(data)) ws.pause();
  });

  ws.on("close", () => {
    finish(1000, "Producer disconnected");
    if (job.socket === ws) job.socket = null;
    if (!job.ingestProcess) scheduleStandby(job);
  });

  ws.on("error", error => {
    process.stderr.write(`[${job.eventId}:websocket] ${error.message}\n`);
    finish(1011, "Ingest transport failed");
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
  console.log(`ScenePilot encoder API listening on http://${HOST}:${server.address().port}`);
  console.log(
    `ScenePilot recording retention: ${RECORDING_RETENTION_HOURS} hours; ` +
    `storage warning: ${STORAGE_WARNING_PERCENT}%.`
  );
  cleanupRecordings().catch(error => {
    console.error(`[retention] Initial cleanup failed: ${error.message}`);
  });
  setInterval(() => {
    cleanupRecordings().catch(error => {
      console.error(`[retention] Scheduled cleanup failed: ${error.message}`);
    });
  }, CLEANUP_INTERVAL_MS).unref();
});
