import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  patientName: text("patient_name").notNull(),
  patientAge: integer("patient_age"),
  patientGender: text("patient_gender"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, startedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;

export const vitalReadingsTable = pgTable("vital_readings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessionsTable.id),
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

export const insertVitalReadingSchema = createInsertSchema(vitalReadingsTable).omit({ id: true, recordedAt: true });
export type InsertVitalReading = z.infer<typeof insertVitalReadingSchema>;
export type VitalReading = typeof vitalReadingsTable.$inferSelect;
