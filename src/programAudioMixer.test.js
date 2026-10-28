import assert from "node:assert/strict";
import test from "node:test";
import {
  collectProgramAudioSources,
  createProgramAudioMixer,
  programAudioGain,
  stopProgramAudioMixer,
  syncProgramAudioMixer
} from "./programAudioMixer.js";

function mockStream(name) {
  const track = { kind: "audio", id: name, readyState: "live" };
  return { track, getAudioTracks: () => [track] };
}
class FakeMediaStream {
  constructor(tracks) { this.tracks = tracks; }
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.closed = false; this.created = []; }
  createMediaStreamDestination() {
    return { stream: { getAudioTracks: () => [{ id: "stable-output", stop() { this.stopped = true; } }] } };
  }
  createMediaStreamSource(stream) {
    const node = { stream, connect: destination => { node.connectedTo = destination; }, disconnect() { node.disconnected = true; } };
    this.created.push(node);
    return node;
  }
  createGain() {
    return { gain: {
      value: 0,
      cancelScheduledValues() {},
      setTargetAtTime(value) { this.value = value; }
    }, connect() {}, disconnect() {} };
  }
  async close() { this.closed = true; }
}
const originalMediaStream = globalThis.MediaStream;
test.before(() => { globalThis.MediaStream = FakeMediaStream; });
test.after(() => { globalThis.MediaStream = originalMediaStream; });

test("the selected camera and mix obey mute, solo, volume and standby", () => {
  const source = { id: "c1", slotId: 1 };
  const base = { masterAudioSource: "mix", primarySlot: 1, cameraAudio: { c1: { muted: false, volume: 0.6 } } };
  assert.equal(programAudioGain(source, base, false), 0.6);
  assert.equal(programAudioGain(source, { ...base, standby: true }, false), 0);
  assert.equal(programAudioGain(source, { ...base, masterAudioSource: "c2" }, false), 0);
  assert.equal(programAudioGain(source, { ...base, masterAudioSource: "follow", primarySlot: 2 }, false), 0);
  assert.equal(programAudioGain(source, { ...base, masterAudioSource: "follow" }, false), 0.6);
  assert.equal(programAudioGain(source, base, true), 0);
  assert.equal(programAudioGain(source, { ...base, cameraAudio: { c1: { muted: false, volume: 0.7, solo: true } } }, true), 0.7);
  assert.equal(programAudioGain(source, { ...base, cameraAudio: { c1: { muted: true, solo: true } } }, true), 0);
  assert.equal(programAudioGain(source, { ...base, cameraAudio: { c1: { muted: false, volume: 8 } } }, false), 1);
  assert.equal(programAudioGain(source, { ...base, cameraAudio: { c1: { muted: false, volume: -1 } } }, false), 0);
});

test("mixer retains one output track while routing live channel changes", () => {
  const c1 = mockStream("one");
  const c2 = mockStream("two");
  const mixer = createProgramAudioMixer(FakeAudioContext);
  const output = mixer.outputTrack;
  const state = {
    directorStream: null,
    screenStream: null,
    wirelessCameras: [{ socketId: "c1", slotId: 1 }, { socketId: "c2", slotId: 2 }],
    remoteStreams: { c1, c2 },
    cameraAudio: { c1: { volume: 0.8, muted: false, solo: false }, c2: { volume: 1, muted: false, solo: false } },
    masterAudioSource: "follow",
    primarySlot: 1,
    standby: false
  };
  syncProgramAudioMixer(mixer, state);
  assert.equal(mixer.inputs.size, 2);
  assert.equal(mixer.inputs.get("c1").gain.gain.value, 0.8);
  assert.equal(mixer.inputs.get("c2").gain.gain.value, 0);
  syncProgramAudioMixer(mixer, { ...state, primarySlot: 2 });
  assert.equal(mixer.inputs.get("c1").gain.gain.value, 0);
  assert.equal(mixer.inputs.get("c2").gain.gain.value, 1);
  assert.equal(mixer.outputTrack, output);
  syncProgramAudioMixer(mixer, { ...state, primarySlot: 2, cameraAudio: { ...state.cameraAudio, c2: { muted: true, volume: 1 } } });
  assert.equal(mixer.inputs.get("c2").gain.gain.value, 0);
  syncProgramAudioMixer(mixer, { ...state, primarySlot: 2, standby: true });
  assert.equal(mixer.inputs.get("c2").gain.gain.value, 0);
  syncProgramAudioMixer(mixer, { ...state, remoteStreams: { c1 } });
  assert.equal(mixer.inputs.size, 1);
  assert.equal(mixer.outputTrack, output);
  c1.track.readyState = "ended";
  syncProgramAudioMixer(mixer, state);
  assert.equal(mixer.inputs.has("c1"), false);
  stopProgramAudioMixer(mixer);
  assert.equal(mixer.context.closed, true);
  assert.equal(output.stopped, true);
});

test("mix includes director and shared-window audio when unmuted", () => {
  const directorStream = mockStream("director");
  const screenStream = mockStream("screen");
  const sources = collectProgramAudioSources({ directorStream, screenStream });
  assert.deepEqual(sources.map(s => s.id), ["director", "screen-share"]);
  const mixer = createProgramAudioMixer(FakeAudioContext);
  syncProgramAudioMixer(mixer, {
    directorStream, screenStream, wirelessCameras: [], remoteStreams: {},
    masterAudioSource: "mix", cameraAudio: {
      director: { muted: false, volume: 0.4 },
      "screen-share": { muted: false, volume: 0.2 }
    }
  });
  assert.equal(mixer.inputs.get("director").gain.gain.value, 0.4);
  assert.equal(mixer.inputs.get("screen-share").gain.gain.value, 0.2);
  stopProgramAudioMixer(mixer);
});
