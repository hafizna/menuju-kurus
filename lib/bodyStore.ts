import { redis, keys } from "./redis";
import type { BodyCheckIn, CheckInField } from "./body";
import { updateJsonRecord } from "./atomicStore";

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
  return (await upsertBodyCheckInResult(userId, date, values, source, heightCm, recordedAt)).entries;
}

export async function upsertBodyCheckInResult(
  userId: string,
  date: string,
  values: Partial<Record<CheckInField, number>>,
  source: "manual" | "shortcuts",
  heightCm: number | null | undefined,
  recordedAt?: string,
) {
  const timestamp = recordedAt ?? new Date().toISOString();
  return updateJsonRecord<BodyCheckIn[], { entries: BodyCheckIn[]; appliedFields: CheckInField[] }>(keys.body(userId), (stored) => {
    const entries = stored ?? [];
    const existing = entries.find((entry) => entry.date === date);
    const entry: BodyCheckIn = { ...existing, date };
    const appliedFields: CheckInField[] = [];
    for (const field of Object.keys(values) as CheckInField[]) {
      const value = values[field];
      if (value === undefined) continue;
      // This is deliberately inside the CAS transform, so a conflict retry
      // cannot replace a more recent measurement committed in the meantime.
      if (source === "shortcuts" && recordedAt && existing?.[field] &&
        Date.parse(existing[field]!.recordedAt) > Date.parse(recordedAt)) continue;
      entry[field] = { value, source, recordedAt: timestamp, heightCm: heightCm ?? existing?.[field]?.heightCm ?? null };
      appliedFields.push(field);
    }
    if (!appliedFields.length) return { result: { entries, appliedFields } };
    const next = [...entries.filter((item) => item.date !== date), entry].sort((a, b) => a.date.localeCompare(b.date));
    return { next, result: { entries: next, appliedFields } };
  });
}

export async function deleteBodyField(
  userId: string,
  date: string,
  field: CheckInField,
) {
  return updateJsonRecord<BodyCheckIn[], BodyCheckIn[]>(keys.body(userId), (stored) => {
    const entries = stored ?? [];
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
    return { next, result: next };
  });
}
