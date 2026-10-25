import { upsertBodyCheckIn } from "./bodyStore";
import type { BodyCheckIn } from "./body";
import { redis, keys } from "./redis";
import { WeightEntry } from "./types";
import { lastNDateKeys } from "./dates";
import { updateJsonRecord, updateJsonRecords } from "./atomicStore";

export async function getWeightEntries(userId: string): Promise<WeightEntry[]> {
  const stored = await redis.get<WeightEntry[]>(keys.weight(userId));
  return stored ?? [];
}

interface WeightInput {
  date: string;
  weightKg: number;
  bodyFat?: number;
  note?: string;
  source?: "manual" | "shortcuts";
  heightCm?: number;
  recordedAt?: string;
}

// One weigh-in per date — logging again the same day overwrites the earlier entry.
export async function upsertWeightEntry(
  userId: string,
  input: WeightInput,
): Promise<WeightEntry[]> {
  return (await upsertWeightEntryResult(userId, input)).entries;
}

export async function upsertWeightEntryResult(userId: string, input: WeightInput) {
  const timestamp = input.recordedAt ?? new Date().toISOString();
  const id = crypto.randomUUID();
  const outcome = await updateJsonRecord<WeightEntry[], { entries: WeightEntry[]; applied: boolean; heightCm?: number }>(keys.weight(userId), (stored) => {
    const entries = stored ?? [];
    const existing = entries.find((entry) => entry.date === input.date);
    // Recheck against each CAS retry, including changes committed by a manual
    // edit or another automatic import after this request's first read.
    if (input.source === "shortcuts" && input.recordedAt && existing &&
      Date.parse(existing.createdAt) > Date.parse(input.recordedAt)) return { result: { entries, applied: false } };
    const updateFat = input.bodyFat !== undefined && !(input.source === "shortcuts" && input.recordedAt &&
      existing?.bodyFat !== undefined && Date.parse(existing.bodyFatRecordedAt ?? existing.createdAt) > Date.parse(input.recordedAt));
    const entry: WeightEntry = {
      id: existing?.id ?? id, date: input.date, weightKg: input.weightKg,
      bodyFat: updateFat ? input.bodyFat : existing?.bodyFat,
      bodyFatSource: updateFat ? (input.source ?? "manual") : (existing?.bodyFatSource ?? existing?.source),
      bodyFatRecordedAt: updateFat ? timestamp : (existing?.bodyFatRecordedAt ?? existing?.createdAt),
      heightCm: input.heightCm ?? existing?.heightCm, note: input.note ?? existing?.note,
      createdAt: timestamp, source: input.source ?? "manual",
    };
    const next = [...entries.filter((entry) => entry.date !== input.date), entry].sort((a, b) => a.date.localeCompare(b.date));
    return { next, result: { entries: next, applied: true, heightCm: entry.heightCm } };
  });
  if (outcome.applied && input.bodyFat !== undefined) {
    await upsertBodyCheckIn(
      userId,
      input.date,
      { bodyFatPercent: input.bodyFat },
      input.source ?? "manual",
      outcome.heightCm ?? null,
      timestamp,
    );
  }
  return outcome;
}

export async function deleteWeightEntry(
  userId: string,
  id: string,
): Promise<WeightEntry[]> {
  return updateJsonRecords<[WeightEntry[], BodyCheckIn[]], WeightEntry[]>([keys.weight(userId), keys.body(userId)], ([storedWeights, storedBody]) => {
    const entries = storedWeights ?? [];
    const entry = entries.find((item) => item.id === id);
    if (!entry) return { result: entries };
    let body = storedBody ?? [];
    const bodyEntry = body.find((item) => item.date === entry.date);
    if (entry.bodyFat !== undefined && !bodyEntry?.bodyFatPercent) {
      const migrated: BodyCheckIn = { ...bodyEntry, date: entry.date, bodyFatPercent: {
        value: entry.bodyFat, source: entry.bodyFatSource ?? entry.source ?? "manual",
        recordedAt: entry.bodyFatRecordedAt ?? entry.createdAt, heightCm: entry.heightCm ?? null,
      } };
      body = [...body.filter((item) => item.date !== entry.date), migrated].sort((a, b) => a.date.localeCompare(b.date));
    }
    const next = entries.filter((item) => item.id !== id);
    // The migration and deletion commit together; a concurrent body-fat import
    // forces a retry that keeps its independent, more recent reading.
    return { next: [next, body], result: next };
  });
}

export interface WeightTrend {
  today: number | null;
  avg7: number | null;
  avg14: number | null;
  change: number | null; // today vs 7-day average
  weeklyRate: number | null; // avg7 - avgPrev7, kg/week
  direction: "down" | "up" | "flat" | "unknown";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function average(values: number[]): number | null {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

export function computeWeightTrend(
  entries: WeightEntry[],
  timezone: string,
): WeightTrend {
  const byDate = new Map(entries.map((e) => [e.date, e.weightKg]));
  const last7 = lastNDateKeys(7, timezone); // oldest -> newest, last item is today
  const last14 = lastNDateKeys(14, timezone);
  const prev7 = last14.slice(0, 7); // ~8-14 days ago

  const valuesFor = (dateKeys: string[]) =>
    dateKeys
      .map((k) => byDate.get(k))
      .filter((v): v is number => v !== undefined);

  const today = byDate.get(last7[last7.length - 1]) ?? null;
  const avg7Raw = average(valuesFor(last7));
  const avg14Raw = average(valuesFor(last14));
  const avgPrev7Raw = average(valuesFor(prev7));

  const avg7 = avg7Raw !== null ? round1(avg7Raw) : null;
  const avg14 = avg14Raw !== null ? round1(avg14Raw) : null;
  const change =
    today !== null && avg7Raw !== null ? round2(today - avg7Raw) : null;
  const weeklyRate =
    avg7Raw !== null && avgPrev7Raw !== null
      ? round2(avg7Raw - avgPrev7Raw)
      : null;

  let direction: WeightTrend["direction"] = "unknown";
  if (weeklyRate !== null) {
    if (weeklyRate < -0.1) direction = "down";
    else if (weeklyRate > 0.1) direction = "up";
    else direction = "flat";
  }

  return { today, avg7, avg14, change, weeklyRate, direction };
}

export async function deleteWeightBodyFat(userId: string, date: string) {
  return updateJsonRecord<WeightEntry[], void>(keys.weight(userId), (stored) => {
    const next = (stored ?? []).map((entry) => {
      if (entry.date !== date) return entry;
      const copy = { ...entry };
      delete copy.bodyFat;
      delete copy.bodyFatSource;
      delete copy.bodyFatRecordedAt;
      return copy;
    });
    return { next, result: undefined };
  });
}
