import test from "node:test";
import assert from "node:assert/strict";
import { acquireDirectorCamera } from "../../src/directorCameraSwitch.js";

function track(kind, id) {
  return { kind, id, readyState: "live", stop() { this.readyState = "ended"; } };
}

class FakeStream {
  constructor(tracks) { this.tracks = tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === "video"); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === "audio"); }
}

async function withMediaStreamMock(run) {
  const previous = globalThis.MediaStream;
  globalThis.MediaStream = FakeStream;
  try { await run(); } finally { globalThis.MediaStream = previous; }
}

test("first Director camera opens with audio", async () => {
  await withMediaStreamMock(async () => {
    const calls = [];
    const source = new FakeStream([track("video", "front"), track("audio", "mic")]);
    const mediaDevices = { async getUserMedia(config) { calls.push(config); return source; } };
    const r = await acquireDirectorCamera(mediaDevices, { facing: "user" });
    assert.equal(r.stream, source);
    assert.equal(r.facing, "user");
    assert.equal(calls.length, 1);
    assert.equal(typeof calls[0].audio, "object");
  });
});

test("switch camera preserves microphone and never ends the old camera until replacement opens", async () => {
  await withMediaStreamMock(async () => {
    const oldVideo = track("video", "front");
    const microphone = track("audio", "mic");
    const previous = new FakeStream([oldVideo, microphone]);
    const newVideo = track("video", "rear");
    let wasOldLiveOnAcquire = false;
    const mediaDevices = { async getUserMedia(config) {
      assert.equal(config.audio, false);
      wasOldLiveOnAcquire = oldVideo.readyState === "live";
      return new FakeStream([newVideo]);
    } };
    const r = await acquireDirectorCamera(mediaDevices, { facing: "environment", previousStream: previous, previousFacing: "user" });
    assert.ok(wasOldLiveOnAcquire);
    assert.equal(r.stream.getVideoTracks()[0], newVideo);
    assert.equal(r.stream.getAudioTracks()[0], microphone);
    assert.equal(microphone.readyState, "live");
    assert.equal(oldVideo.readyState, "ended");
    assert.equal(newVideo.readyState, "live");
  });
});

test("mobile one-camera hardware retries after releasing only the previous video", async () => {
  await withMediaStreamMock(async () => {
    const oldVideo = track("video", "front");
    const mic = track("audio", "mic");
    const previous = new FakeStream([oldVideo, mic]);
    let count = 0;
    const mediaDevices = { async getUserMedia(config) {
      assert.equal(config.audio, false);
      count++;
      if (count === 1) {
        const error = new Error("Only one active camera");
        error.name = "NotReadableError";
        throw error;
      }
      assert.equal(oldVideo.readyState, "ended");
      return new FakeStream([track("video", "rear")]);
    } };
    const r = await acquireDirectorCamera(mediaDevices, { facing: "environment", previousStream: previous });
    assert.equal(count, 2);
    assert.equal(r.facing, "environment");
    assert.equal(mic.readyState, "live");
  });
});

test("unavailable requested camera restores previous lens without stopping microphone", async () => {
  await withMediaStreamMock(async () => {
    const oldVideo = track("video", "front");
    const mic = track("audio", "mic");
    const previous = new FakeStream([oldVideo, mic]);
    let count = 0;
    const mediaDevices = { async getUserMedia(config) {
      count++;
      if (count < 3) {
        const error = new Error("Camera busy");
        error.name = "NotReadableError";
        throw error;
      }
      assert.equal(config.video.facingMode.ideal, "user");
      return new FakeStream([track("video", "front-again")]);
    } };
    const r = await acquireDirectorCamera(mediaDevices, {
      facing: "environment", previousFacing: "user", previousStream: previous
    });
    assert.equal(r.restored, true);
    assert.equal(r.facing, "user");
    assert.equal(mic.readyState, "live");
    assert.equal(r.stream.getVideoTracks()[0].id, "front-again");
  });
});

test("camera permission failure never releases a working Director camera", async () => {
  await withMediaStreamMock(async () => {
    const oldVideo = track("video", "front");
    const mic = track("audio", "mic");
    const previous = new FakeStream([oldVideo, mic]);
    const mediaDevices = { async getUserMedia() {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      throw error;
    } };
    await assert.rejects(
      acquireDirectorCamera(mediaDevices, { facing: "environment", previousStream: previous }),
      { name: "NotAllowedError" }
    );
    assert.equal(oldVideo.readyState, "live");
    assert.equal(mic.readyState, "live");
  });
});
