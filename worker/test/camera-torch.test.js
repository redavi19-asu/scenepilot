import test from "node:test";
import assert from "node:assert/strict";
import { cameraConstraints, cameraTorchSupported, queueCameraTrackChange, setTrackTorch } from "../../src/cameraTrackControls.js";

function track({ torch = true, capability = true, apply } = {}) {
  let constraints = { width: { ideal: 1920 }, advanced: [{ zoom: 2, torch }] };
  const settings = { torch, zoom: 2 };
  const calls = [];
  return {
    settings, calls,
    getCapabilities: () => ({ torch: capability }),
    getSettings: () => ({ ...settings }),
    getConstraints: () => constraints,
    async applyConstraints(value) {
      calls.push(value);
      if (apply) await apply(value, settings);
      else {
        const requested = value.torch?.exact ?? value.torch ?? value.advanced?.find(item => 'torch' in item)?.torch;
        if (typeof requested === "boolean") settings.torch = requested;
      }
      constraints = value;
    }
  };
}

test("off explicitly overrides old torch-on constraints and preserves zoom/capture settings", async () => {
  const t = track();
  assert.equal(await setTrackTorch(t, false), false);
  assert.equal(t.settings.torch, false);
  assert.deepEqual(t.calls[0].torch, { exact: false });
  assert.deepEqual(t.calls[0].width, { ideal: 1920 });
  assert.ok(t.calls[0].advanced.some(item => item.zoom === 2));
  assert.ok(t.calls[0].advanced.every(item => item.torch !== true));
});

test("Android-style rejection of exact constraints falls back to boolean off", async () => {
  const t = track({ apply: (value, settings) => {
    if (typeof value.torch === "object") throw new Error("Exact unsupported");
    settings.torch = value.torch;
  } });
  assert.equal(await setTrackTorch(t, false), false);
  assert.equal(t.calls.length, 2);
});

test("an accepted but ignored off request is retried rather than reported successful", async () => {
  const t = track({ apply: (value, settings) => {
    if (value.torch === false) settings.torch = false;
  } });
  assert.equal(await setTrackTorch(t, false), false);
  assert.equal(t.calls.length, 2);
});

test("a light that remains on after all requests reports failure", async () => {
  const t = track({ apply() {} });
  await assert.rejects(setTrackTorch(t, false), /did not turn off/);
  assert.equal(t.settings.torch, true);
});

test("rapid on then off requests finish in order, leaving the light off", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const t = track({ torch: false, apply: async (value, settings) => {
    const desired = value.torch.exact;
    if (desired) await gate;
    settings.torch = desired;
  } });
  const on = setTrackTorch(t, true);
  const off = setTrackTorch(t, false);
  await new Promise(setImmediate);
  assert.equal(t.calls.length, 1, "Off waits for the pending on request");
  release();
  assert.deepEqual(await Promise.all([on, off]), [true, false]);
  assert.equal(t.settings.torch, false);
});

test("zoom retains the selected torch state and removes conflicting old zoom constraints", () => {
  const t = track();
  const merged = cameraConstraints(t, { advanced: [{ zoom: 3 }] });
  assert.deepEqual(merged.advanced, [{ torch: true }, { zoom: 3 }]);
});

test("failed hardware operations do not block later controls", async () => {
  const t = track();
  await assert.rejects(queueCameraTrackChange(t, () => { throw new Error("busy"); }), /busy/);
  assert.equal(await setTrackTorch(t, false), false);
});

test("boolean and sequence torch capabilities are detected, and off remains possible", async () => {
  assert.equal(cameraTorchSupported(track({ capability: [false, true] })), true);
  assert.equal(cameraTorchSupported(track({ capability: [false] })), false);
  const t = track({ capability: false });
  assert.equal(await setTrackTorch(t, false), false);
  await assert.rejects(setTrackTorch(t, true), /unsupported/);
});
