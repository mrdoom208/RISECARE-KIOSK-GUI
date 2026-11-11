// Advanced calibration bounds shared by the API routes and mirrored by
// hardware/loadcell.py and hardware/vl53l1x.py. Kept free of database and
// express imports so it stays unit-testable.

// HX711 raw counts are 24-bit signed; per-kg is the counts one kilogram adds.
export const WEIGHT_OFFSET_RAW_MIN = -8388608;
export const WEIGHT_OFFSET_RAW_MAX = 8388607;
export const WEIGHT_PER_KG_MIN = 1;
export const WEIGHT_PER_KG_MAX = 10000000;
export const WEIGHT_PER_KG_DEFAULT = 28205;

export const HEIGHT_OFFSET_DEFAULT = 0;
export const HEIGHT_OFFSET_MIN = -50;
export const HEIGHT_OFFSET_MAX = 50;

export interface WeightCalibration {
  offsetRaw: number;
  perKgRaw: number;
}

export function normalizeWeightCalibration(value: unknown): WeightCalibration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const calibration = value as Record<string, unknown>;
  const offsetRaw = calibration.offsetRaw;
  const perKgRaw = calibration.perKgRaw;
  if (typeof offsetRaw !== "number" || typeof perKgRaw !== "number"
      || !Number.isFinite(offsetRaw) || !Number.isFinite(perKgRaw)
      || offsetRaw < WEIGHT_OFFSET_RAW_MIN || offsetRaw > WEIGHT_OFFSET_RAW_MAX
      || perKgRaw < WEIGHT_PER_KG_MIN || perKgRaw > WEIGHT_PER_KG_MAX) return null;
  return { offsetRaw: Math.round(offsetRaw), perKgRaw: Math.round(perKgRaw) };
}

export function normalizeHeightOffset(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < HEIGHT_OFFSET_MIN || value > HEIGHT_OFFSET_MAX) return null;
  return Math.round(value * 100) / 100;
}
