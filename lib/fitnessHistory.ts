import { updateJsonRecord } from "./atomicStore";
import { keys, redis } from "./redis";
import type { FitnessMetric } from "./fitnessMeasurements";

// fitnessMeasurements keeps only the latest observation per metric. Trends need
// the daily points as well, so every Apple Health reading is also kept here:
// one point per metric and date, capped to roughly half a year.
export interface FitnessHistoryPoint {
  date: string;
  value: number;
  recordedAt: string;
}
export type FitnessHistory = Partial<Record<FitnessMetric, FitnessHistoryPoint[]>>;
export const FITNESS_HISTORY_LIMIT = 180;

export async function getFitnessHistory(userId: string): Promise<FitnessHistory> {
  return (await redis.get<FitnessHistory>(keys.fitnessHistory(userId))) ?? {};
}

// The newest recordedAt wins for a date. The guard runs inside every atomic
// retry, so a delayed older import cannot replace a newer reading.
export function recordFitnessHistory(
  userId: string,
  metric: FitnessMetric,
  point: FitnessHistoryPoint,
): Promise<boolean> {
  return updateJsonRecord<FitnessHistory, boolean>(keys.fitnessHistory(userId), (stored) => {
    const points = stored?.[metric] ?? [];
    const existing = points.find((item) => item.date === point.date);
    if (existing && Date.parse(existing.recordedAt) >= Date.parse(point.recordedAt)) {
      return { result: false };
    }
    const next = [...points.filter((item) => item.date !== point.date), point]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-FITNESS_HISTORY_LIMIT);
    return { next: { ...stored, [metric]: next }, result: true };
  });
}
