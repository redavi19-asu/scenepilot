// Run on the encoder host: node --test server/test/encoder-ingest.test.mjs
// Uses real FFmpeg, isolated API credentials/port, and temporary FLV outputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import WebSocket from "ws";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test("WebM/fragmented MP4 transcode; invalid input cannot crash the API", { timeout: 45000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "scenepilot-ingest-"));
  const token = randomBytes(32).toString("hex");
  const encoder = spawn(process.execPath, [new URL("../encoder.js", import.meta.url).pathname], {
    env: { ...process.env, ENCODER_PORT: "0", ENCODER_API_TOKEN: token,
      SCENEPILOT_INPUT_BASE: directory, SCENEPILOT_RECORDING_ROOT: directory }
  });
  let logs = "";
  encoder.stderr.on("data", data => { logs += data; });
  let api;
  try {
    api = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Encoder startup timeout")), 5000);
      encoder.stdout.on("data", data => {
        logs += data;
        const match = logs.match(/listening on (http:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      encoder.once("error", reject);
    });
    async function request(path, body) {
      const response = await fetch(`${api}${path}`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, path.endsWith("start") ? 202 : 200);
      return response.json();
    }
    for (const format of ["webm", "mp4"]) {
      const fixture = join(directory, `input.${format}`);
      execFileSync("/usr/bin/ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3",
        "-c:v", format === "webm" ? "libvpx" : "libx264",
        "-c:a", format === "webm" ? "libopus" : "aac",
        ...(format === "mp4" ? ["-movflags", "frag_keyframe+empty_moov+default_base_moof"] : []), fixture]);
      const session = await request("/broadcast/start", { room: format, destinations: [{ id: "self" }] });
      const ws = new WebSocket(`${api.replace("http", "ws")}/ingest/${format}`, session.ingest.protocol);
      await once(ws, "open");
      const data = await readFile(fixture);
      // Preserve order, but split the container header across WS messages.
      ws.send(data.subarray(0, 7));
      for (let offset = 7; offset < data.length; offset += 4096) {
        ws.send(data.subarray(offset, offset + 4096));
        await delay(5);
      }
      const closed = once(ws, "close");
      ws.close(1000);
      await closed;
      const output = join(directory, format);
      let probe;
      for (let attempt = 0; attempt < 30; attempt++) {
        await delay(100);
        try {
          probe = JSON.parse(execFileSync("/usr/bin/ffprobe", ["-v", "error", "-show_streams", "-of", "json", output], { stdio: ["ignore", "pipe", "ignore"] }));
          if (probe.streams.length === 2) break;
        } catch {}
      }
      assert.deepEqual(probe?.streams.map(stream => stream.codec_name).sort(), ["aac", "h264"], logs);
      assert.equal(encoder.exitCode, null, logs);
      await request("/broadcast/stop", { room: format });
    }
    const session = await request("/broadcast/start", { room: "invalid" });
    const ws = new WebSocket(`${api.replace("http", "ws")}/ingest/invalid`, session.ingest.protocol);
    await once(ws, "open");
    const closed = once(ws, "close");
    for (let i = 0; i < 16; i++) ws.send(Buffer.alloc(65536, 255));
    const [code] = await closed;
    assert.equal(code, 1011);
    await delay(100);
    assert.equal(encoder.exitCode, null, logs);
    assert.equal((await fetch(`${api}/health`)).status, 200);
    await request("/broadcast/stop", { room: "invalid" });
  } finally {
    encoder.kill("SIGTERM");
    if (encoder.exitCode === null) await once(encoder, "exit");
    await rm(directory, { recursive: true, force: true });
  }
});
