import assert from "node:assert/strict";
import test from "node:test";
import { POPOUT_VIEWS, parseWorkspace, popupFeatures, readWorkspace, safeBounds, isDesktopWindowSupported } from "./popoutWorkspace.js";

test("the workspace only restores explicitly supported monitor views", () => {
  const saved = parseWorkspace(JSON.stringify({ version: 1, views: ["program", "camera-9", "camera-9", "unknown", "__proto__", "main"],
    bounds: { program: { left: -2020, top: 120, width: 1920, height: 1080 } } }));
  assert.deepEqual(saved.views, ["program", "camera-9", "main"]);
  assert.deepEqual(saved.bounds.program, { left: -2020, top: 120, width: 1920, height: 1080 });
  assert.deepEqual(parseWorkspace("{invalid").views, []);
  assert.deepEqual(parseWorkspace({ version: 0, views: ["program"] }).views, []);
  assert.equal(POPOUT_VIEWS.length, 15);
});

test("window coordinates allow a left-side monitor and clamp malicious sizes", () => {
  assert.deepEqual(safeBounds({ left: -1800, top: 44, width: 800, height: 450 }),
    { left: -1800, top: 44, width: 800, height: 450 });
  assert.deepEqual(safeBounds({ left: 10 ** 20, top: -(10 ** 20), width: 0, height: 9999999 }),
    { left: 12000, top: -12000, width: 330, height: 3200 });
  assert.match(popupFeatures({ left: -1440, width: 900 }), /left=-1440/);
});

test("restore is resilient to unavailable browser storage or old schema", () => {
  assert.deepEqual(readWorkspace({ getItem: () => { throw new Error("blocked"); } }).views, []);
  assert.deepEqual(readWorkspace({ getItem: () => JSON.stringify({ version: 1, views: ["preview"] }) }).views, ["preview"]);
});

test("the desktop-only feature stays off in native phone apps", () => {
  const desktop = () => ({ matches: true });
  assert.equal(isDesktopWindowSupported(false, desktop), true);
  assert.equal(isDesktopWindowSupported(true, desktop), false);
  assert.equal(isDesktopWindowSupported(false, () => ({ matches: false })), false);
});

test('display placement uses actual extended-screen coordinates, including left and above', async () => {
  const { boundsForDisplay, windowIsOnDisplay } = await import('./popoutWorkspace.js');
  const left = { availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1080 };
  const above = { availLeft: 0, availTop: -1080, availWidth: 1920, availHeight: 1080 };
  assert.equal(boundsForDisplay(left).left, -1896);
  assert.equal(boundsForDisplay(above).top, -1056);
  assert.equal(windowIsOnDisplay(boundsForDisplay(left), left), true);
  assert.equal(windowIsOnDisplay(boundsForDisplay(left), above), false);
  const smaller = boundsForDisplay({ availLeft: 100, availTop: 20, availWidth: 800, availHeight: 600 }, { width: 2000, height: 1500 });
  assert.deepEqual(smaller, { left: 124, top: 44, width: 752, height: 520 });
});
test('dragging the pop-out header uses screen coordinates across display boundaries', async () => {
  const { draggedWindowPosition } = await import('./popoutWorkspace.js');
  assert.deepEqual(draggedWindowPosition({ left: -1000, top: 100, screenX: -800, screenY: 120 }, { screenX: 300, screenY: 320 }), { left: 100, top: 300 });
});
