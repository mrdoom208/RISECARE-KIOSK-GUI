import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSessions, sanitizeVitals } from "./sync-sanitize";

// A single invalid legacy field must be dropped, not exported, and must not
// block the rest of the sync batch.

test("sanitizeSessions drops invalid ages but keeps valid ones", () => {
  const records = [
    { patientAge: 30, patientGender: "Male" },
    { patientAge: 200, patientGender: "Female" },
    { patientAge: "42", patientGender: "not-a-gender" },
    { patientAge: null, patientGender: null },
  ];
  const dropped = sanitizeSessions(records);
  assert.equal(dropped, 2);
  assert.deepEqual(records[0], { patientAge: 30, patientGender: "Male" });
  assert.equal(records[1].patientAge, null);
  assert.equal(records[2].patientAge, 42); // numeric strings are coerced
  assert.equal(records[2].patientGender, null);
  assert.equal(records[3].patientAge, null);
});

test("sanitizeVitals nulls out-of-range values and keeps in-range ones", () => {
  const records = [
    {
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      bloodPressurePulse: 70,
      heartRate: 72,
      oxygenSaturation: 98,
      temperature: 36.6,
      weight: 70,
      height: 175,
      bmi: 22.9,
    },
    {
      bloodPressureSystolic: 0, // sensor glitch
      oxygenSaturation: 150,
      temperature: 99,
      weight: null,
      height: undefined,
    },
  ];
  const dropped = sanitizeVitals(records);
  assert.equal(dropped, 3);
  assert.equal(records[0].bloodPressureSystolic, 120);
  assert.equal(records[1].bloodPressureSystolic, null);
  assert.equal(records[1].oxygenSaturation, null);
  assert.equal(records[1].temperature, null);
  assert.equal(records[1].weight, null);
  assert.equal(records[1].height, null);
});
