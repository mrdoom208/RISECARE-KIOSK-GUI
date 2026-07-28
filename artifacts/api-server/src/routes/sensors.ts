import { Router, type IRouter } from "express";
import { query, run } from "@workspace/db";
import { publish, subscribe, isConnected } from "../mqtt";

const router: IRouter = Router();

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
let sensorAvailability: Record<string, boolean> = {};

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
  latestReadings["bp"] = data;
  if (data.sessionId && data.systolic != null && data.diastolic != null) {
    const existing = await query(
      `SELECT id FROM vital_readings WHERE session_id = ? LIMIT 1`,
      [data.sessionId]
    );
    if (existing[0]) {
      await run(
        `UPDATE vital_readings SET blood_pressure_systolic = ?, blood_pressure_diastolic = ?, recorded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [data.systolic, data.diastolic, existing[0].id]
      );
    } else {
      await run(
        `INSERT INTO vital_readings (session_id, blood_pressure_systolic, blood_pressure_diastolic) VALUES (?, ?, ?)`,
        [data.sessionId, data.systolic, data.diastolic]
      );
    }
    console.log("💾 BP saved from sensor:", data);
  }
});

subscribe("risecare/sensors/vitals", async (data) => {
  latestReadings["heartrate"] = data;
  latestReadings["spo2"] = data;
  if (data.sessionId) {
    if (data.bpm != null) {
      await saveSensorValue(data.sessionId, "heart_rate", data.bpm);
      console.log("💾 Heart rate saved from combined:", data);
    }
    if (data.spo2 != null) {
      await saveSensorValue(data.sessionId, "oxygen_saturation", data.spo2);
      console.log("💾 SpO2 saved from combined:", data);
    }
  }
});

subscribe("risecare/sensors/temperature", async (data) => {
  latestReadings["temperature"] = data;
  if (data.sessionId && data.celsius != null) {
    await saveSensorValue(data.sessionId, "temperature", data.celsius);
    console.log("💾 Temperature saved from sensor:", data);
  }
});

subscribe("risecare/sensors/weight", async (data) => {
  latestReadings["weight"] = data;
  if (data.sessionId && data.kg != null) {
    await saveSensorValue(data.sessionId, "weight", data.kg);
    console.log("💾 Weight saved from sensor:", data);
  }
});

subscribe("risecare/sensors/height", async (data) => {
  latestReadings["height"] = data;
  if (data.sessionId && data.cm != null) {
    await saveSensorValue(data.sessionId, "height", data.cm);
    console.log("💾 Height saved from sensor:", data);
  }
});

subscribe("risecare/sensors/availability", async (data) => {
  sensorAvailability = data;
  console.log("📡 Sensor availability:", data);
});

subscribe("risecare/calibration/progress/+", async (data, topic) => {
  const sensor = topic?.split("/").pop();
  if (sensor) {
    calibrationProgress[sensor] = { ...data, _receivedAt: Date.now() };
    console.log(`Calibration progress [${sensor}]:`, data);
  }
});

subscribe("risecare/test/+", async (data, topic) => {
  const sensor = topic?.split("/").pop();
  if (sensor) {
    testResults[sensor] = { ...data, _receivedAt: Date.now() };
    console.log(`🧪 Test result [${sensor}]:`, data);

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
  console.log("📏 Height calibration result:", data);
  calibrationResults["height"] = { ...data, _receivedAt: Date.now() };
});

subscribe("risecare/calibration/weight", async (data) => {
  console.log("⚖️ Weight calibration result:", data);
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
  console.log("📋 Test-all summary:", summary);
}

// API endpoint to test all enabled sensors sequentially
router.post("/sensors/test-all", async (req, res) => {
  const { sessionId, sensors: sensorIds } = req.body;

  if (!sessionId || !sensorIds?.length) {
    res.status(400).json({ error: "sessionId and sensors array required" });
    return;
  }

  if (!isConnected()) {
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
    res.status(500).json({ error: "MQTT not connected" });
  }
});

// Get sensor status
router.get("/sensors/status", async (_req, res) => {
  res.json({
    connected: isConnected(),
    broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
    sensors: sensorAvailability,
  });
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
