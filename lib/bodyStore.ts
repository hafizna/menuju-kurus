import { redis, keys } from "./redis";
import type { BodyCheckIn, CheckInField } from "./body";

export async function getBodyCheckIns(userId: string): Promise<BodyCheckIn[]> {
  return (await redis.get<BodyCheckIn[]>(keys.body(userId))) ?? [];
}

export async function upsertBodyCheckIn(
  userId: string,
  date: string,
  values: Partial<Record<CheckInField, number>>,
  source: "manual" | "shortcuts",
  heightCm: number | null | undefined,
  recordedAt?: string,
) {
  const entries = await getBodyCheckIns(userId);
  const existing = entries.find((entry) => entry.date === date);
  const entry: BodyCheckIn = { ...existing, date };
  for (const field of Object.keys(values) as CheckInField[]) {
    const value = values[field];
    if (value === undefined) continue;
    entry[field] = {
      value,
      source,
      recordedAt: recordedAt ?? new Date().toISOString(),
      heightCm: heightCm ?? existing?.[field]?.heightCm ?? null,
    };
  }
  const next = [...entries.filter((item) => item.date !== date), entry].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  await redis.set(keys.body(userId), next);
  return next;
}

export async function deleteBodyField(
  userId: string,
  date: string,
  field: CheckInField,
) {
  const entries = await getBodyCheckIns(userId);
  const next = entries
    .map((entry) => {
      if (entry.date !== date) return entry;
      const copy = { ...entry };
      delete copy[field];
      return copy;
    })
    .filter(
      (entry) =>
        entry.waistCm || entry.hipCm || entry.thighCm || entry.bodyFatPercent,
    );
  await redis.set(keys.body(userId), next);
  return next;
}
