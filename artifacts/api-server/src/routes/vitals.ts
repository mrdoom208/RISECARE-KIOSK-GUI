import { Router, type IRouter } from "express";
import { query } from "@workspace/db";

const router: IRouter = Router();

router.get("/vitals/latest", async (_req, res) => {
  const latestVitals = await query(
    `SELECT id, session_id AS sessionId, blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, bmi, notes, recorded_at AS recordedAt FROM vital_readings ORDER BY recorded_at DESC LIMIT 1`
  );

  if (latestVitals.length === 0) {
    res.json({ session: null, vitals: null });
    return;
  }

  const latestVital = latestVitals[0];
  const sessions = await query(`SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions WHERE id = ?`, [latestVital.sessionId]);
  const session = sessions[0];

  const vitals = await query(
    `SELECT id, session_id AS sessionId, blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, bmi, notes, recorded_at AS recordedAt FROM vital_readings WHERE session_id = ? ORDER BY recorded_at DESC`,
    [latestVital.sessionId]
  );

  res.json({ session: { ...session, vitals }, vitals: latestVital });
});

export default router;
