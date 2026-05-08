import { Router, type IRouter } from "express";
import { query, run } from "@workspace/db";
import { publish, subscribe } from "../mqtt";

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

subscribe("risecare/sensors/heartrate", async (data) => {
  latestReadings["heartrate"] = data;
  if (data.sessionId && data.bpm != null) {
    await saveSensorValue(data.sessionId, "heart_rate", data.bpm);
    console.log("💾 Heart rate saved from sensor:", data);
  }
});

subscribe("risecare/sensors/spo2", async (data) => {
  latestReadings["spo2"] = data;
  if (data.sessionId && data.value != null) {
    await saveSensorValue(data.sessionId, "oxygen_saturation", data.value);
    console.log("💾 SpO2 saved from sensor:", data);
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

subscribe("risecare/sensors/glucose", async (data) => {
  latestReadings["glucose"] = data;
  if (data.sessionId && data.mmol != null) {
    await saveSensorValue(data.sessionId, "blood_glucose", data.mmol);
    console.log("💾 Glucose saved from sensor:", data);
  }
});

// In-memory calibration results (last result per sensor)
let calibrationResults: Record<string, any> = {};

// In-memory latest sensor readings (for live preview)
let latestReadings: Record<string, any> = {};

// In-memory test results (last result per sensor)
let testResults: Record<string, any> = {};

// In-memory sensor availability (reported from Python hardware)
let sensorAvailability: Record<string, boolean> = {};

subscribe("risecare/sensors/availability", async (data) => {
  sensorAvailability = data;
  console.log("📡 Sensor availability:", data);
});

subscribe("risecare/test/+", async (data, topic) => {
  const sensor = topic?.split("/").pop();
  if (sensor) {
    testResults[sensor] = { ...data, _receivedAt: Date.now() };
    console.log(`🧪 Test result [${sensor}]:`, data);
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

// API endpoint to send sensor command (start=1 / stop=0)
router.post("/sensors/command", async (req, res) => {
  const { sessionId, sensor, value } = req.body;

  if (!sessionId || !sensor || value === undefined) {
    res.status(400).json({ error: "sessionId, sensor, and value required" });
    return;
  }

  const sent = publish(`risecare/command/${sensor}`, {
    sessionId,
    sensor,
    value,
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
  const { isConnected } = await import("../mqtt");
  res.json({
    connected: isConnected(),
    broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
    sensors: sensorAvailability,
  });
});

// Get latest calibration result
router.get("/sensors/calibration", async (_req, res) => {
  res.json(calibrationResults);
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
