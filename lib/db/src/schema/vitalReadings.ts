import { z } from "zod/v4";

export const insertVitalReadingSchema = z.object({
  sessionId: z.number(),
  bloodPressureSystolic: z.number().optional(),
  bloodPressureDiastolic: z.number().optional(),
  heartRate: z.number().optional(),
  oxygenSaturation: z.number().optional(),
  temperature: z.number().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  bmi: z.number().optional(),
  notes: z.string().optional(),
});

export type InsertVitalReading = z.infer<typeof insertVitalReadingSchema>;

export interface VitalReading {
  id: number;
  sessionId: number;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  oxygenSaturation: number | null;
  temperature: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  notes: string | null;
  recordedAt: string;
}
