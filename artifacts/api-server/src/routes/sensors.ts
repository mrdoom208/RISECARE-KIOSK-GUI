import { Router, type IRouter } from "express";
import { run } from "@workspace/db";
import { publish, subscribe } from "../mqtt";

const router: IRouter = Router();

// Subscribe to sensor data from Python
subscribe("risecare/sensors/bp", async (data) => {
  latestReadings["bp"] = data;
  if (data.sessionId && data.systolic && data.diastolic) {
    await run(
      `UPDATE vital_readings SET blood_pressure_systolic = ?, blood_pressure_diastolic = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.systolic, data.diastolic, data.sessionId]
    );
    console.log("💾 BP saved from sensor:", data);
  }
});

subscribe("risecare/sensors/heartrate", async (data) => {
  latestReadings["heartrate"] = data;
  if (data.sessionId && data.bpm) {
    await run(
      `UPDATE vital_readings SET heart_rate = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.bpm, data.sessionId]
    );
    console.log("💾 Heart rate saved from sensor:", data);
  }
});

subscribe("risecare/sensors/spo2", async (data) => {
  latestReadings["spo2"] = data;
  if (data.sessionId && data.value) {
    await run(
      `UPDATE vital_readings SET oxygen_saturation = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.value, data.sessionId]
    );
    console.log("💾 SpO2 saved from sensor:", data);
  }
});

subscribe("risecare/sensors/temperature", async (data) => {
  latestReadings["temperature"] = data;
  if (data.sessionId && data.celsius) {
    await run(
      `UPDATE vital_readings SET temperature = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.celsius, data.sessionId]
    );
    console.log("💾 Temperature saved from sensor:", data);
  }
});

subscribe("risecare/sensors/weight", async (data) => {
  latestReadings["weight"] = data;
  if (data.sessionId && data.kg) {
    await run(
      `UPDATE vital_readings SET weight = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.kg, data.sessionId]
    );
    console.log("💾 Weight saved from sensor:", data);
  }
});

subscribe("risecare/sensors/height", async (data) => {
  latestReadings["height"] = data;
  if (data.sessionId && data.cm) {
    await run(
      `UPDATE vital_readings SET height = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.cm, data.sessionId]
    );
    console.log("💾 Height saved from sensor:", data);
  }
});

subscribe("risecare/sensors/glucose", async (data) => {
  latestReadings["glucose"] = data;
  if (data.sessionId && data.mmol) {
    await run(
      `UPDATE vital_readings SET blood_glucose = ?, recorded_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
      [data.mmol, data.sessionId]
    );
    console.log("💾 Glucose saved from sensor:", data);
  }
});

// In-memory calibration results (last result per sensor)
let calibrationResults: Record<string, any> = {};

// In-memory latest sensor readings (for live preview)
let latestReadings: Record<string, any> = {};

// In-memory sensor availability (reported from Python hardware)
let sensorAvailability: Record<string, boolean> = {};

subscribe("risecare/sensors/availability", async (data) => {
  sensorAvailability = data;
  console.log("📡 Sensor availability:", data);
});

subscribe("risecare/calibration/height", async (data) => {
  console.log("📏 Height calibration result:", data);
  calibrationResults["height"] = data;
});

subscribe("risecare/calibration/weight", async (data) => {
  console.log("⚖️ Weight calibration result:", data);
  calibrationResults["weight"] = data;
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

export default router;
