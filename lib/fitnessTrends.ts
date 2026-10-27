import { calendarDates } from "./bodyResponse";
import type { BodySnapshot } from "./body";
import type { FitnessHistory } from "./fitnessHistory";

// Product heuristics for reading imported Apple Health / smart-scale data over
// time. They decide when a comparison is allowed and how it is worded; they are
// not clinical thresholds. See docs/body-response-data-policy.md.
export const TREND_POLICY = {
  restingHeartRate: { recentDays: 7, baselineDays: 28, minRecent: 3, minBaseline: 7, staleAfterDays: 14, notableDelta: 5 },
  vo2Max: { recentDays: 30, baselineDays: 90, minRecent: 1, minBaseline: 1, staleAfterDays: 60, notableDelta: 2 },
  composition: { recentDays: 14, baselineDays: 14, minPairs: 3, mediumPairs: 5, notableKg: 0.3, fatFreeShare: 0.5 },
} as const;

const DAY_MS = 86400000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => round1(Math.abs(n)).toFixed(1);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const dayDiff = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / DAY_MS);
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export interface WindowStat {
  average: number | null;
  samples: number;
}
export interface SeriesTrend {
  latest: { date: string; value: number } | null;
  ageDays: number | null;
  stale: boolean;
  recent: WindowStat;
  baseline: WindowStat;
  // recent average minus baseline average; only when both windows have enough samples.
  delta: number | null;
  ready: boolean;
  needs: string | null;
}

export type CompositionPattern =
  | "fat_loss"
  | "fat_free_loss_high"
  | "mixed_loss"
  | "gain_mostly_fat"
  | "gain_mostly_fat_free"
  | "recomposition_signal"
  | "stable";
export interface CompositionWindow {
  pairs: number;
  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  fatFreeMassKg: number | null;
}
export interface CompositionTrend {
  ready: boolean;
  needs: string | null;
  recent: CompositionWindow;
  baseline: CompositionWindow;
  // recent minus baseline; null until both windows have enough paired days.
  change: { weightKg: number; bodyFatPoints: number; fatMassKg: number; fatFreeMassKg: number } | null;
  pattern: CompositionPattern | null;
  confidence: "low" | "medium";
  statement: string | null;
}
export interface FitnessTrends {
  composition: CompositionTrend;
  restingHeartRate: SeriesTrend;
  vo2Max: SeriesTrend;
}

function windowDates(today: string, recentDays: number, baselineDays: number) {
  return {
    recent: new Set(calendarDates(today, recentDays)),
    baseline: new Set(calendarDates(shift(today, -recentDays), baselineDays)),
  };
}

export function buildSeriesTrend(
  points: { date: string; value: number }[] | undefined,
  today: string,
  policy: { recentDays: number; baselineDays: number; minRecent: number; minBaseline: number; staleAfterDays: number },
): SeriesTrend {
  const valid = (points ?? [])
    .filter((point) => Number.isFinite(point.value) && point.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.length ? { date: valid[valid.length - 1].date, value: valid[valid.length - 1].value } : null;
  const ageDays = latest ? dayDiff(today, latest.date) : null;
  const dates = windowDates(today, policy.recentDays, policy.baselineDays);
  const stat = (set: Set<string>): WindowStat => {
    const values = valid.filter((point) => set.has(point.date)).map((point) => point.value);
    const average = mean(values);
    return { average: average === null ? null : round1(average), samples: values.length };
  };
  const recent = stat(dates.recent);
  const baseline = stat(dates.baseline);
  const ready = recent.samples >= policy.minRecent && baseline.samples >= policy.minBaseline;
  const needs = ready
    ? null
    : `Perlu minimal ${policy.minRecent} data pada ${policy.recentDays} hari terakhir (ada ${recent.samples}) dan ${policy.minBaseline} data pada ${policy.baselineDays} hari sebelumnya (ada ${baseline.samples}).`;
  return {
    latest,
    ageDays,
    stale: ageDays !== null && ageDays > policy.staleAfterDays,
    recent,
    baseline,
    delta: ready && recent.average !== null && baseline.average !== null ? round1(recent.average - baseline.average) : null,
    ready,
    needs,
  };
}

function compositionWindow(snapshots: BodySnapshot[], dates: Set<string>): CompositionWindow {
  const pairs = snapshots
    .filter((snapshot) => dates.has(snapshot.date) && snapshot.weightKg && snapshot.bodyFatPercent)
    .map((snapshot) => {
      const weight = snapshot.weightKg!.value;
      const fat = (weight * snapshot.bodyFatPercent!.value) / 100;
      return { weight, bodyFat: snapshot.bodyFatPercent!.value, fat, fatFree: weight - fat };
    });
  const avg = (pick: (pair: (typeof pairs)[number]) => number) => {
    const value = mean(pairs.map(pick));
    return value === null ? null : round2(value);
  };
  return {
    pairs: pairs.length,
    weightKg: avg((pair) => pair.weight),
    bodyFatPercent: avg((pair) => pair.bodyFat),
    fatMassKg: avg((pair) => pair.fat),
    fatFreeMassKg: avg((pair) => pair.fatFree),
  };
}

function compositionPattern(change: NonNullable<CompositionTrend["change"]>): CompositionPattern {
  const { notableKg, fatFreeShare } = TREND_POLICY.composition;
  const { weightKg, fatMassKg, fatFreeMassKg } = change;
  if (weightKg <= -notableKg) {
    if (fatFreeMassKg >= -notableKg) return "fat_loss";
    return Math.abs(fatFreeMassKg) / Math.abs(weightKg) >= fatFreeShare ? "fat_free_loss_high" : "mixed_loss";
  }
  if (weightKg >= notableKg) return fatFreeMassKg / weightKg >= fatFreeShare ? "gain_mostly_fat_free" : "gain_mostly_fat";
  if (fatMassKg <= -notableKg && fatFreeMassKg >= notableKg) return "recomposition_signal";
  return "stable";
}

function compositionStatement(pattern: CompositionPattern, change: NonNullable<CompositionTrend["change"]>): string {
  const days = TREND_POLICY.composition.recentDays;
  const head = `Rata-rata ${days} hari terakhir dibanding ${days} hari sebelumnya: berat ${change.weightKg > 0 ? "+" : change.weightKg < 0 ? "-" : ""}${fmt(change.weightKg)} kg, massa lemak ${change.fatMassKg > 0 ? "+" : change.fatMassKg < 0 ? "-" : ""}${fmt(change.fatMassKg)} kg, massa bebas lemak ${change.fatFreeMassKg > 0 ? "+" : change.fatFreeMassKg < 0 ? "-" : ""}${fmt(change.fatFreeMassKg)} kg (estimasi timbangan).`;
  const tail: Record<CompositionPattern, string> = {
    fat_loss: "Penurunan berat terbaca terutama dari massa lemak, sementara massa bebas lemak relatif stabil.",
    fat_free_loss_high: "Sebagian besar penurunan berat terbaca dari massa bebas lemak. Bagian ini mencakup air, glikogen, dan organ, bukan hanya otot, jadi belum tentu kehilangan otot.",
    mixed_loss: "Penurunan berat terbaca dari campuran massa lemak dan massa bebas lemak.",
    gain_mostly_fat: "Kenaikan berat terbaca terutama dari massa lemak.",
    gain_mostly_fat_free: "Kenaikan berat terbaca terutama dari massa bebas lemak.",
    recomposition_signal: "Berat relatif stabil, tetapi massa lemak turun dan massa bebas lemak naik. Ini sinyal awal yang perlu dikonfirmasi beberapa minggu lagi.",
    stable: "Tidak ada perubahan komposisi yang menonjol.",
  };
  return `${head} ${tail[pattern]} Body fat timbangan impedansi sensitif terhadap cairan, waktu, dan kondisi kaki; pakai tren, bukan satu angka.`;
}

export function buildCompositionTrend(snapshots: BodySnapshot[], today: string): CompositionTrend {
  const policy = TREND_POLICY.composition;
  const dates = windowDates(today, policy.recentDays, policy.baselineDays);
  const recent = compositionWindow(snapshots, dates.recent);
  const baseline = compositionWindow(snapshots, dates.baseline);
  const ready = recent.pairs >= policy.minPairs && baseline.pairs >= policy.minPairs;
  const needs = ready
    ? null
    : `Perlu minimal ${policy.minPairs} hari dengan berat dan body fat pada tiap jendela ${policy.recentDays} hari (ada ${recent.pairs} dan ${baseline.pairs}).`;
  const change = ready
    ? {
        weightKg: round2(recent.weightKg! - baseline.weightKg!),
        bodyFatPoints: round2(recent.bodyFatPercent! - baseline.bodyFatPercent!),
        fatMassKg: round2(recent.fatMassKg! - baseline.fatMassKg!),
        fatFreeMassKg: round2(recent.fatFreeMassKg! - baseline.fatFreeMassKg!),
      }
    : null;
  const pattern = change ? compositionPattern(change) : null;
  return {
    ready,
    needs,
    recent,
    baseline,
    change,
    pattern,
    confidence: Math.min(recent.pairs, baseline.pairs) >= policy.mediumPairs ? "medium" : "low",
    statement: change && pattern ? compositionStatement(pattern, change) : null,
  };
}

export function buildFitnessTrends(input: {
  snapshots: BodySnapshot[];
  history: FitnessHistory;
  today: string;
}): FitnessTrends {
  const { snapshots, history, today } = input;
  return {
    composition: buildCompositionTrend(snapshots, today),
    restingHeartRate: buildSeriesTrend(history.restingHeartRate, today, TREND_POLICY.restingHeartRate),
    vo2Max: buildSeriesTrend(history.vo2Max, today, TREND_POLICY.vo2Max),
  };
}

const plural = (days: number) => (days === 1 ? "1 hari lalu" : `${days} hari lalu`);

// Deterministic reasoning. The same sentences feed the screen and the AI prompt,
// so the model explains these observations instead of calculating its own.
export function describeFitnessTrends(trends: FitnessTrends, goal: string): { signals: string[]; priorities: string[] } {
  const signals: string[] = [];
  const priorities: string[] = [];
  const { composition, restingHeartRate: rhr, vo2Max: vo2 } = trends;

  if (composition.statement) signals.push(composition.statement);
  if (composition.pattern === "fat_free_loss_high") {
    priorities.push("Sebagian besar penurunan berat terbaca dari massa bebas lemak: capai target protein dan jaga latihan kekuatan, dan jangan perbesar defisit.");
  }
  if (composition.pattern === "gain_mostly_fat" && goal === "muscle_gain") {
    priorities.push("Kenaikan berat terbaca terutama dari massa lemak (estimasi): pertimbangkan surplus yang lebih kecil.");
  }

  if (rhr.ready && rhr.recent.average !== null && rhr.baseline.average !== null && rhr.delta !== null) {
    const base = `Detak istirahat ${TREND_POLICY.restingHeartRate.recentDays} hari terakhir rata-rata ${rhr.recent.average} bpm (${rhr.recent.samples} hari) dibanding baseline ${rhr.baseline.average} bpm`;
    if (rhr.delta >= TREND_POLICY.restingHeartRate.notableDelta) {
      signals.push(`${base}, lebih tinggi ${fmt(rhr.delta)} bpm. Bisa terkait tidur, stres, kafein, latihan berat, atau kondisi kurang sehat; ini bukan diagnosis.`);
      priorities.push("Detak istirahat lebih tinggi dari baseline: pantau tidur dan pemulihan beberapa hari sebelum menambah beban atau defisit.");
    } else if (rhr.delta <= -3) {
      signals.push(`${base}, lebih rendah ${fmt(rhr.delta)} bpm. Ini dapat selaras dengan pemulihan atau kebugaran yang membaik, tetapi satu rata-rata belum cukup untuk menyimpulkan.`);
    } else {
      signals.push(`${base}, relatif sama (selisih ${fmt(rhr.delta)} bpm).`);
    }
  } else if (rhr.latest && rhr.stale && rhr.ageDays !== null) {
    signals.push(`Detak istirahat terakhir ${rhr.latest.value} bpm tercatat ${plural(rhr.ageDays)}; belum ada data baru dari Apple Health.`);
  }

  if (vo2.latest && vo2.ageDays !== null) {
    if (vo2.ready && vo2.recent.average !== null && vo2.baseline.average !== null && vo2.delta !== null) {
      const direction = vo2.delta >= TREND_POLICY.vo2Max.notableDelta ? "naik" : vo2.delta <= -TREND_POLICY.vo2Max.notableDelta ? "turun" : "relatif sama";
      signals.push(`VO₂ max (estimasi perangkat) ${TREND_POLICY.vo2Max.recentDays} hari terakhir rata-rata ${vo2.recent.average} mL/kg/min dibanding ${vo2.baseline.average} pada periode sebelumnya: ${direction}${direction === "relatif sama" ? "" : ` ${fmt(vo2.delta)}`}.`);
    } else if (vo2.stale) {
      signals.push(`VO₂ max terakhir ${vo2.latest.value} mL/kg/min tercatat ${plural(vo2.ageDays)}. Perangkat biasanya memperbarui nilai ini hanya setelah aktivitas tertentu, jadi angka lama belum tentu menggambarkan kondisi sekarang.`);
    }
  }
  return { signals: signals.slice(0, 5), priorities };
}
