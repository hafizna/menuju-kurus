import { foodLogStatus } from "./energy";
import type { BodySnapshot } from "./body";
import type { DayLog } from "./types";

export const RESPONSE_PERIODS = [14, 28, 56] as const;
export type ResponsePeriod = (typeof RESPONSE_PERIODS)[number];
export type ActivitySource = "apple_health" | "manual";
export interface ResponseDay {
  date: string;
  foodStatus: "empty" | "partial" | "complete";
  calories: number | null;
  recordedCalories: number | null;
  recordedProtein: number | null;
  protein: number | null;
  activity: number | null;
  activitySource: ActivitySource | null;
  weight: number | null;
  waist: number | null;
  review: string[];
}
export interface Coverage {
  observedDays: number;
  totalDays: number;
  average: number | null;
  ready: boolean;
  reasons: string[];
}
export interface BodyChange extends Coverage {
  first: { date: string; value: number } | null;
  last: { date: string; value: number } | null;
  change: number | null;
  basis: string;
  baseline: number | null;
  recent: number | null;
  baselineSamples: number;
  recentSamples: number;
}
export interface ResponseWindow {
  start: string;
  end: string;
  days: ResponseDay[];
  completeFoodDays: number;
  food: Coverage;
  protein: Coverage;
  activity: Coverage & { sources: ActivitySource[] };
  weight: BodyChange;
  waist: BodyChange;
}
export interface BodyResponseReport {
  periodDays: ResponsePeriod;
  current: ResponseWindow;
  previous: ResponseWindow;
  comparison: {
    calories: number | null;
    protein: number | null;
    activity: number | null;
  };
  insights: { id: string; text: string; evidence: string }[];
  policies: {
    foodCoverage: number;
    minimumWeightSamples: number;
    endpointWindowDays: number;
    minimumWaistSpanDays: number;
  };
}
const DAY_MS = 86400000;
const round = (n: number) => Math.round(n * 100) / 100;
const mean = (values: number[]) =>
  values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
export function calendarDates(end: string, length: number): string[] {
  return Array.from({ length }, (_, index) =>
    new Date(Date.parse(end) - (length - 1 - index) * DAY_MS)
      .toISOString()
      .slice(0, 10),
  );
}
const validNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const sum = (values: unknown[]) =>
  values.every(validNumber)
    ? values.reduce<number>((total, value) => total + (value as number), 0)
    : null;

function buildDays(
  dates: string[],
  logs: DayLog[],
  snapshots: BodySnapshot[],
): ResponseDay[] {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const bodyByDate = new Map(snapshots.map((entry) => [entry.date, entry]));
  return dates.map((date) => {
    const log = byDate.get(date) ?? { date, meals: [], burns: [] };
    const snapshot = bodyByDate.get(date);
    const status = foodLogStatus(log);
    const review: string[] = [];
    const recordedCalories =
      log.meals.length || status === "complete"
        ? sum(log.meals.map((meal) => meal.calories))
        : null;
    const recordedProtein =
      log.meals.length || status === "complete"
        ? sum(log.meals.map((meal) => meal.protein_g))
        : null;
    const calories = status === "complete" ? recordedCalories : null;
    const protein = status === "complete" ? recordedProtein : null;
    if (status === "complete" && calories === null) review.push("food-invalid");
    if (status === "complete" && protein === null)
      review.push("protein-invalid");
    // Retain valid extreme readings in the display and average, but pause insights.
    if (calories !== null && (calories < 300 || calories > 8000))
      review.push("food-review");
    if (protein !== null && protein > 600) review.push("protein-review");
    // Apple Health is a daily cumulative snapshot; manual burns may overlap it.
    // Prefer the latest snapshot and never add manual entries to that snapshot.
    const synced = log.burns
      .filter((burn) => burn.source === "shortcuts")
      .sort((a, b) => String(b.time ?? "").localeCompare(String(a.time ?? "")));
    const manual = log.burns.filter((burn) => burn.source === "manual");
    const activitySource: ActivitySource | null = synced.length
      ? "apple_health"
      : manual.length
        ? "manual"
        : null;
    const activity = synced.length
      ? validNumber(synced[0].calories)
        ? synced[0].calories
        : null
      : manual.length
        ? sum(manual.map((burn) => burn.calories))
        : null;
    if (activitySource && activity === null) review.push("activity-invalid");
    if (activity !== null && activity > 5000) review.push("activity-review");
    const weight =
      validNumber(snapshot?.weightKg?.value) && snapshot!.weightKg!.value > 0
        ? snapshot!.weightKg!.value
        : null;
    const waist =
      validNumber(snapshot?.waistCm?.value) && snapshot!.waistCm!.value > 0
        ? snapshot!.waistCm!.value
        : null;
    if (weight !== null && (weight < 25 || weight > 350))
      review.push("weight-review");
    if (waist !== null && (waist < 30 || waist > 200))
      review.push("waist-review");
    if (snapshot?.weightKg && weight === null) review.push("weight-invalid");
    if (snapshot?.waistCm && waist === null) review.push("waist-invalid");
    return {
      date,
      foodStatus: status,
      calories,
      protein,
      recordedCalories,
      recordedProtein,
      activity,
      activitySource,
      weight,
      waist,
      review,
    };
  });
}

function coverage(
  days: ResponseDay[],
  field: "calories" | "protein" | "activity",
): Coverage {
  const values = days.flatMap((day) =>
    day[field] === null ? [] : [day[field]!],
  );
  const reasons: string[] = [];
  const minimum = Math.ceil(days.length * 0.75);
  if (values.length < minimum)
    reasons.push(
      `Perlu minimal ${minimum}/${days.length} hari dengan data yang bisa dipakai.`,
    );
  const midpoint = Math.floor(days.length / 2);
  for (const [label, half] of [
    ["awal", days.slice(0, midpoint)],
    ["akhir", days.slice(midpoint)],
  ] as const) {
    if (
      half.filter((day) => day[field] !== null).length <
      Math.ceil(half.length * 0.6)
    )
      reasons.push(
        `Catatan paruh ${label} periode belum cukup tersebar (minimal 60%).`,
      );
  }
  const prefix = field === "calories" ? "food" : field;
  if (
    days.some((day) => day.review.some((reason) => reason.startsWith(prefix)))
  )
    reasons.push(
      "Ada nilai yang perlu ditinjau; insight ditunda, angka valid tetap ditampilkan.",
    );
  return {
    observedDays: values.length,
    totalDays: days.length,
    average: mean(values),
    ready: reasons.length === 0,
    reasons,
  };
}
function bodyChange(
  days: ResponseDay[],
  field: "weight" | "waist",
): BodyChange {
  const entries = days.filter((day) => day[field] !== null);
  const first = entries[0]
    ? { date: entries[0].date, value: entries[0][field]! }
    : null;
  const last = entries.at(-1)
    ? { date: entries.at(-1)!.date, value: entries.at(-1)![field]! }
    : null;
  const reasons: string[] = [];
  const early = days.slice(0, 7).filter((day) => day[field] !== null);
  const late = days.slice(-7).filter((day) => day[field] !== null);
  let change: number | null = null;
  const baseline =
    field === "weight"
      ? early.length >= 2
        ? mean(early.map((day) => day.weight!))
        : null
      : (first?.value ?? null);
  const recent =
    field === "weight"
      ? late.length >= 2
        ? mean(late.map((day) => day.weight!))
        : null
      : (last?.value ?? null);
  if (field === "weight") {
    const minimum = Math.max(4, Math.ceil(days.length / 3.5));
    if (entries.length < minimum)
      reasons.push(`Perlu minimal ${minimum} pengukuran berat.`);
    if (
      first &&
      last &&
      (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS <
        Math.ceil(days.length / 2)
    )
      reasons.push(
        `Jarak pengukuran berat perlu minimal ${Math.ceil(days.length / 2)} hari.`,
      );
    if (early.length < 2 || late.length < 2)
      reasons.push(
        "Perlu minimal 2 pengukuran pada masing-masing 7 hari awal dan akhir.",
      );
    if (early.length >= 2 && late.length >= 2)
      change = round(
        mean(late.map((day) => day.weight!))! -
          mean(early.map((day) => day.weight!))!,
      );
  } else {
    if (entries.length < 2)
      reasons.push("Perlu minimal 2 pengukuran pinggang.");
    if (!early.length || !late.length)
      reasons.push("Perlu ukuran pinggang pada 7 hari awal dan akhir periode.");
    if (
      first &&
      last &&
      (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS <
        Math.ceil(days.length / 2)
    )
      reasons.push(
        `Jarak pengukuran pinggang perlu minimal ${Math.ceil(days.length / 2)} hari.`,
      );
    if (first && last && first.date !== last.date)
      change = round(last.value - first.value);
  }
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1],
      current = entries[index];
    const gap = (Date.parse(current.date) - Date.parse(previous.date)) / DAY_MS;
    const jump = Math.abs(current[field]! - previous[field]!);
    const suspicious =
      field === "weight"
        ? gap <= 7 && jump > Math.max(3, previous.weight! * 0.05)
        : gap <= 14 && jump > 10;
    if (suspicious) {
      current.review.push(`${field}-review`);
      reasons.push(
        `Perubahan besar antara ${previous.date} dan ${current.date}; periksa ukuran dan kondisi pengukuran.`,
      );
    }
  }
  if (days.some((day) => day.review.includes(`${field}-review`)))
    reasons.push(
      "Ada ukuran yang perlu ditinjau; insight ditunda tanpa menghapus angka.",
    );
  if (days.some((day) => day.review.includes(`${field}-invalid`)))
    reasons.push("Ada ukuran tidak valid yang belum dapat dipakai.");
  return {
    observedDays: entries.length,
    totalDays: days.length,
    average: mean(entries.map((day) => day[field]!)),
    first,
    last,
    change,
    baseline,
    recent,
    baselineSamples: field === "weight" ? early.length : first ? 1 : 0,
    recentSamples: field === "weight" ? late.length : last ? 1 : 0,
    ready: reasons.length === 0,
    reasons,
    basis:
      field === "weight"
        ? "Selisih rata-rata pengukuran 7 hari akhir dan 7 hari awal"
        : "Selisih pengukuran pertama dan terakhir, pada tanggal yang ditampilkan",
  };
}
function windowReport(days: ResponseDay[]): ResponseWindow {
  const sources = [
    ...new Set(
      days.flatMap((day) =>
        day.activitySource && day.activity !== null ? [day.activitySource] : [],
      ),
    ),
  ];
  const activity = coverage(days, "activity");
  if (sources.length > 1) {
    activity.ready = false;
    activity.reasons.push(
      "Sumber manual dan Apple Health bercampur; belum bisa dibandingkan sebagai ukuran aktivitas yang sama.",
    );
  }
  return {
    start: days[0].date,
    end: days.at(-1)!.date,
    days,
    completeFoodDays: days.filter((day) => day.foodStatus === "complete")
      .length,
    food: coverage(days, "calories"),
    protein: coverage(days, "protein"),
    activity: { ...activity, sources },
    weight: bodyChange(days, "weight"),
    waist: bodyChange(days, "waist"),
  };
}
export function buildBodyResponse(
  today: string,
  periodDays: ResponsePeriod,
  logs: DayLog[],
  snapshots: BodySnapshot[],
): BodyResponseReport {
  const dates = calendarDates(today, periodDays * 2);
  const allDays = buildDays(dates, logs, snapshots);
  const previous = windowReport(allDays.slice(0, periodDays));
  const current = windowReport(allDays.slice(periodDays));
  const insights: BodyResponseReport["insights"] = [];
  if (current.weight.ready && current.food.ready) {
    insights.push({
      id: "food-weight",
      text: `Asupan tercatat rata-rata ${current.food.average} kcal/hari; selisih rata-rata berat awal–akhir ${current.weight.change! > 0 ? "+" : ""}${current.weight.change} kg pada periode yang sama. Ini bukan bukti bahwa asupan tersebut menyebabkan perubahan berat.`,
      evidence: `${current.start} — ${current.end} · ${current.food.observedDays} hari asupan lengkap · ${current.weight.observedDays} pengukuran berat`,
    });
  }
  if (current.waist.ready && current.food.ready) {
    insights.push({
      id: "food-waist",
      text: `Pinggang berubah ${current.waist.change! > 0 ? "+" : ""}${current.waist.change} cm dari ${current.waist.first!.date} ke ${current.waist.last!.date}. Asupan yang dicatat dalam periode ini rata-rata ${current.food.average} kcal/hari; ukuran pinggang tidak mengukur lemak visceral secara langsung.`,
      evidence: `${current.waist.observedDays} pengukuran pinggang · ${current.food.observedDays}/${periodDays} hari asupan lengkap`,
    });
  }
  if (current.waist.ready && current.activity.ready) {
    insights.push({
      id: "activity-waist",
      text: `Pada periode yang sama, aktivitas tercatat rata-rata ${current.activity.average} kcal per hari yang tersedia dan pinggang berubah ${current.waist.change! > 0 ? "+" : ""}${current.waist.change} cm. Tidak menyimpulkan aktivitas sebagai penyebabnya.`,
      evidence: `${current.start} — ${current.end} · ${current.activity.observedDays}/${periodDays} hari aktivitas · sumber ${current.activity.sources[0] === "apple_health" ? "Apple Health" : "manual"}`,
    });
  }
  const comparableActivity =
    current.activity.ready &&
    previous.activity.ready &&
    current.activity.sources[0] === previous.activity.sources[0];
  return {
    periodDays,
    current,
    previous,
    insights,
    comparison: {
      calories:
        current.food.ready && previous.food.ready
          ? round(current.food.average! - previous.food.average!)
          : null,
      protein:
        current.protein.ready && previous.protein.ready
          ? round(current.protein.average! - previous.protein.average!)
          : null,
      activity: comparableActivity
        ? round(current.activity.average! - previous.activity.average!)
        : null,
    },
    policies: {
      foodCoverage: 0.75,
      minimumWeightSamples: Math.max(4, Math.ceil(periodDays / 3.5)),
      endpointWindowDays: 7,
      minimumWaistSpanDays: Math.ceil(periodDays / 2),
    },
  };
}
