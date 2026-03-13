import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sensorsTable = pgTable("sensors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  instruction: text("instruction").notNull(),
  img: text("img"),
});

export const insertSensorSchema = createInsertSchema(sensorsTable).omit({
  id: true,
});

export type InsertSensor = z.infer<typeof insertSensorSchema>;
export type Sensor = typeof sensorsTable.$inferSelect;
