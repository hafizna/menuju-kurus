import type { WeightEntry } from "./types";

export const BODY_FIELDS = [
  "weightKg",
  "waistCm",
  "hipCm",
  "thighCm",
  "bodyFatPercent",
] as const;
export type BodyField = (typeof BODY_FIELDS)[number];
export type CheckInField = Exclude<BodyField, "weightKg">;
export interface BodyReading {
  value: number;
  source: "manual" | "shortcuts";
  recordedAt: string;
  heightCm: number | null;
}
export interface BodyCheckIn {
  date: string;
  waistCm?: BodyReading;
  hipCm?: BodyReading;
  thighCm?: BodyReading;
  bodyFatPercent?: BodyReading;
}
export interface BodySnapshot extends BodyCheckIn {
  weightKg?: BodyReading;
}
export const BODY_LABELS: Record<
  BodyField,
  { label: string; unit: string; min: number; max: number }
> = {
  weightKg: { label: "Berat", unit: "kg", min: 1, max: 400 },
  waistCm: { label: "Pinggang", unit: "cm", min: 20, max: 250 },
  hipCm: { label: "Pinggul", unit: "cm", min: 20, max: 300 },
  thighCm: { label: "Paha", unit: "cm", min: 10, max: 150 },
  bodyFatPercent: { label: "Body fat", unit: "%", min: 1, max: 75 },
};

export function validMeasurementDate(
  value: unknown,
  today: string,
): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value <= today
  );
}

export function mergeBodySnapshots(
  weights: WeightEntry[],
  checkIns: BodyCheckIn[],
): BodySnapshot[] {
  const byDate = new Map<string, BodySnapshot>();
  for (const entry of weights) {
    const source = entry.source ?? "manual";
    const snapshot: BodySnapshot = {
      date: entry.date,
      weightKg: {
        value: entry.weightKg,
        source,
        recordedAt: entry.createdAt,
        heightCm: entry.heightCm ?? null,
      },
    };
    if (entry.bodyFat !== undefined) {
      snapshot.bodyFatPercent = {
        value: entry.bodyFat,
        source: entry.bodyFatSource ?? source,
        recordedAt: entry.bodyFatRecordedAt ?? entry.createdAt,
        heightCm: entry.heightCm ?? null,
      };
    }
    byDate.set(entry.date, snapshot);
  }
  for (const entry of checkIns) {
    byDate.set(entry.date, { ...byDate.get(entry.date), ...entry });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function bodyRatios(snapshot: BodySnapshot) {
  const weight = snapshot.weightKg;
  const waist = snapshot.waistCm;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    bmi:
      weight && weight.heightCm && weight.heightCm > 0
        ? round(weight.value / (weight.heightCm / 100) ** 2)
        : null,
    whtr:
      waist && waist.heightCm && waist.heightCm > 0
        ? round(waist.value / waist.heightCm)
        : null,
    whr:
      waist && snapshot.hipCm
        ? round(waist.value / snapshot.hipCm.value)
        : null,
    wtr:
      waist && snapshot.thighCm
        ? round(waist.value / snapshot.thighCm.value)
        : null,
  };
}

export function comparisonRows(
  before: BodySnapshot | undefined,
  after: BodySnapshot | undefined,
) {
  return BODY_FIELDS.map((field) => ({
    field,
    before: before?.[field] ?? null,
    after: after?.[field] ?? null,
    delta:
      before?.[field] && after?.[field] && before.date < after.date
        ? Math.round((after[field]!.value - before[field]!.value) * 100) / 100
        : null,
  }));
}

export function latestReading(snapshots: BodySnapshot[], field: BodyField) {
  const snapshot = [...snapshots].reverse().find((entry) => entry[field]);
  return snapshot?.[field]
    ? { date: snapshot.date, reading: snapshot[field]! }
    : null;
}

export function checkInDue(
  snapshots: BodySnapshot[],
  field: "waistCm" | "hipCm" | "thighCm",
  today: string,
) {
  const latest = latestReading(snapshots, field);
  const days = latest
    ? Math.round((Date.parse(today) - Date.parse(latest.date)) / 86400000)
    : null;
  return {
    lastDate: latest?.date ?? null,
    days,
    due: days === null || days >= (field === "waistCm" ? 7 : 14),
  };
}

// A bounded monotonic illustration parameter, NOT a reconstruction of body width.
export function avatarHalfWidth(
  circumference: number,
  heightCm: number,
): number {
  return Math.max(12, Math.min(44, (circumference / heightCm) * 48));
}
export function avatarHeight(snapshot: BodySnapshot): number | null {
  const readings = [snapshot.waistCm, snapshot.hipCm, snapshot.thighCm].filter(
    (entry): entry is BodyReading => !!entry,
  );
  if (!readings.length) return null;
  const height = readings[0].heightCm;
  return height && readings.every((entry) => entry.heightCm === height)
    ? height
    : null;
}

export interface MetricPoint {
  date: string;
  value: number;
  average7: number | null;
  samples7: number;
}
export function metricPoints(
  snapshots: BodySnapshot[],
  field: BodyField,
): MetricPoint[] {
  const entries = snapshots.filter((entry) => entry[field]);
  return entries.map((entry) => {
    const dateMs = Date.parse(entry.date);
    const window = entries.filter((other) => {
      const difference = dateMs - Date.parse(other.date);
      return difference >= 0 && difference < 7 * 86400000;
    });
    return {
      date: entry.date,
      value: entry[field]!.value,
      average7:
        field === "weightKg" && window.length >= 2
          ? Math.round(
              (window.reduce((sum, other) => sum + other[field]!.value, 0) /
                window.length) *
                100,
            ) / 100
          : null,
      samples7: window.length,
    };
  });
}
