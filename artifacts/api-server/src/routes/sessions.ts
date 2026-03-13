import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, sessionsTable, vitalReadingsTable } from "@workspace/db";
import {
  CreateSessionBody,
  GetSessionParams,
  SaveVitalsBody,
  SaveVitalsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sessions", async (_req, res) => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.startedAt))
    .limit(50);

  const result = await Promise.all(
    sessions.map(async (s) => {
      const vitals = await db
        .select()
        .from(vitalReadingsTable)
        .where(eq(vitalReadingsTable.sessionId, s.id))
        .orderBy(desc(vitalReadingsTable.recordedAt))
        .limit(1);
      return { ...s, vitals };
    }),
  );

  res.json(result);
});

router.post("/sessions", async (req, res) => {
  const body = CreateSessionBody.parse(req.body);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      patientName: body.patientName,
      patientAge: body.patientAge ?? null,
      patientGender: body.patientGender ?? null,
    })
    .returning();

  res.status(201).json({ ...session, vitals: [] });
});

router.get("/sessions/:id", async (req, res) => {
  const { id } = GetSessionParams.parse({ id: Number(req.params.id) });

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const vitals = await db
    .select()
    .from(vitalReadingsTable)
    .where(eq(vitalReadingsTable.sessionId, id))
    .orderBy(desc(vitalReadingsTable.recordedAt));

  res.json({ ...session, vitals });
});

router.post("/sessions/:id/vitals", async (req, res) => {
  const { id } = SaveVitalsParams.parse({ id: Number(req.params.id) });
  const body = SaveVitalsBody.parse(req.body);

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(vitalReadingsTable)
    .where(eq(vitalReadingsTable.sessionId, id))
    .limit(1);

  let bmi: number | null = null;
  const weight = body.weight ?? existing?.weight ?? null;
  const height = body.height ?? existing?.height ?? null;
  if (weight && height && height > 0) {
    const heightM = height / 100;
    bmi = Math.round((weight / (heightM * heightM)) * 10) / 10;
  }

  let vital;
  if (existing) {
    const [updated] = await db
      .update(vitalReadingsTable)
      .set({
        bloodPressureSystolic:
          body.bloodPressureSystolic ?? existing.bloodPressureSystolic,
        bloodPressureDiastolic:
          body.bloodPressureDiastolic ?? existing.bloodPressureDiastolic,
        heartRate: body.heartRate ?? existing.heartRate,
        oxygenSaturation: body.oxygenSaturation ?? existing.oxygenSaturation,
        temperature: body.temperature ?? existing.temperature,
        weight: body.weight ?? existing.weight,
        height: body.height ?? existing.height,
        bloodGlucose: body.bloodGlucose ?? existing.bloodGlucose,
        bmi,
        notes: body.notes ?? existing.notes,
        recordedAt: new Date(),
      })
      .where(eq(vitalReadingsTable.id, existing.id))
      .returning();
    vital = updated;
  } else {
    const [inserted] = await db
      .insert(vitalReadingsTable)
      .values({
        sessionId: id,
        bloodPressureSystolic: body.bloodPressureSystolic ?? null,
        bloodPressureDiastolic: body.bloodPressureDiastolic ?? null,
        heartRate: body.heartRate ?? null,
        oxygenSaturation: body.oxygenSaturation ?? null,
        temperature: body.temperature ?? null,
        weight: body.weight ?? null,
        height: body.height ?? null,
        bloodGlucose: body.bloodGlucose ?? null,
        bmi,
        notes: body.notes ?? null,
      })
      .returning();
    vital = inserted;
  }

  await db
    .update(sessionsTable)
    .set({ completedAt: new Date() })
    .where(eq(sessionsTable.id, id));

  res.status(201).json(vital);
});

export default router;
