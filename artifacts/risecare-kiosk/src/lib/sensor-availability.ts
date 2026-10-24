// Maps the frontend sensor toggle ids to the availability keys published by
// the device on `risecare/sensors/availability`.
const SENSOR_AVAILABILITY_ID: Record<string, string> = {
  heartrate: "max30102",
  spo2: "max30102",
  bp: "bp",
  height: "height",
  weight: "weight",
  temperature: "temperature",
};

export interface AvailabilitySyncResult {
  next: Record<string, boolean>;
  disabled: string[];
}

/**
 * Turn off any sensor the device no longer reports as detected.
 *
 * Only acts on a fresh snapshot from a connected device: a disconnected or
 * stale snapshot means "unknown", not "missing", so we leave the enabled
 * state untouched in those cases.
 */
export function disableMissingSensors(
  enabled: Record<string, boolean>,
  availability: Record<string, boolean> | undefined,
  options: { connected?: boolean; stale?: boolean } = {},
): AvailabilitySyncResult {
  const next = { ...enabled };
  const disabled: string[] = [];

  if (!options.connected || options.stale || !availability) {
    return { next, disabled };
  }

  for (const [sensorId, availabilityId] of Object.entries(
    SENSOR_AVAILABILITY_ID,
  )) {
    if (availability[availabilityId] === false && next[sensorId]) {
      next[sensorId] = false;
      disabled.push(sensorId);
    }
  }

  return { next, disabled };
}
