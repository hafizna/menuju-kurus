import { redis, keys } from "./redis";
import { WeightEntry } from "./types";
import { lastNDateKeys } from "./dates";

export async function getWeightEntries(userId: string): Promise<WeightEntry[]> {
  const stored = await redis.get<WeightEntry[]>(keys.weight(userId));
  return stored ?? [];
}

async function saveWeightEntries(userId: string, entries: WeightEntry[]): Promise<void> {
  await redis.set(keys.weight(userId), entries);
}

// One weigh-in per date — logging again the same day overwrites the earlier entry.
export async function upsertWeightEntry(
  userId: string,
  input: { date: string; weightKg: number; bodyFat?: number; note?: string }
): Promise<WeightEntry[]> {
  const entries = await getWeightEntries(userId);
  const entry: WeightEntry = {
    id: crypto.randomUUID(),
    date: input.date,
    weightKg: input.weightKg,
    bodyFat: input.bodyFat,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
  const next = [...entries.filter((e) => e.date !== input.date), entry].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  await saveWeightEntries(userId, next);
  return next;
}

export async function deleteWeightEntry(userId: string, id: string): Promise<WeightEntry[]> {
  const entries = await getWeightEntries(userId);
  const next = entries.filter((e) => e.id !== id);
  await saveWeightEntries(userId, next);
  return next;
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
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function computeWeightTrend(entries: WeightEntry[], timezone: string): WeightTrend {
  const byDate = new Map(entries.map((e) => [e.date, e.weightKg]));
  const last7 = lastNDateKeys(7, timezone); // oldest -> newest, last item is today
  const last14 = lastNDateKeys(14, timezone);
  const prev7 = last14.slice(0, 7); // ~8-14 days ago

  const valuesFor = (dateKeys: string[]) =>
    dateKeys.map((k) => byDate.get(k)).filter((v): v is number => v !== undefined);

  const today = byDate.get(last7[last7.length - 1]) ?? null;
  const avg7Raw = average(valuesFor(last7));
  const avg14Raw = average(valuesFor(last14));
  const avgPrev7Raw = average(valuesFor(prev7));

  const avg7 = avg7Raw !== null ? round1(avg7Raw) : null;
  const avg14 = avg14Raw !== null ? round1(avg14Raw) : null;
  const change = today !== null && avg7Raw !== null ? round2(today - avg7Raw) : null;
  const weeklyRate = avg7Raw !== null && avgPrev7Raw !== null ? round2(avg7Raw - avgPrev7Raw) : null;

  let direction: WeightTrend["direction"] = "unknown";
  if (weeklyRate !== null) {
    if (weeklyRate < -0.1) direction = "down";
    else if (weeklyRate > 0.1) direction = "up";
    else direction = "flat";
  }

  return { today, avg7, avg14, change, weeklyRate, direction };
}
