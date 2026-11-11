// Mirror the portal's validation bounds locally. A single bad legacy reading
// must not make the whole batch permanently undeliverable: invalid fields are
// dropped (sent as null) so the rest of the queue still syncs.
// Kept free of database imports so it stays unit-testable.

const SYNC_GENDERS = new Set(["Male", "Female", "Other", "Unknown"]);
const SYNC_VITAL_RANGES: Record<string, [number, number]> = {
  bloodPressureSystolic: [20, 300],
  bloodPressureDiastolic: [10, 200],
  bloodPressurePulse: [10, 300],
  heartRate: [10, 300],
  oxygenSaturation: [0, 100],
  temperature: [28, 45],
  weight: [1, 500],
  height: [20, 250],
  bmi: [5, 100],
};

export function sanitizeSessions(records: Record<string, any>[]): number {
  let dropped = 0;
  for (const session of records) {
    if (session.patientAge !== null && session.patientAge !== undefined) {
      const age = Number(session.patientAge);
      if (!Number.isInteger(age) || age < 0 || age > 150) {
        session.patientAge = null;
        dropped += 1;
      } else {
        session.patientAge = age;
      }
    }
    if (session.patientGender != null && !SYNC_GENDERS.has(String(session.patientGender))) {
      session.patientGender = null;
      dropped += 1;
    }
  }
  return dropped;
}

export function sanitizeVitals(records: Record<string, any>[]): number {
  let dropped = 0;
  for (const vital of records) {
    for (const [field, [min, max]] of Object.entries(SYNC_VITAL_RANGES)) {
      const value = vital[field];
      if (value === null || value === undefined) {
        vital[field] = null;
        continue;
      }
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
        vital[field] = null;
        dropped += 1;
      } else {
        vital[field] = numeric;
      }
    }
  }
  return dropped;
}
