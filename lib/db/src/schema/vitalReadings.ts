import {
  pgTable,
  serial,
  integer,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions"; // for foreign key

export const vitalReadingsTable = pgTable("vital_readings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id),
  bloodPressureSystolic: integer("blood_pressure_systolic"),
  bloodPressureDiastolic: integer("blood_pressure_diastolic"),
  heartRate: integer("heart_rate"),
  oxygenSaturation: real("oxygen_saturation"),
  temperature: real("temperature"),
  weight: real("weight"),
  height: real("height"),
  bloodGlucose: real("blood_glucose"),
  bmi: real("bmi"),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertVitalReadingSchema = createInsertSchema(
  vitalReadingsTable,
).omit({
  id: true,
  recordedAt: true,
});

export type InsertVitalReading = z.infer<typeof insertVitalReadingSchema>;
export type VitalReading = typeof vitalReadingsTable.$inferSelect;
