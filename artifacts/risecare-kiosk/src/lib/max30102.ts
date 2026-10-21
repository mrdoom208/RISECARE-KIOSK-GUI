/**
 * Helpers for the MAX30102 (pulse oximeter) live reading.
 *
 * The device publishes one payload per second on `risecare/sensors/vitals`.
 * The payload always carries the finger state and the validity flags, and only
 * carries `bpm` / `spo2` once the driver considers the measurement usable.
 */

export const MAX30102_SENSOR_ID = "heartrate";

export interface Max30102Reading {
  sessionId?: number | string | null;
  bpm?: number;
  spo2?: number;
  hrValid?: boolean;
  spo2Valid?: boolean;
  fingerDetected?: boolean;
  quality?: number;
  timestamp?: number;
}

/**
 * What the kiosk knows about the finger on the sensor.
 *
 * - `unknown`: the device has not reported anything yet
 * - `absent`: the device reported that no finger is on the sensor
 * - `present`: the device reported a finger on the sensor
 */
export type FingerState = "unknown" | "absent" | "present";

export function getFingerState(reading: unknown): FingerState {
  if (!reading || typeof reading !== "object") return "unknown";
  const detected = (reading as Max30102Reading).fingerDetected;
  if (detected === true) return "present";
  if (detected === false) return "absent";
  return "unknown";
}

/**
 * Pulse rate in bpm, or `null` when the reading is not valid.
 *
 * Payloads from firmware that predates the validity flags are accepted as
 * long as they carry a plausible value.
 */
export function readValidPulseRate(reading: unknown): number | null {
  if (!reading || typeof reading !== "object") return null;
  const data = reading as Max30102Reading;
  if (data.hrValid === false) return null;
  const bpm = Number(data.bpm);
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  return bpm;
}

/** SpO2 in percent, or `null` when the reading is not valid. */
export function readValidSpo2(reading: unknown): number | null {
  if (!reading || typeof reading !== "object") return null;
  const data = reading as Max30102Reading;
  if (data.spo2Valid === false) return null;
  const spo2 = Number(data.spo2);
  if (!Number.isFinite(spo2) || spo2 <= 0) return null;
  return spo2;
}

export interface Max30102Sample {
  kind: "hr" | "spo2";
  value: number;
}

/**
 * The measurement the stability run should follow.
 *
 * The pulse rate is the primary measurement, but the driver can reject it for
 * an irregular rhythm even when the SpO2 is usable. Falling back to the SpO2
 * keeps the kiosk from blocking on a reading that will never settle.
 */
export function max30102StabilitySample(
  reading: unknown,
): Max30102Sample | null {
  const pulseRate = readValidPulseRate(reading);
  if (pulseRate != null) return { kind: "hr", value: pulseRate };
  const spo2 = readValidSpo2(reading);
  if (spo2 != null) return { kind: "spo2", value: spo2 };
  return null;
}

/**
 * Whether two consecutive samples are close enough to count as the same
 * measurement. A change of measurement kind restarts the run.
 */
export function isSameStableMeasurement(
  prev: Max30102Sample | null | undefined,
  curr: Max30102Sample | null | undefined,
): boolean {
  if (!prev || !curr) return false;
  if (prev.kind !== curr.kind) return false;
  const tolerance = curr.kind === "hr" ? 3 : 2;
  return Math.abs(curr.value - prev.value) <= tolerance;
}
