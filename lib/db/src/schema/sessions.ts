import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone"),
  patientAge: integer("patient_age"),
  patientGender: text("patient_gender"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  startedAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
