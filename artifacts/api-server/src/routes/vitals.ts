import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, sessionsTable, vitalReadingsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/vitals/latest", async (_req, res) => {
  const [latestVital] = await db
    .select()
    .from(vitalReadingsTable)
    .orderBy(desc(vitalReadingsTable.recordedAt))
    .limit(1);

  if (!latestVital) {
    res.json({ session: null, vitals: null });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, latestVital.sessionId));

  const vitals = await db
    .select()
    .from(vitalReadingsTable)
    .where(eq(vitalReadingsTable.sessionId, latestVital.sessionId))
    .orderBy(desc(vitalReadingsTable.recordedAt));

  res.json({ session: { ...session, vitals }, vitals: latestVital });
});

export default router;
