import { Router, type IRouter } from "express";
import crypto from "crypto";
import { query, run } from "@workspace/db";
import { logger } from "../logger";
import { publish, subscribe, isConnected, onMQTTConnected } from "../mqtt";
import { logSystem } from "../system-log";
import { getTransactionTags } from "../device";
const SENSOR_SETTING_IDS = ["bp", "heartrate", "spo2", "height", "weight", "temperature", "printer"] as const;
const BP_RATIO_DEFAULTS = { systolic: 0.45, diastolic: 0.85 };
const TEMPERATURE_OFFSET_DEFAULT = 3.4;
const TEMPERATURE_OFFSET_MIN = -20;
const TEMPERATURE_OFFSET_MAX = 20;

function normalizeTemperatureOffset(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < TEMPERATURE_OFFSET_MIN || value > TEMPERATURE_OFFSET_MAX) return null;
  return Math.round(value * 100) / 100;
}

function normalizeBpRatios(value: unknown): { systolic: number; diastolic: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ratios = value as Record<string, unknown>;
  const systolic = ratios.systolic;
  const diastolic = ratios.diastolic;
  if (typeof systolic !== "number" || typeof diastolic !== "number"
      || !Number.isFinite(systolic) || !Number.isFinite(diastolic)
      || systolic < 0.2 || systolic > 0.7
      || diastolic < 0.6 || diastolic > 1.0
      || systolic >= diastolic) return null;
  return { systolic, diastolic };
}

async function getSavedBpRatios() {
  const rows = await query("SELECT value FROM settings WHERE key = 'bp_ratios'");
  if (!rows?.[0]?.value) return BP_RATIO_DEFAULTS;
  try {
    return normalizeBpRatios(JSON.parse(rows[0].value)) ?? BP_RATIO_DEFAULTS;
  } catch {
    return BP_RATIO_DEFAULTS;
  }
}

async function getSavedTemperatureOffset(): Promise<number> {
  const rows = await query("SELECT value FROM settings WHERE key = 'temperature_offset'");
  if (!rows?.[0]?.value) return TEMPERATURE_OFFSET_DEFAULT;
  try {
    return normalizeTemperatureOffset(JSON.parse(rows[0].value)) ?? TEMPERATURE_OFFSET_DEFAULT;
  } catch {
    return TEMPERATURE_OFFSET_DEFAULT;
  }
}

const SENSOR_DEBUG = process.env.SENSOR_DEBUG === "1";

// The portal validates readings against sane clinical bounds. A sensor glitch
// that publishes 0 (or an absurd value) must never be stored and then block
// the whole sync queue, so only store values inside these ranges.
const VITAL_RANGES: Record<string, [number, number]> = {
  blood_pressure_systolic: [20, 300],
  blood_pressure_diastolic: [10, 200],
  blood_pressure_pulse: [10, 300],
  heart_rate: [10, 300],
  oxygen_saturation: [0, 100],
  temperature: [28, 45],
  weight: [1, 500],
  height: [20, 250],
};

function inRange(value: unknown, column: string): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  const range = VITAL_RANGES[column];
  if (!range || !Number.isFinite(numeric)) return null;
  return numeric >= range[0] && numeric <= range[1] ? numeric : null;
}

// Routine per-reading output is useful while developing the hardware bridge,
// but on a kiosk it prints continuously and can contain patient measurements.
// Enable it explicitly with SENSOR_DEBUG=1 when it is actually needed.
function sensorDebug(...args: unknown[]): void {
  if (SENSOR_DEBUG) logger.debug("Sensor", "Sensor diagnostic", { values: args });
}

const AVAILABILITY_SENSORS: { id: string; label: string }[] = [
  { id: "max30102", label: "MAX30102" },
  { id: "bp", label: "Blood pressure" },
  { id: "height", label: "Height" },
  { id: "weight", label: "Weight" },
  { id: "temperature", label: "Temperature" },
];

function printerCondition(printer: any): string {
  if (!printer || typeof printer !== "object" || printer.connected !== true) {
    return "disconnected";
  }
  if (printer.paper === false || printer.paperStatus === "empty") return "paper out";
  return printer.paperStatus === "low" ? "low paper" : "ready";
}

function logAvailabilityChanges(previous: Record<string, any> | null, next: Record<string, any>): void {
  if (!previous) {
    const detected = AVAILABILITY_SENSORS.filter((sensor) => next[sensor.id] === true).map(
      (sensor) => sensor.id,
    );
    const notDetected = AVAILABILITY_SENSORS.filter(
      (sensor) => next[sensor.id] === false,
    ).map((sensor) => sensor.id);
    void logSystem("INFO", "Sensor", "Sensor availability initialised", {
      detected,
      notDetected,
      printer: printerCondition(next.printer),
    });
    return;
  }

  for (const sensor of AVAILABILITY_SENSORS) {
    const before = previous[sensor.id];
    const after = next[sensor.id];
    if (typeof after !== "boolean" || before === after) continue;
    void logSystem(
      after ? "INFO" : "WARNING",
      "Sensor",
      `${sensor.label} sensor ${after ? "detected" : "unavailable"}`,
      { sensor: sensor.id, wasAvailable: before === true, available: after },
    );
  }

  const beforePrinter = previous.printer;
  const nextPrinter = next.printer;
  if (JSON.stringify(beforePrinter) === JSON.stringify(nextPrinter)) return;

  const wasConnected = beforePrinter?.connected === true;
  const isConnectedNow = nextPrinter?.connected === true;
  if (wasConnected !== isConnectedNow) {
    void logSystem(
      isConnectedNow ? "INFO" : "WARNING",
      "Sensor",
      isConnectedNow ? "Printer connected" : "Printer unavailable",
      { connected: isConnectedNow, condition: printerCondition(nextPrinter) },
    );
  }

  if (
    wasConnected === isConnectedNow &&
    isConnectedNow &&
    (beforePrinter?.paper !== nextPrinter?.paper ||
      beforePrinter?.paperStatus !== nextPrinter?.paperStatus)
  ) {
    const condition = printerCondition(nextPrinter);
    void logSystem(
      condition === "ready" ? "INFO" : "WARNING",
      "Sensor",
      condition === "ready"
        ? "Printer ready"
        : condition === "paper out"
          ? "Printer paper out"
          : condition === "low paper"
            ? "Printer paper low"
            : "Printer status changed",
      {
        connected: true,
        paper: nextPrinter?.paper,
        paperStatus: nextPrinter?.paperStatus,
      },
    );
  }
}

const router: IRouter = Router();

onMQTTConnected(async () => {
  try {
    const rows = await query("SELECT key, value FROM settings WHERE key IN ('enabled_sensors', 'bp_ratios', 'temperature_offset')");
    const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    let enabledSensors = {};
    let bpRatios = BP_RATIO_DEFAULTS;
    let temperatureOffset = TEMPERATURE_OFFSET_DEFAULT;
    try {
      enabledSensors = saved.enabled_sensors ? JSON.parse(saved.enabled_sensors) : {};
    } catch { /* Send defaults if the stored preference is malformed. */ }
    try {
      bpRatios = saved.bp_ratios
        ? normalizeBpRatios(JSON.parse(saved.bp_ratios)) ?? BP_RATIO_DEFAULTS
        : BP_RATIO_DEFAULTS;
    } catch { /* Send defaults if the stored ratio is malformed. */ }
    try {
      temperatureOffset = saved.temperature_offset
        ? normalizeTemperatureOffset(JSON.parse(saved.temperature_offset)) ?? TEMPERATURE_OFFSET_DEFAULT
        : TEMPERATURE_OFFSET_DEFAULT;
    } catch { /* Send defaults if the stored offset is malformed. */ }
    publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors,
      bpRatios,
      temperatureOffset,
    }, { retain: true });
  } catch (error) {
    logger.error(
      "Sensor",
      "Could not synchronize saved sensor settings over MQTT",
      error,
    );
    void logSystem("ERROR", "Sensor", "Could not synchronize saved sensor settings over MQTT", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get("/sensors/settings", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'enabled_sensors'");
    res.json({ enabledSensors: rows?.[0]?.value ? JSON.parse(rows[0].value) : null });
  } catch {
    res.status(500).json({ error: "Failed to read sensor settings" });
  }
});

router.put("/sensors/settings", async (req, res) => {
  const enabledSensors = req.body?.enabledSensors;
  if (!enabledSensors || typeof enabledSensors !== "object" || Array.isArray(enabledSensors)) {
    res.status(400).json({ error: "enabledSensors object required" });
    return;
  }
  if (SENSOR_SETTING_IDS.some((id) => typeof enabledSensors[id] !== "boolean")) {
    res.status(400).json({ error: "All sensor settings must be boolean values" });
    return;
  }

  try {
    const normalized = Object.fromEntries(
      SENSOR_SETTING_IDS.map((id) => [id, enabledSensors[id]]),
    );
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('enabled_sensors', ?)", [JSON.stringify(normalized)]);
    const bpRatios = await getSavedBpRatios();
    const temperatureOffset = await getSavedTemperatureOffset();
    const hardwareSynced = publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors: normalized,
      bpRatios,
      temperatureOffset,
    }, { retain: true });
    void logSystem("INFO", "Sensor", "Sensor settings updated", {
      hardwareSynced,
      enabledSensors: Object.entries(normalized)
        .filter(([, enabled]) => enabled)
        .map(([sensor]) => sensor),
    });
    res.json({ success: true, enabledSensors: normalized, hardwareSynced });
  } catch (error) {
    logger.error("Sensor", "Could not save sensor settings", error);
    void logSystem("ERROR", "Sensor", "Could not save sensor settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to save sensor settings" });
  }
});

router.get("/sensors/bp-ratios", async (_req, res) => {
  try {
    res.json({ bpRatios: await getSavedBpRatios() });
  } catch {
    res.status(500).json({ error: "Failed to read blood pressure ratios" });
  }
});

router.put("/sensors/bp-ratios", async (req, res) => {
  const bpRatios = normalizeBpRatios(req.body?.bpRatios);
  if (!bpRatios) {
    res.status(400).json({
      error: "SYS ratio must be 0.20–0.70, DIA ratio must be 0.60–1.00, and SYS must be lower than DIA",
    });
    return;
  }
  try {
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('bp_ratios', ?)", [JSON.stringify(bpRatios)]);
    const enabledRows = await query("SELECT value FROM settings WHERE key = 'enabled_sensors'");
    let enabledSensors = {};
    try {
      enabledSensors = enabledRows?.[0]?.value ? JSON.parse(enabledRows[0].value) : {};
    } catch { /* Continue with defaults for enabled sensors. */ }
    const temperatureOffset = await getSavedTemperatureOffset();
    const hardwareSynced = publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors,
      bpRatios,
      temperatureOffset,
    }, { retain: true });
    void logSystem("INFO", "Sensor", "Blood pressure ratios updated", { ...bpRatios, hardwareSynced });
    res.json({ success: true, bpRatios, hardwareSynced });
  } catch (error) {
    logger.error("Sensor", "Could not save blood pressure ratios", error);
    res.status(500).json({ error: "Failed to save blood pressure ratios" });
  }
});

router.get("/sensors/temperature-offset", async (_req, res) => {
  try {
    res.json({ temperatureOffset: await getSavedTemperatureOffset() });
  } catch {
    res.status(500).json({ error: "Failed to read temperature offset" });
  }
});

router.put("/sensors/temperature-offset", async (req, res) => {
  const temperatureOffset = normalizeTemperatureOffset(req.body?.temperatureOffset);
  if (temperatureOffset === null) {
    res.status(400).json({
      error: `Temperature offset must be between ${TEMPERATURE_OFFSET_MIN} and ${TEMPERATURE_OFFSET_MAX} °C`,
    });
    return;
  }
  try {
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('temperature_offset', ?)", [JSON.stringify(temperatureOffset)]);
    const enabledRows = await query("SELECT value FROM settings WHERE key = 'enabled_sensors'");
    let enabledSensors = {};
    try {
      enabledSensors = enabledRows?.[0]?.value ? JSON.parse(enabledRows[0].value) : {};
    } catch { /* Continue with defaults for enabled sensors. */ }
    const bpRatios = await getSavedBpRatios();
    const hardwareSynced = publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors,
      bpRatios,
      temperatureOffset,
    }, { retain: true });
    void logSystem("INFO", "Sensor", "Temperature offset updated", { temperatureOffset, hardwareSynced });
    res.json({ success: true, temperatureOffset, hardwareSynced });
  } catch (error) {
    logger.error("Sensor", "Could not save temperature offset", error);
    res.status(500).json({ error: "Failed to save temperature offset" });
  }
});

async function saveSensorValue(sessionId: number, column: string, value: number) {
  const safeValue = inRange(value, column);
  if (safeValue === null) {
    logger.warn("Sensor", "Ignored out-of-range sensor reading", { column });
    return;
  }

  const existing = await query(
    `SELECT id FROM vital_readings WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );

  const tags = await getTransactionTags();
  if (existing[0]) {
    // Touch sync_status so a reading edited after an earlier sync is exported
    // again, and backfill a stable source id if this row predates the sync
    // columns.
    await run(
      `UPDATE vital_readings SET ${column} = ?,
         source_vital_id = COALESCE(NULLIF(source_vital_id, ''), ?),
         device_uid = ?, kiosk_id = ?,
         sync_status = 'pending', payload_id = NULL,
         recorded_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [safeValue, crypto.randomUUID(), tags.deviceUid, tags.kioskId, existing[0].id]
    );
  } else {
    await run(
      `INSERT INTO vital_readings (session_id, ${column}, source_vital_id, device_uid, kiosk_id)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, safeValue, crypto.randomUUID(), tags.deviceUid, tags.kioskId]
    );
  }
}

// In-memory stores
let latestReadings: Record<string, any> = {};
let calibrationResults: Record<string, any> = {};
let calibrationProgress: Record<string, any> = {};
let testResults: Record<string, any> = {};
let sensorAvailability: Record<string, any> = {};
let sensorAvailabilityAt = 0;
let hasAvailabilitySnapshot = false;
let availabilityStaleLogged = false;

// The hardware process re-advertises every 10s; three missed cycles means the
// snapshot can no longer be trusted to reflect what is plugged in.
const AVAILABILITY_STALE_MS = 30_000;
const availabilityStartedAt = Date.now();

// Record one stale warning per outage, not one per poll. The next availability
// message re-arms this so a recovered then failing sensor is logged again.
const availabilityWatchdog = setInterval(() => {
  if (availabilityStaleLogged) return;
  const staleForMs = sensorAvailabilityAt
    ? Date.now() - sensorAvailabilityAt
    : Date.now() - availabilityStartedAt;
  if (staleForMs <= AVAILABILITY_STALE_MS) return;
  availabilityStaleLogged = true;
  void logSystem(
    "WARNING",
    "Sensor",
    sensorAvailabilityAt
      ? "Sensor availability is stale"
      : "No sensor availability received",
    {
      staleSeconds: Math.round(staleForMs / 1000),
      lastReceivedAt: sensorAvailabilityAt
        ? new Date(sensorAvailabilityAt).toISOString()
        : null,
    },
  );
}, 10_000);
availabilityWatchdog.unref?.();

// Test-all state
let testAllState: {
  sessionId: string;
  sensors: string[];
  results: Record<string, { status: string; sensor: string; receivedAt: number }>;
  startedAt: number;
  completed: boolean;
  summary: Record<string, string>;
} | null = null;

// Subscribe to sensor data from Python
subscribe("risecare/sensors/bp", async (data) => {
  latestReadings["bp"] = { ...data, _receivedAt: Date.now() };
  const systolic = inRange(data.systolic, "blood_pressure_systolic");
  const diastolic = inRange(data.diastolic, "blood_pressure_diastolic");
  const pulseRate = inRange(data.pulseRate, "blood_pressure_pulse");
  if (data.status === "success" && data.sessionId &&
      systolic !== null && diastolic !== null && pulseRate !== null &&
      systolic > diastolic) {
    const existing = await query(
      `SELECT id FROM vital_readings WHERE session_id = ? LIMIT 1`,
      [data.sessionId]
    );
    const tags = await getTransactionTags();
    if (existing[0]) {
      await run(
        `UPDATE vital_readings SET blood_pressure_systolic = ?, blood_pressure_diastolic = ?, blood_pressure_pulse = ?,
           source_vital_id = COALESCE(NULLIF(source_vital_id, ''), ?),
           device_uid = ?, kiosk_id = ?,
           sync_status = 'pending', payload_id = NULL,
           recorded_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [systolic, diastolic, pulseRate, crypto.randomUUID(), tags.deviceUid, tags.kioskId, existing[0].id]
      );
    } else {
      await run(
        `INSERT INTO vital_readings (session_id, blood_pressure_systolic, blood_pressure_diastolic, blood_pressure_pulse,
           source_vital_id, device_uid, kiosk_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.sessionId, systolic, diastolic, pulseRate, crypto.randomUUID(), tags.deviceUid, tags.kioskId]
      );
    }
    sensorDebug("💾 BP saved from sensor:", data);
  }
});

subscribe("risecare/sensors/vitals", async (data) => {
  latestReadings["heartrate"] = { ...data, _receivedAt: Date.now() };
  latestReadings["spo2"] = { ...data, _receivedAt: Date.now() };
  if (data.sessionId) {
    // The MAX30102 publishes on every tick, with or without a measurement, so
    // the kiosk can tell "no finger yet" apart from "reading not settled".
    // Only a reading the driver marked as valid may be stored.
    const hrValid = data.hrValid ?? data.bpm != null;
    const spo2Valid = data.spo2Valid ?? data.spo2 != null;
    const bpm = inRange(data.bpm, "heart_rate");
    const spo2 = inRange(data.spo2, "oxygen_saturation");

    if (hrValid && bpm !== null) {
      await saveSensorValue(data.sessionId, "heart_rate", bpm);
      sensorDebug("💾 Heart rate saved from combined:", data);
    }
    if (spo2Valid && spo2 !== null) {
      await saveSensorValue(data.sessionId, "oxygen_saturation", spo2);
      sensorDebug("💾 SpO2 saved from combined:", data);
    }
  }
});

subscribe("risecare/sensors/temperature", async (data) => {
  latestReadings["temperature"] = { ...data, _receivedAt: Date.now() };
  const celsius = inRange(data.celsius, "temperature");
  if (data.sessionId && celsius !== null) {
    await saveSensorValue(data.sessionId, "temperature", celsius);
    sensorDebug("💾 Temperature saved from sensor:", data);
  }
});

subscribe("risecare/sensors/weight", async (data) => {
  latestReadings["weight"] = { ...data, _receivedAt: Date.now() };
  const kg = inRange(data.kg, "weight");
  if (data.sessionId && kg !== null) {
    await saveSensorValue(data.sessionId, "weight", kg);
    sensorDebug("💾 Weight saved from sensor:", data);
  }
});

subscribe("risecare/sensors/height", async (data) => {
  latestReadings["height"] = { ...data, _receivedAt: Date.now() };
  const cm = inRange(data.cm, "height");
  if (data.sessionId && cm !== null) {
    await saveSensorValue(data.sessionId, "height", cm);
    sensorDebug("💾 Height saved from sensor:", data);
  }
});

subscribe("risecare/sensors/availability", async (data) => {
  const previous = hasAvailabilitySnapshot ? sensorAvailability : null;
  const wasStale = availabilityStaleLogged;
  const staleForSeconds =
    wasStale && sensorAvailabilityAt
      ? Math.round((Date.now() - sensorAvailabilityAt) / 1000)
      : null;

  sensorAvailability = data;
  sensorAvailabilityAt = Date.now();
  hasAvailabilitySnapshot = true;
  availabilityStaleLogged = false;

  if (wasStale) {
    void logSystem("INFO", "Sensor", "Sensor availability restored", {
      staleSeconds: staleForSeconds,
    });
  }

  logAvailabilityChanges(previous, data);
  sensorDebug("Sensor availability update", data);
});

subscribe("risecare/calibration/progress/+", async (data, topic) => {
  const sensor = topic?.split("/").pop();
  if (sensor) {
    calibrationProgress[sensor] = { ...data, _receivedAt: Date.now() };
    sensorDebug(`Calibration progress [${sensor}]:`, data);
  }
});

subscribe("risecare/test/+", async (data, topic) => {
  const sensor = topic?.split("/").pop();
  if (sensor) {
    testResults[sensor] = { ...data, _receivedAt: Date.now() };
    sensorDebug(`🧪 Test result [${sensor}]:`, data);

    // Feed into test-all state
    if (testAllState && !testAllState.completed && testAllState.sensors.includes(sensor)) {
      testAllState.results[sensor] = { ...data, receivedAt: Date.now() };

      // Check if all sensors have results
      if (Object.keys(testAllState.results).length === testAllState.sensors.length) {
        completeTestAll();
      }
    }
  }
});

subscribe("risecare/calibration/height", async (data) => {
  sensorDebug("📏 Height calibration result:", data);
  calibrationResults["height"] = { ...data, _receivedAt: Date.now() };
});

subscribe("risecare/calibration/weight", async (data) => {
  sensorDebug("⚖️ Weight calibration result:", data);
  calibrationResults["weight"] = { ...data, _receivedAt: Date.now() };
});

// Complete test-all and publish MQTT summary
function completeTestAll() {
  if (!testAllState || testAllState.completed) return;
  testAllState.completed = true;

  const summary: Record<string, string> = {};
  for (const sensor of testAllState.sensors) {
    const result = testAllState.results[sensor];
    summary[sensor] = result?.status === "success" ? "working" : "not_working";
  }
  testAllState.summary = summary;

  publish("risecare/test/summary", {
    sensors: summary,
    sessionId: testAllState.sessionId,
    timestamp: new Date().toISOString(),
  });
  sensorDebug("📋 Test-all summary:", summary);
  void logSystem("INFO", "Sensor", "Sensor test-all completed", {
    sensors: Object.entries(summary).map(([sensor, status]) => `${sensor}: ${status}`),
  });
}

// API endpoint to test all enabled sensors sequentially
router.post("/sensors/test-all", async (req, res) => {
  const { sessionId, sensors: sensorIds } = req.body;

  if (!sessionId || !sensorIds?.length) {
    res.status(400).json({ error: "sessionId and sensors array required" });
    return;
  }

  if (!isConnected()) {
    void logSystem("WARNING", "Sensor", "Sensor test-all failed: MQTT not connected");
    res.status(500).json({ error: "MQTT not connected" });
    return;
  }

  testAllState = {
    sessionId,
    sensors: sensorIds,
    results: {},
    startedAt: Date.now(),
    completed: false,
    summary: {},
  };

  // Send test commands staggered by 2 seconds
  sensorIds.forEach((sensor: string, index: number) => {
    setTimeout(() => {
      publish(`risecare/command/${sensor}`, {
        sessionId,
        sensor,
        value: 3,
        timestamp: new Date().toISOString(),
      });
    }, index * 2000);
  });

  // Set timeout to force-complete if some sensors don't respond
  const totalTime = sensorIds.length * 2000 + 14000;
  setTimeout(() => {
    if (testAllState && !testAllState.completed) {
      completeTestAll();
    }
  }, totalTime);

  res.json({ status: "started", sensorCount: sensorIds.length });
});

// Get test-all results
router.get("/sensors/test-all-results", async (_req, res) => {
  res.json(testAllState);
});

// API endpoint to send sensor command (start=1 / stop=0)
router.post("/sensors/command", async (req, res) => {
  const { sessionId, sensor, value, knownWeightGrams } = req.body;

  if (!sessionId || !sensor || value === undefined) {
    res.status(400).json({ error: "sessionId, sensor, and value required" });
    return;
  }

  const sent = publish(`risecare/command/${sensor}`, {
    sessionId,
    sensor,
    value,
    knownWeightGrams,
    timestamp: new Date().toISOString(),
  });

  if (sent) {
    res.json({ status: "sent", sensor, sessionId, value });
  } else {
    void logSystem("WARNING", "Sensor", "Sensor command failed: MQTT not connected", {
      sensor,
    });
    res.status(500).json({ error: "MQTT not connected" });
  }
});

// API endpoint to trigger sensor reading (for testing or kiosk buttons)
router.post("/sensors/trigger", async (req, res) => {
  const { sessionId, sensor } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  // Publish trigger message to Python to start sensor reading
  const triggered = publish(`risecare/trigger/${sensor}`, {
    sessionId,
    sensor,
    timestamp: new Date().toISOString(),
  });

  if (triggered) {
    res.json({ status: "triggered", sensor, sessionId });
  } else {
    void logSystem("WARNING", "Sensor", "Sensor trigger failed: MQTT not connected", {
      sensor,
    });
    res.status(500).json({ error: "MQTT not connected" });
  }
});

// Get sensor status
router.get("/sensors/status", async (_req, res) => {
  res.json({
    connected: isConnected(),
    mqttDisabled: process.env.NO_MQTT === "1",
    broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
    sensors: sensorAvailability,
    sensorsUpdatedAt: sensorAvailabilityAt || null,
    sensorsStale:
      sensorAvailabilityAt === 0 ||
      Date.now() - sensorAvailabilityAt > AVAILABILITY_STALE_MS,
  });
});

// Ask the hardware process to re-probe sensors and re-publish availability
router.post("/sensors/refresh", async (_req, res) => {
  const sent = publish("risecare/command/status", {
    sensor: "status",
    timestamp: new Date().toISOString(),
  });

  if (sent) {
    res.json({ status: "requested" });
  } else {
    void logSystem("WARNING", "Sensor", "Sensor refresh failed: MQTT not connected");
    res.status(500).json({ error: "MQTT not connected" });
  }
});

// Reset all calibration data
router.post("/sensors/calibration/reset", async (req, res) => {
  calibrationResults = {};
  calibrationProgress = {};
  publish("risecare/command/calibration", {
    sessionId: req.body.sessionId,
    sensor: "calibration",
    value: 99,
    timestamp: new Date().toISOString(),
  });
  res.json({ status: "ok" });
});

// Get latest calibration result
router.get("/sensors/calibration", async (_req, res) => {
  res.json(calibrationResults);
});

// Get latest calibration progress
router.get("/sensors/calibration-progress", async (_req, res) => {
  res.json(calibrationProgress);
});

// Get latest sensor readings (for live preview)
router.get("/sensors/latest-readings", async (_req, res) => {
  res.json(latestReadings);
});

// Get test results
router.get("/sensors/test-results", async (_req, res) => {
  res.json(testResults);
});

export default router;
