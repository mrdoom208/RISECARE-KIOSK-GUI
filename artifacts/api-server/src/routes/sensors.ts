import { Router, type IRouter } from "express";
import { query, run } from "@workspace/db";
import { publish, subscribe, isConnected, onMQTTConnected } from "../mqtt";
import { logSystem } from "../system-log";
const SENSOR_SETTING_IDS = ["bp", "heartrate", "spo2", "height", "weight", "temperature", "printer"] as const;

const SENSOR_DEBUG = process.env.SENSOR_DEBUG === "1";

// Routine per-reading output is useful while developing the hardware bridge,
// but on a kiosk it prints continuously and can contain patient measurements.
// Enable it explicitly with SENSOR_DEBUG=1 when it is actually needed.
function sensorDebug(...args: unknown[]): void {
  if (SENSOR_DEBUG) console.log(...args);
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
    const rows = await query("SELECT value FROM settings WHERE key = 'enabled_sensors'");
    if (!rows?.[0]?.value) return;
    publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors: JSON.parse(rows[0].value),
    }, { retain: true });
  } catch (error) {
    console.error("Failed to sync saved sensor settings over MQTT:", error);
    void logSystem("ERROR", "Sensor", "Failed to sync saved sensor settings over MQTT", {
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
    const hardwareSynced = publish("risecare/command/settings", {
      sensor: "settings",
      enabledSensors: normalized,
    }, { retain: true });
    void logSystem("INFO", "Sensor", "Sensor settings updated", {
      hardwareSynced,
      enabledSensors: Object.entries(normalized)
        .filter(([, enabled]) => enabled)
        .map(([sensor]) => sensor),
    });
    res.json({ success: true, enabledSensors: normalized, hardwareSynced });
  } catch (error) {
    console.error("Failed to save sensor settings:", error);
    void logSystem("ERROR", "Sensor", "Failed to save sensor settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Failed to save sensor settings" });
  }
});

async function saveSensorValue(sessionId: number, column: string, value: number) {
  const existing = await query(
    `SELECT id FROM vital_readings WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );

  if (existing[0]) {
    await run(
      `UPDATE vital_readings SET ${column} = ?, recorded_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [value, existing[0].id]
    );
  } else {
    await run(
      `INSERT INTO vital_readings (session_id, ${column}) VALUES (?, ?)`,
      [sessionId, value]
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
  const systolic = Number(data.systolic);
  const diastolic = Number(data.diastolic);
  const pulseRate = Number(data.pulseRate);
  if (data.status === "success" && data.sessionId &&
      Number.isFinite(systolic) && Number.isFinite(diastolic) &&
      systolic > diastolic && systolic <= 300 && diastolic >= 0 &&
      Number.isFinite(pulseRate) && pulseRate > 0 && pulseRate <= 300) {
    const existing = await query(
      `SELECT id FROM vital_readings WHERE session_id = ? LIMIT 1`,
      [data.sessionId]
    );
    if (existing[0]) {
      await run(
        `UPDATE vital_readings SET blood_pressure_systolic = ?, blood_pressure_diastolic = ?, blood_pressure_pulse = ?, recorded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [systolic, diastolic, pulseRate, existing[0].id]
      );
    } else {
      await run(
        `INSERT INTO vital_readings (session_id, blood_pressure_systolic, blood_pressure_diastolic, blood_pressure_pulse) VALUES (?, ?, ?, ?)`,
        [data.sessionId, systolic, diastolic, pulseRate]
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

    if (hrValid && data.bpm != null) {
      await saveSensorValue(data.sessionId, "heart_rate", data.bpm);
      sensorDebug("💾 Heart rate saved from combined:", data);
    }
    if (spo2Valid && data.spo2 != null) {
      await saveSensorValue(data.sessionId, "oxygen_saturation", data.spo2);
      sensorDebug("💾 SpO2 saved from combined:", data);
    }
  }
});

subscribe("risecare/sensors/temperature", async (data) => {
  latestReadings["temperature"] = { ...data, _receivedAt: Date.now() };
  if (data.sessionId && data.celsius != null) {
    await saveSensorValue(data.sessionId, "temperature", data.celsius);
    sensorDebug("💾 Temperature saved from sensor:", data);
  }
});

subscribe("risecare/sensors/weight", async (data) => {
  latestReadings["weight"] = { ...data, _receivedAt: Date.now() };
  if (data.sessionId && data.kg != null) {
    await saveSensorValue(data.sessionId, "weight", data.kg);
    sensorDebug("💾 Weight saved from sensor:", data);
  }
});

subscribe("risecare/sensors/height", async (data) => {
  latestReadings["height"] = { ...data, _receivedAt: Date.now() };
  if (data.sessionId && data.cm != null) {
    await saveSensorValue(data.sessionId, "height", data.cm);
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
  sensorDebug("📡 Sensor availability:", data);
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
