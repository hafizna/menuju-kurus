import { updateJsonRecord } from "./atomicStore";
import { keys, redis } from "./redis";

export type FitnessMetric = "vo2Max" | "restingHeartRate";
export interface FitnessMeasurement {
  value: number;
  date: string;
  recordedAt: string;
  source: "apple_health";
}
export type FitnessMeasurements = Partial<Record<FitnessMetric, FitnessMeasurement>>;

export async function getFitnessMeasurements(userId: string): Promise<FitnessMeasurements> {
  return (await redis.get<FitnessMeasurements>(keys.fitnessMeasurements(userId))) ?? {};
}

// Keep the latest observation of each metric across dates. Recheck the timestamp
// inside every atomic retry so a delayed import cannot replace a newer winner
// or erase an independent metric saved concurrently.
export function upsertFitnessMeasurement(
  userId: string,
  metric: FitnessMetric,
  reading: FitnessMeasurement,
): Promise<boolean> {
  return updateJsonRecord<FitnessMeasurements, boolean>(keys.fitnessMeasurements(userId), (stored) => {
    const existing = stored?.[metric];
    if (existing && Date.parse(existing.recordedAt) >= Date.parse(reading.recordedAt)) {
      return { result: false };
    }
    return { next: { ...stored, [metric]: reading }, result: true };
  });
}
