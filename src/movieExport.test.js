import test from "node:test";
import assert from "node:assert/strict";
import { activeClips, clipSourceTime, clipGain, movieDuration, movieSize, movieMime, renderMovie } from "./movieExport.js";

test("timeline export excludes ruler padding and switches clips on exact boundaries", () => {
  const clips = [{ id: "first", start: 2, duration: 3 }, { id: "next", start: 5, duration: 4 }];
  assert.equal(movieDuration(clips), 9);
  assert.deepEqual(activeClips(clips, 4.99).map(clip => clip.id), ["first"]);
  assert.deepEqual(activeClips(clips, 5).map(clip => clip.id), ["next"]);
  assert.deepEqual(activeClips(clips, 9), []);
});
test("trim, speed, fade-in, fade-out and portrait dimensions survive export", () => {
  const clip = { start: 5, duration: 4, inPoint: 10, outPoint: 18, speed: 2, volume: .8, fadeIn: 1, fadeOut: 1 };
  assert.equal(clipSourceTime(clip, 6), 12);
  assert.equal(clipSourceTime(clip, 10), 18);
  assert.equal(clipGain(clip, 5), 0);
  assert.equal(clipGain(clip, 5.5), .4);
  assert.equal(clipGain(clip, 8.5), .4);
  assert.deepEqual(movieSize("9:16"), [720, 1280]);
});
test("container is selected by capability, never by a misleading filename", () => {
  assert.equal(movieMime({ isTypeSupported: value => value === "video/webm" }), "video/webm");
  assert.equal(movieMime({ isTypeSupported: () => false }), "");
});
test("customer protection checks the original asset even if a clip is altered", async () => {
  await assert.rejects(renderMovie({ clips: [{ assetId: "protected", start: 0, duration: 1, exportAllowed: true }], assets: [{ id: "protected", exportAllowed: false }], isOwner: false }), /Protected/);
});

test("renderer emits final encoder chunk, mixes audio stream, and closes resources", async () => {
  const old = new Map();
  const replace = (key, value) => { old.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { tracks: [track], addTrack(track) { this.tracks.push(track); }, getTracks() { return this.tracks; } };
  const context = { save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {}, fillText() {} };
  let clock = 0, closed = false, recordedTracks = 0;
  class Canvas { captureStream() { return stream; } getContext() { return context; } }
  class Audio {
    state = "running";
    get currentTime() { clock += .1; return clock; }
    resume() { return Promise.resolve(); }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [track] } }; }
    createDynamicsCompressor() { return { connect() {} }; }
    close() { closed = true; return Promise.resolve(); }
  }
  class Recorder {
    static isTypeSupported(type) { return type === "video/mp4"; }
    constructor(stream, options) { recordedTracks = stream.tracks.length; this.mimeType = options.mimeType; this.state = "inactive"; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable({ data: new Blob(["final video chunk"]) }); this.onstop(); }); }
  }
  replace("HTMLCanvasElement", Canvas);
  replace("MediaRecorder", Recorder);
  replace("document", { hidden: false, createElement: () => new Canvas(), addEventListener() {}, removeEventListener() {} });
  replace("navigator", {});
  replace("requestAnimationFrame", callback => setTimeout(callback, 0));
  replace("cancelAnimationFrame", id => clearTimeout(id));
  try {
    const chunks = [];
    const result = await renderMovie({ clips: [{ kind: "text", trackId: "text", text: "Urban Director", start: 0, duration: .5 }], assets: [], isOwner: true,
      AudioContextClass: Audio, writeChunk: async blob => { chunks.push(await blob.text()); } });
    assert.equal(result.mimeType, "video/mp4");
    assert.deepEqual(chunks, ["final video chunk"]);
    assert.equal(recordedTracks, 2);
    assert.ok(closed && track.stopped);
  } finally {
    for (const [key, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
