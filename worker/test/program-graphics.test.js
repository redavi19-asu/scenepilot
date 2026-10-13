import test from "node:test";
import assert from "node:assert/strict";
import {
  disposeGraphicAsset,
  drawGraphicAsset,
  updateGraphicAsset
} from "../../src/programGraphicAssets.js";

test("uploaded image is drawn in a contained corner logo box rather than fallback text", () => {
  const previousImage = globalThis.Image;
  class FakeImage {
    naturalWidth = 400;
    naturalHeight = 200;
  }
  globalThis.Image = FakeImage;
  try {
    const logo = updateGraphicAsset(null, "blob:uploaded-logo", "image");
    assert.equal(logo.ready, false);
    const draws = [];
    const ctx = { drawImage: (...args) => draws.push(args) };
    assert.equal(drawGraphicAsset(ctx, logo, 10, 20, 80, 80), false);
    logo.element.onload();
    assert.equal(drawGraphicAsset(ctx, logo, 10, 20, 80, 80), true);
    assert.equal(draws.length, 1);
    assert.deepEqual(draws[0].slice(1), [10, 40, 80, 40]);
    assert.equal(updateGraphicAsset(logo, "blob:uploaded-logo", "image"), logo);
    disposeGraphicAsset(logo);
    assert.equal(logo.ready, false);
    assert.equal(logo.element, null);
  } finally {
    globalThis.Image = previousImage;
  }
});

test("logo upload can be a looping, muted video and uses its live frame", () => {
  const previousDocument = globalThis.document;
  let paused = 0;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "video");
      return {
        videoWidth: 1920,
        videoHeight: 1080,
        play: () => Promise.resolve(),
        load: () => {},
        pause: () => { paused++; },
        removeAttribute: () => {}
      };
    }
  };
  try {
    const logo = updateGraphicAsset(null, "blob:logo-video", "video");
    assert.equal(logo.element.muted, true);
    assert.equal(logo.element.loop, true);
    assert.equal(logo.element.playsInline, true);
    logo.element.onloadeddata();
    const draws = [];
    assert.equal(drawGraphicAsset({ drawImage: (...args) => draws.push(args) }, logo, 0, 0, 64, 64), true);
    assert.equal(draws.length, 1);
    assert.ok(draws[0][3] <= 64 && draws[0][4] <= 64);
    disposeGraphicAsset(logo);
    assert.equal(paused, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("changed upload is reloaded, old asset is disposed and topic art can cover a box", () => {
  const previousImage = globalThis.Image;
  class FakeImage { naturalWidth = 100; naturalHeight = 100; }
  globalThis.Image = FakeImage;
  try {
    const first = updateGraphicAsset(null, "blob:first");
    first.element.onload();
    const second = updateGraphicAsset(first, "blob:second");
    assert.equal(first.element, null);
    assert.equal(second.ready, false);
    second.element.onload();
    const draws = [];
    assert.equal(drawGraphicAsset({ drawImage: (...args) => draws.push(args) }, second, 0, 0, 200, 100, "cover"), true);
    assert.deepEqual(draws[0].slice(1), [0, -50, 200, 200]);
    disposeGraphicAsset(second);
  } finally {
    globalThis.Image = previousImage;
  }
});
