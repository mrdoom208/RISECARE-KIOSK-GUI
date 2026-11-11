import { Router, type IRouter } from "express";
import { query } from "@workspace/db";
import { requireAuth } from "../auth";
import { getPortalBaseUrl, getTransactionTags } from "../device";
import { logger } from "../logger";
import { publish } from "../mqtt";
import { logSystem } from "../system-log";

const router: IRouter = Router();

// Builds the patient survey link printed as a QR code on the receipt:
//   {RISECARE_PORTAL_URL}/survey?kioskId={kioskId}
// Returns null when this device has not been activated yet (no kioskId).
async function buildSurveyUrl(): Promise<string | null> {
  const { kioskId } = await getTransactionTags();
  if (!kioskId) return null;
  const baseUrl = (await getPortalBaseUrl()).replace(/\/+$/, "");
  return `${baseUrl}/survey?kioskId=${encodeURIComponent(kioskId)}`;
}

router.post("/print/test", requireAuth, async (_req, res) => {
  const sent = publish("risecare/command/printer", {
    sensor: "printer",
    value: 13,
    sessionId: `test-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });

  if (sent) {
    void logSystem("INFO", "Sensor", "Printer test command sent to the device");
    res.json({ status: "sent", message: "Print test sent to printer" });
  } else {
    void logSystem(
      "WARNING",
      "Sensor",
      "Printer test could not be sent because the MQTT broker is not connected",
    );
    res.status(500).json({ error: "MQTT not connected" });
  }
});

router.post("/print/receipt", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    void logSystem(
      "WARNING",
      "Sensor",
      "Receipt printing was rejected because no session was provided",
    );
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  try {
    const sessions = await query(
      `SELECT id, token, patient_first_name AS patientFirstName, patient_last_name AS patientLastName, TRIM(patient_first_name || ' ' || patient_last_name) AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender FROM sessions WHERE id = ?`,
      [sessionId]
    );

    if (!sessions[0]) {
      void logSystem(
        "WARNING",
        "Sensor",
        "Receipt printing was skipped because the session was not found",
        { sessionId: String(sessionId) },
      );
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session = sessions[0];

    const vitals = await query(
      `SELECT blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, blood_pressure_pulse AS bloodPressurePulse, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, bmi FROM vital_readings WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1`,
      [sessionId]
    );

    const surveyUrl = await buildSurveyUrl();

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
      surveyUrl,
      timestamp: new Date().toISOString(),
    };

    const sent = publish("risecare/command/printer", payload);

    if (sent) {
      void logSystem("INFO", "Sensor", "Receipt print command sent to the printer", {
        sessionId: String(sessionId),
      });
      res.json({ status: "sent", message: "Receipt sent to printer" });
    } else {
      void logSystem(
        "WARNING",
        "Sensor",
        "Receipt printing failed because the MQTT broker is not connected",
        { sessionId: String(sessionId) },
      );
      res.status(500).json({ error: "MQTT not connected" });
    }
  } catch (e) {
    logger.error("Printer", "Receipt printing failed due to an unexpected error", e);
    void logSystem("ERROR", "Sensor", "Receipt printing failed due to an unexpected error", {
      sessionId: String(sessionId),
      error: e instanceof Error ? e.message : String(e),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
