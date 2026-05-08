import { Router, type IRouter } from "express";
import { query, run } from "@workspace/db";
import {
  CreateSessionBody,
  GetSessionParams,
  SaveVitalsBody,
  SaveVitalsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const VITALS_SELECT = `SELECT id, session_id AS sessionId, blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, blood_glucose AS bloodGlucose, bmi, notes, recorded_at AS recordedAt FROM vital_readings`;

router.get("/sessions", async (_req, res) => {
  const sessions = await query(
    `SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions ORDER BY started_at DESC LIMIT 50`
  );

  const result = await Promise.all(
    sessions.map(async (s) => {
      const vitals = await query(
        `${VITALS_SELECT} WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1`,
        [s.id]
      );
      return { ...s, vitals: vitals[0] || null };
    }),
  );

  res.json(result);
});

router.post("/sessions", async (req, res) => {
  const body = CreateSessionBody.parse(req.body);

  if (body.patientPhone) {
    const phoneDigits = body.patientPhone.replace(/\D/g, "");
    if (!phoneDigits.startsWith("63") || phoneDigits.length !== 12) {
      res.status(400).json({ error: "invalid_phone", message: "Invalid Philippine phone number" });
      return;
    }
    const localNumber = phoneDigits.slice(2);
    if (localNumber[0] !== "9") {
      res.status(400).json({ error: "invalid_phone", message: "Phone number must start with 9 (Globe/TM)" });
      return;
    }
  }

  if (body.patientName && !/^[a-zA-Z\s'-]+$/.test(body.patientName)) {
    res.status(400).json({ error: "invalid_name", message: "Name can only contain letters" });
    return;
  }

  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const result = await run(
    `INSERT INTO sessions (token, patient_name, patient_phone, patient_age, patient_gender) VALUES (?, ?, ?, ?, ?)`,
    [token, body.patientName, body.patientPhone ?? null, body.patientAge ?? null, body.patientGender ?? null]
  );

  const sessions = await query(`SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions WHERE id = ?`, [result.lastInsertRowid]);
  console.log("Session created:", JSON.stringify(sessions[0]));
  res.status(201).json({ ...sessions[0], vitals: [] });
});

router.post("/sessions/token", async (req, res) => {
  const { token } = req.body as { token: string };
  
  if (!token) {
    res.status(400).json({ error: "invalid_request", message: "Token is required" });
    return;
  }

  const sessions = await query(`SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions WHERE token = ? LIMIT 1`, [token.toUpperCase()]);
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const vitals = await query(
    `${VITALS_SELECT} WHERE session_id = ? ORDER BY recorded_at DESC`,
    [session.id]
  );

  res.json({ ...session, vitals });
});

router.get("/sessions/:id", async (req, res) => {
  const { id } = GetSessionParams.parse({ id: Number(req.params.id) });

  const sessions = await query(`SELECT id, token, patient_name AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions WHERE id = ?`, [id]);
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const vitals = await query(
    `${VITALS_SELECT} WHERE session_id = ? ORDER BY recorded_at DESC`,
    [id]
  );

  res.json({ ...session, vitals });
});

router.post("/sessions/:id/vitals", async (req, res) => {
  const { id } = SaveVitalsParams.parse({ id: Number(req.params.id) });
  const body = SaveVitalsBody.parse(req.body);

  const sessions = await query(`SELECT * FROM sessions WHERE id = ?`, [id]);
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const existingVitals = await query(`SELECT * FROM vital_readings WHERE session_id = ? LIMIT 1`, [id]);
  const existing = existingVitals[0] || null;

  let bmi: number | null = null;
  const weight = body.weight ?? existing?.weight ?? null;
  const height = body.height ?? existing?.height ?? null;
  if (weight && height && height > 0) {
    const heightM = height / 100;
    bmi = Math.round((weight / (heightM * heightM)) * 10) / 10;
  }

  let vital;
  if (existing) {
    await run(
      `UPDATE vital_readings SET 
        blood_pressure_systolic = ?, 
        blood_pressure_diastolic = ?, 
        heart_rate = ?, 
        oxygen_saturation = ?, 
        temperature = ?, 
        weight = ?, 
        height = ?, 
        blood_glucose = ?, 
        bmi = ?, 
        notes = ?,
        recorded_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        body.bloodPressureSystolic ?? existing.blood_pressure_systolic,
        body.bloodPressureDiastolic ?? existing.blood_pressure_diastolic,
        body.heartRate ?? existing.heart_rate,
        body.oxygenSaturation ?? existing.oxygen_saturation,
        body.temperature ?? existing.temperature,
        body.weight ?? existing.weight,
        body.height ?? existing.height,
        body.bloodGlucose ?? existing.blood_glucose,
        bmi,
        body.notes ?? existing.notes,
        existing.id
      ]
    );
    const updated = await query(`SELECT * FROM vital_readings WHERE id = ?`, [existing.id]);
    vital = updated[0];
  } else {
    const result = await run(
      `INSERT INTO vital_readings (
        session_id, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, 
        oxygen_saturation, temperature, weight, height, blood_glucose, bmi, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.bloodPressureSystolic ?? null,
        body.bloodPressureDiastolic ?? null,
        body.heartRate ?? null,
        body.oxygenSaturation ?? null,
        body.temperature ?? null,
        body.weight ?? null,
        body.height ?? null,
        body.bloodGlucose ?? null,
        bmi,
        body.notes ?? null
      ]
    );
    const inserted = await query(`SELECT * FROM vital_readings WHERE id = ?`, [result.lastInsertRowid]);
    vital = inserted[0];
  }

  await run(`UPDATE sessions SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);

  res.status(201).json(vital);
});

export default router;
