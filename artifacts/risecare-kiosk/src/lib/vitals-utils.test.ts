import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getBPStatus,
  getHRStatus,
  getSpO2Status,
  getTempStatus,
  getBMIStatus,
  calculateBMI,
} from "./vitals-utils";

// These thresholds drive the medical status patients see on screen; a silent
// regression mislabels a reading as Normal/Critical.

test("blood pressure status boundaries", () => {
  assert.equal(getBPStatus(118, 78), "normal");
  assert.equal(getBPStatus(119, 79), "normal");
  assert.equal(getBPStatus(120, 79), "warning"); // elevated
  assert.equal(getBPStatus(85, 55), "warning"); // hypotension
  assert.equal(getBPStatus(179, 119), "warning");
  assert.equal(getBPStatus(180, 79), "critical");
  assert.equal(getBPStatus(200, 120), "critical"); // diastolic >= 120
  assert.equal(getBPStatus(120, 120), "unknown"); // systolic <= diastolic guard wins
  assert.equal(getBPStatus(null, 80), "unknown");
  assert.equal(getBPStatus(100, 105), "unknown"); // systolic <= diastolic
  assert.equal(getBPStatus(301, 80), "unknown");
});

test("heart rate status boundaries", () => {
  assert.equal(getHRStatus(60), "normal");
  assert.equal(getHRStatus(100), "normal");
  assert.equal(getHRStatus(59), "warning");
  assert.equal(getHRStatus(101), "warning");
  assert.equal(getHRStatus(149), "warning");
  assert.equal(getHRStatus(39), "critical");
  assert.equal(getHRStatus(150), "critical");
  assert.equal(getHRStatus(0), "unknown");
  assert.equal(getHRStatus(301), "unknown");
});

test("SpO2 status boundaries", () => {
  assert.equal(getSpO2Status(95), "normal");
  assert.equal(getSpO2Status(100), "normal");
  assert.equal(getSpO2Status(94), "warning");
  assert.equal(getSpO2Status(91), "warning");
  assert.equal(getSpO2Status(90), "critical");
  assert.equal(getSpO2Status(0), "unknown");
});

test("temperature status boundaries", () => {
  assert.equal(getTempStatus(36), "normal");
  assert.equal(getTempStatus(37.9), "normal");
  assert.equal(getTempStatus(35.9), "warning");
  assert.equal(getTempStatus(38), "warning");
  assert.equal(getTempStatus(39.9), "warning");
  assert.equal(getTempStatus(34.9), "critical");
  assert.equal(getTempStatus(40), "critical");
  assert.equal(getTempStatus(null), "unknown");
});

test("BMI calculation and status", () => {
  assert.equal(calculateBMI(70, 175), 22.9);
  assert.equal(calculateBMI(null, 175), null);
  assert.equal(calculateBMI(70, 0), null);
  assert.equal(getBMIStatus(22.9), "normal");
  assert.equal(getBMIStatus(24.9), "normal");
  assert.equal(getBMIStatus(18.4), "warning");
  assert.equal(getBMIStatus(30), "warning"); // code has no critical tier for BMI
  assert.equal(getBMIStatus(101), "unknown");
});
