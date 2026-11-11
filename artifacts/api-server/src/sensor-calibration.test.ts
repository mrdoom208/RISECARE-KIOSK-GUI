import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWeightCalibration, normalizeHeightOffset } from "./sensor-calibration";

// These bounds guard raw hardware values that drive medical readings; a bad
// value must be rejected, not clamped.

test("normalizeWeightCalibration accepts valid raw pairs", () => {
  assert.deepEqual(normalizeWeightCalibration({ offsetRaw: -12345, perKgRaw: 28205 }), { offsetRaw: -12345, perKgRaw: 28205 });
  assert.deepEqual(normalizeWeightCalibration({ offsetRaw: 0, perKgRaw: 28205 }), { offsetRaw: 0, perKgRaw: 28205 });
  assert.deepEqual(normalizeWeightCalibration({ offsetRaw: 123.7, perKgRaw: 30000.2 }), { offsetRaw: 124, perKgRaw: 30000 });
});

test("normalizeWeightCalibration rejects invalid pairs", () => {
  assert.equal(normalizeWeightCalibration(null), null);
  assert.equal(normalizeWeightCalibration("nope"), null);
  assert.equal(normalizeWeightCalibration([1, 2]), null);
  assert.equal(normalizeWeightCalibration({ offsetRaw: "5", perKgRaw: 28205 }), null);
  assert.equal(normalizeWeightCalibration({ offsetRaw: 5 }), null);
  assert.equal(normalizeWeightCalibration({ offsetRaw: 9000000, perKgRaw: 28205 }), null);
  assert.equal(normalizeWeightCalibration({ offsetRaw: 5, perKgRaw: 0 }), null);
  assert.equal(normalizeWeightCalibration({ offsetRaw: Number.NaN, perKgRaw: 28205 }), null);
});

test("normalizeHeightOffset accepts and rounds valid offsets", () => {
  assert.equal(normalizeHeightOffset(0), 0);
  assert.equal(normalizeHeightOffset(-50), -50);
  assert.equal(normalizeHeightOffset(50), 50);
  assert.equal(normalizeHeightOffset(1.234), 1.23);
});

test("normalizeHeightOffset rejects out-of-range and non-numeric values", () => {
  assert.equal(normalizeHeightOffset(50.01), null);
  assert.equal(normalizeHeightOffset(-50.5), null);
  assert.equal(normalizeHeightOffset("3"), null);
  assert.equal(normalizeHeightOffset(null), null);
  assert.equal(normalizeHeightOffset(Number.POSITIVE_INFINITY), null);
});
