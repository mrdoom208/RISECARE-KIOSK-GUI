export interface SensorStabilityConfig {
  threshold: number;
  stableCount: number;
  compare: (prev: any, curr: any) => boolean;
}

function numDiff(prev: number, curr: number): boolean {
  return Math.abs(curr - prev) <= 1;
}

export const sensorStabilityConfig: Record<string, SensorStabilityConfig> = {
  bp: {
    threshold: 5,
    stableCount: 4,
    compare: (prev: any, curr: any) => {
      if (!prev || !curr) return false;
      return (
        Math.abs(curr.sys - prev.sys) <= 5 &&
        Math.abs(curr.dia - prev.dia) <= 5
      );
    },
  },
  heartrate: {
    threshold: 3,
    stableCount: 5,
    compare: (prev: any, curr: any) =>
      typeof prev === "number" && typeof curr === "number"
        ? Math.abs(curr - prev) <= 3
        : false,
  },
  spo2: {
    threshold: 2,
    stableCount: 5,
    compare: (prev: any, curr: any) =>
      typeof prev === "number" && typeof curr === "number"
        ? Math.abs(curr - prev) <= 2
        : false,
  },
  weight: {
    threshold: 0.5,
    stableCount: 6,
    compare: (prev: any, curr: any) =>
      typeof prev === "number" && typeof curr === "number"
        ? Math.abs(curr - prev) <= 0.5
        : false,
  },
  height: {
    threshold: 1,
    stableCount: 4,
    compare: (prev: any, curr: any) =>
      typeof prev === "number" && typeof curr === "number"
        ? Math.abs(curr - prev) <= 1
        : false,
  },
  temperature: {
    threshold: 0.3,
    stableCount: 5,
    compare: (prev: any, curr: any) =>
      typeof prev === "number" && typeof curr === "number"
        ? Math.abs(curr - prev) <= 0.3
        : false,
  },
};
