import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
function initial(name) {
  const expression = source.match(new RegExp(`const \\[${name}, [^\\]]+\\] = useState\\(([\\s\\S]*?)\\);`))?.[1];
  assert.ok(expression, `Find ${name}'s actual initial state`);
  return vm.runInNewContext(`(${expression})`);
}
function switcher() {
  const state = {
    preview: initial("preview"),
    mainCamera: initial("mainCamera"),
    secondaryPreview: initial("secondaryPreview"),
    programComposition: initial("programComposition"),
    compositionMode: "single", previewDirty: false,
    transition: "CUT", duration: 0, programTransition: { key: 0 },
    remoteStreams: {}, camera: { socketId: "phone1", slotId: 1 }
  };
  for (const [setter, key] of Object.entries({
    setPreview: "preview", setMainCamera: "mainCamera", setSecondaryPreview: "secondaryPreview",
    setPreviewDirty: "previewDirty", setProgram: "program", setProgramComposition: "programComposition",
    setProgramTransition: "programTransition", setRemoteStreams: "remoteStreams", setSignalStatus: "signalStatus"
  })) state[setter] = value => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  const context = vm.createContext(state);
  const onTrack = source.slice(source.indexOf("onTrack: incomingStream => {") + "onTrack: ".length,
    source.indexOf(",\n\n        onConnectionState", source.indexOf("onTrack: incomingStream => {")));
  state.connect = vm.runInContext(`(${onTrack})`, context);
  for (const [start, end] of [
    ["  function applyProgramComposition(", "  function chooseCompositionMode("],
    ["  function dropCameraOnPreview(", "\n  useEffect(() => {" ]
  ]) {
    const begin = source.indexOf(start);
    vm.runInContext(source.slice(begin, source.indexOf(end, begin)), context);
  }
  return state;
}

test("first phone connects only to Multiview; Preview and Program require separate actions", () => {
  const s = switcher();
  assert.equal(s.mainCamera, null);
  assert.equal(s.secondaryPreview, null);
  s.connect("phone1-stream");
  assert.equal(s.remoteStreams.phone1, "phone1-stream");
  assert.equal(s.preview, null);
  assert.equal(s.programComposition.primary, null);
  s.take();
  assert.equal(s.programComposition.primary, null);
  s.dropCameraOnPreview(1);
  assert.equal(s.preview, 1);
  assert.equal(s.programComposition.primary, null);
  s.take();
  assert.equal(s.programComposition.primary, 1);
  s.take();
  assert.equal(s.programComposition.primary, 1, "No unassigned Main Cam fallback");
});

test("another phone and repeated media tracks never replace prepared Preview or Program", () => {
  const s = switcher();
  s.dropCameraOnPreview(1); s.take(); s.dropCameraOnPreview(2);
  s.camera = { socketId: "phone3", slotId: 3 };
  s.connect("phone3-stream"); s.connect("phone3-reconnected-stream");
  assert.equal(s.preview, 2);
  assert.equal(s.programComposition.primary, 1);
  assert.equal(s.remoteStreams.phone3, "phone3-reconnected-stream");
  s.take();
  assert.equal(s.programComposition.primary, 2);
});

test("first Preview selection works in split mode without an automatic second camera", () => {
  const s = switcher();
  s.compositionMode = "split";
  s.dropCameraOnPreview(2);
  assert.equal(s.preview, 2);
  assert.equal(s.secondaryPreview, null);
  s.dropCameraOnPreview(3);
  assert.equal(s.secondaryPreview, 3);
  s.take();
  assert.equal(s.programComposition.primary, 2);
  assert.equal(s.programComposition.secondary, 3);
});

test("an explicitly assigned Main Cam remains available on a later Take", () => {
  const s = switcher();
  s.mainCamera = 3; s.dropCameraOnPreview(2); s.take();
  assert.equal(s.programComposition.primary, 2);
  s.take();
  assert.equal(s.programComposition.primary, 3);
});
