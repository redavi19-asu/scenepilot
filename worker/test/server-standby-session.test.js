import test from "node:test";
import assert from "node:assert/strict";
import { sessionStatus, standbyFfmpegArgs } from "../../server/standby.js";

test("Debian standby generates continuous audio and video in the same HLS RTMP room", () => {
  const args = standbyFfmpegArgs("rtmp://127.0.0.1/live", "SP-4827-network_123");
  assert.ok(args.includes("anullsrc=channel_layout=stereo:sample_rate=48000"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.some(arg => String(arg).includes("PLEASE STAND BY")));
  assert.equal(args.at(-1), "rtmp://127.0.0.1/live/SP-4827-network_123");
  assert.equal(args.includes("-t"), false);
  assert.throws(() => standbyFfmpegArgs("rtmp://127.0.0.1/live", "../invalid"));
});

test("active session survives disappearance of client camera and is marked standby", () => {
  const job = {
    room: "SP-1",
    accepted: [{ id: "self" }],
    socket: null,
    ingestProcess: null,
    standbyProcess: { pid: 123 },
    startedAt: 123456,
    streamExpiresAt: 987654
  };
  assert.deepEqual(sessionStatus(job), {
    active: true, room: "SP-1", mode: "standby", ingestConnected: false,
    destinations: ["self"], startedAt: 123456, expiresAt: 987654
  });
  job.standbyProcess = null;
  assert.equal(sessionStatus(job).mode, "connecting");
  job.socket = { readyState: 1 };
  job.ingestProcess = { pid: 345 };
  assert.equal(sessionStatus(job).mode, "program");
  assert.deepEqual(sessionStatus(null), { active: false, mode: "off", destinations: [] });
});
