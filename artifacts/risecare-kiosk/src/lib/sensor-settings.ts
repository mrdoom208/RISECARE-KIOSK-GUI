export const SENSOR_SETTING_IDS = [
  "bp",
  "heartrate",
  "spo2",
  "height",
  "weight",
  "temperature",
  "printer",
] as const;

export type SensorSettings = Record<(typeof SENSOR_SETTING_IDS)[number], boolean>;

export function normalizeSensorSettings(value: unknown): SensorSettings {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    SENSOR_SETTING_IDS.map((id) => [id, source[id] === true]),
  ) as SensorSettings;
}

export async function fetchSensorSettings(): Promise<SensorSettings | null> {
  const response = await fetch("/api/sensors/settings");
  if (!response.ok) throw new Error("Failed to load sensor settings");
  const data = await response.json();
  return data.enabledSensors ? normalizeSensorSettings(data.enabledSensors) : null;
}

export async function persistSensorSettings(enabledSensors: unknown): Promise<void> {
  const response = await fetch("/api/sensors/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabledSensors: normalizeSensorSettings(enabledSensors) }),
  });
  if (!response.ok) throw new Error("Failed to save sensor settings");
}
