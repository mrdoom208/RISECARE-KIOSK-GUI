import { z } from "zod/v4";

export const insertSensorSchema = z.object({
  name: z.string(),
  instruction: z.string(),
  img: z.string().optional(),
});

export type InsertSensor = z.infer<typeof insertSensorSchema>;

export interface Sensor {
  id: number;
  name: string;
  instruction: string;
  img: string | null;
}
