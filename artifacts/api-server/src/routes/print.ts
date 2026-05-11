import { Router, type IRouter } from "express";
import { query } from "@workspace/db";
import { publish } from "../mqtt";

const router: IRouter = Router();

router.post("/print/receipt", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  try {
    const sessions = await query(
      `SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender FROM sessions WHERE id = ?`,
      [sessionId]
    );

    if (!sessions[0]) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session = sessions[0];

    const vitals = await query(
      `SELECT blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, blood_glucose AS bloodGlucose, bmi FROM vital_readings WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [sessionId]
    );

    const payload = {
      sessionId: session.id,
      token: session.token,
      sensor: "printer",
      value: 1,
      patientName: session.patientName,
      patientPhone: session.patientPhone,
      patientAge: session.patientAge,
      patientGender: session.patientGender,
      vitals: vitals[0] || {},
      recommendation: req.body.recommendation || "",
      timestamp: new Date().toISOString(),
    };

    const sent = publish("risecare/command/printer", payload);

    if (sent) {
      res.json({ status: "sent", message: "Receipt sent to printer" });
    } else {
      res.status(500).json({ error: "MQTT not connected" });
    }
  } catch (e) {
    console.error("Print error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
