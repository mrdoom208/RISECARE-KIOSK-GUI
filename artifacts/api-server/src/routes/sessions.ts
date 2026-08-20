import { Router, type IRouter } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { query, run } from "@workspace/db";
import { requireAuth } from "../auth";
import { logActivity } from "../activity-log";
import { getTransactionTags } from "../device";
import {
  CreateSessionBody,
  FindSessionsBody,
  GetSessionParams,
  SaveVitalsBody,
  SaveVitalsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Portal expects gender as one of Male / Female / Other / Unknown (Title Case).
// The kiosk form submits lowercase ("male"/"female"); canonicalize before storing.
function normalizeGender(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "male") return "Male";
  if (lower === "female") return "Female";
  if (lower === "other") return "Other";
  if (lower === "unknown") return "Unknown";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

const VITALS_SELECT = `SELECT id, session_id AS sessionId, blood_pressure_systolic AS bloodPressureSystolic, blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate, oxygen_saturation AS oxygenSaturation, temperature, weight, height, bmi, notes, recorded_at AS recordedAt FROM vital_readings`;
const SESSION_SELECT = `SELECT id, token, patient_first_name AS patientFirstName, patient_last_name AS patientLastName, TRIM(patient_first_name || ' ' || patient_last_name) AS patientName, patient_phone AS patientPhone, patient_age AS patientAge, patient_gender AS patientGender, started_at AS startedAt, completed_at AS completedAt FROM sessions`;

const findSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(429).json({ error: "rate_limited", message: options.message });
  },
});

// The session list exposes patient names; only a signed-in admin may view it.
router.get("/sessions", requireAuth, async (req, res) => {
  void logActivity(
    req.user?.id ?? null,
    "History Accessed",
    `Admin ${req.user?.username} viewed session history`,
  );

  const sessions = await query(
    `${SESSION_SELECT} ORDER BY started_at DESC LIMIT 50`
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

  const namePattern = /^[a-zA-Z\s'-]+$/;
  if (!namePattern.test(body.patientFirstName)) {
    res.status(400).json({ error: "invalid_name", message: "First name can only contain letters" });
    return;
  }
  if (!namePattern.test(body.patientLastName)) {
    res.status(400).json({ error: "invalid_name", message: "Last name can only contain letters" });
    return;
  }

  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const tags = await getTransactionTags();
  const sourceSessionId = crypto.randomUUID();
  const result = await run(
    `INSERT INTO sessions (token, patient_first_name, patient_last_name, patient_phone, patient_age, patient_gender, source_session_id, device_uid, kiosk_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [token, body.patientFirstName, body.patientLastName, body.patientPhone ?? null, body.patientAge ?? null, normalizeGender(body.patientGender), sourceSessionId, tags.deviceUid, tags.kioskId]
  );

  const sessions = await query(`${SESSION_SELECT} WHERE id = ?`, [result.lastInsertRowid]);
  console.log("Session created:", JSON.stringify(sessions[0]));
  res.status(201).json({ ...sessions[0], vitals: [] });
});

router.post("/sessions/find", findSessionLimiter, async (req, res) => {
  const body = FindSessionsBody.parse(req.body);

  const reference = (body.reference ?? "").trim().toUpperCase();
  const phone = (body.phone ?? "").trim();

  if (!reference && !phone) {
    res.status(400).json({
      error: "invalid_request",
      message: "Provide either a phone number or a reference",
    });
    return;
  }

  if (reference) {
    if (!/^[A-Z0-9]{4,12}$/.test(reference)) {
      res.status(400).json({
        error: "invalid_reference",
        message: "Invalid Reference",
      });
      return;
    }

    const sessions = await query(
      `${SESSION_SELECT} WHERE token = ? LIMIT 1`,
      [reference]
    );
    const session = sessions[0];

    if (!session) {
      res.json([]);
      return;
    }

    const vitals = await query(
      `${VITALS_SELECT} WHERE session_id = ? ORDER BY recorded_at DESC`,
      [session.id]
    );

    res.json([{ ...session, vitals }]);
    return;
  }

  const phoneDigits = phone.replace(/\D/g, "");
  let local = phoneDigits;
  if (local.startsWith("63") && local.length === 12) {
    local = local.slice(2);
  } else if (local.startsWith("0")) {
    local = local.slice(1);
  }

  if (!/^9\d{9}$/.test(local)) {
    res.status(400).json({
      error: "invalid_phone",
      message: "Invalid Phone number",
    });
    return;
  }
  const normalized = "63" + local;

  const sessions = await query(
    `${SESSION_SELECT} WHERE patient_phone IS NOT NULL AND REPLACE(patient_phone, '+', '') = ? ORDER BY started_at DESC LIMIT 20`,
    [normalized]
  );

  const result = await Promise.all(
    sessions.map(async (s) => {
      const vitals = await query(
        `${VITALS_SELECT} WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1`,
        [s.id]
      );
      return { ...s, vitals: vitals[0] || null };
    })
  );

  res.json(result);
});

router.post("/sessions/token", async (req, res) => {
  const { token } = req.body as { token: string };
  
  if (!token) {
    res.status(400).json({ error: "invalid_request", message: "Token is required" });
    return;
  }

  const sessions = await query(`${SESSION_SELECT} WHERE token = ? LIMIT 1`, [token.toUpperCase()]);
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

  const sessions = await query(`${SESSION_SELECT} WHERE id = ?`, [id]);
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
  const tags = await getTransactionTags();
  const sourceVitalId = crypto.randomUUID();
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
        bmi = ?, 
        notes = ?,
        device_uid = ?,
        kiosk_id = ?,
        sync_status = 'pending',
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
        bmi,
        body.notes ?? existing.notes,
        tags.deviceUid,
        tags.kioskId,
        existing.id
      ]
    );
    const updated = await query(`SELECT * FROM vital_readings WHERE id = ?`, [existing.id]);
    vital = updated[0];
  } else {
    const result = await run(
      `INSERT INTO vital_readings (
        session_id, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, 
        oxygen_saturation, temperature, weight, height, bmi, notes,
        source_vital_id, device_uid, kiosk_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.bloodPressureSystolic ?? null,
        body.bloodPressureDiastolic ?? null,
        body.heartRate ?? null,
        body.oxygenSaturation ?? null,
        body.temperature ?? null,
        body.weight ?? null,
        body.height ?? null,
        bmi,
        body.notes ?? null,
        sourceVitalId,
        tags.deviceUid,
        tags.kioskId
      ]
    );
    const inserted = await query(`SELECT * FROM vital_readings WHERE id = ?`, [result.lastInsertRowid]);
    vital = inserted[0];
  }

  await run(`UPDATE sessions SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);

  res.status(201).json(vital);
});

router.post("/sessions/:id/vitals/clear", async (req, res) => {
  const { id } = SaveVitalsParams.parse({ id: Number(req.params.id) });
  const body = SaveVitalsBody.parse(req.body);

  const sessions = await query(`SELECT * FROM sessions WHERE id = ?`, [id]);
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const allowedColumns: Record<string, string> = {
    bloodPressureSystolic: "blood_pressure_systolic",
    bloodPressureDiastolic: "blood_pressure_diastolic",
    heartRate: "heart_rate",
    oxygenSaturation: "oxygen_saturation",
    temperature: "temperature",
    weight: "weight",
    height: "height",
    notes: "notes",
  };

  const columnsToClear = Object.entries(allowedColumns)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(body, field))
    .map(([, column]) => column);

  if (columnsToClear.length === 0) {
    res.status(400).json({ error: "invalid_request", message: "No vital fields provided to clear" });
    return;
  }

  const existingVitals = await query(`SELECT * FROM vital_readings WHERE session_id = ? LIMIT 1`, [id]);
  const existing = existingVitals[0] || null;

  if (!existing) {
    res.status(204).send();
    return;
  }

  const shouldClearBmi = columnsToClear.includes("weight") || columnsToClear.includes("height");
  const setClause = [...columnsToClear, ...(shouldClearBmi ? ["bmi"] : [])]
    .map((column) => `${column} = NULL`)
    .join(", ");

  await run(
    `UPDATE vital_readings SET ${setClause}, recorded_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [existing.id]
  );

  res.status(204).send();
});

export default router;
