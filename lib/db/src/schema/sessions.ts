import { z } from "zod/v4";

export const insertSessionSchema = z.object({
  token: z.string().optional(),
  patientName: z.string(),
  patientPhone: z.string().optional(),
  patientAge: z.number().optional(),
  patientGender: z.string().optional(),
});

export type InsertSession = z.infer<typeof insertSessionSchema>;

export interface Session {
  id: number;
  token: string | null;
  patientName: string;
  patientPhone: string | null;
  patientAge: number | null;
  patientGender: string | null;
  startedAt: string;
  completedAt: string | null;
}
