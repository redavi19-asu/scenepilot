import assert from "node:assert/strict";
import test from "node:test";
import { sampleRange } from "./soundboardStorage.js";

test("sample trim clamps to decoded audio and rejects empty, reversed or invalid ranges", () => {
  assert.deepEqual(sampleRange(8, 2.5, 5), { start: 2.5, end: 5 });
  assert.deepEqual(sampleRange(8, -1, 20), { start: 0, end: 8 });
  for (const end of [0, 2, NaN, undefined]) assert.throws(() => sampleRange(8, 3, end));
});
