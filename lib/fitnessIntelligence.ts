import type { FitnessGoal, UserSettings, WeightEntry } from "./types";
import type { WeightTrend } from "./weight";
import { lastNDateKeys } from "./dates";
import type { FitnessMeasurement, FitnessMeasurements } from "./fitnessMeasurements";

export interface FitnessIntelligence {
  goal: FitnessGoal;
  label: string;
  score: number | null;
  scoreLabel: "baseline" | "needs-attention" | "building" | "on-track";
  baselineReady: boolean;
  baselineReasons: string[];
  dataConfidence: "low" | "medium" | "high";
  bodyFatLatest: number | null;
  bodyFatDate: string | null;
  bodyFatSource: "manual" | "shortcuts" | null;
  weightTrendKgWeek: number | null;
  vo2Max: number | null;
  restingHeartRate: number | null;
  vo2MaxReading?: FitnessMeasurement | null;
  restingHeartRateReading?: FitnessMeasurement | null;
  cardioMinutes: number;
  strengthDays: number;
  priorities: string[];
  recap: string;
}

const LABELS: Record<FitnessGoal, string> = {
  weight_loss: "Weight Loss",
  very_lean: "Very Lean",
  athletic: "Athletic",
  muscle_gain: "Muscle Gain",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeFitnessIntelligence(
  settings: UserSettings,
  trend: WeightTrend,
  weightEntries: WeightEntry[],
  bodyFat?: {
    value: number;
    date: string;
    source: "manual" | "shortcuts";
  } | null,
  fitnessMeasurements: FitnessMeasurements = {},
): FitnessIntelligence {
  // Imported observations keep their provenance separately from editable
  // profile defaults. Use the same effective values throughout the score,
  // baseline, returned metrics, and generated recap.
  settings = {
    ...settings,
    vo2Max: fitnessMeasurements.vo2Max?.value ?? settings.vo2Max,
    restingHeartRate: fitnessMeasurements.restingHeartRate?.value ?? settings.restingHeartRate,
  };
  const legacyBodyFat = weightEntries
    .filter((entry) => typeof entry.bodyFat === "number")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestBodyFat =
    bodyFat === undefined
      ? (legacyBodyFat?.bodyFat ?? null)
      : (bodyFat?.value ?? null);
  const bodyFatDate =
    bodyFat === undefined
      ? (legacyBodyFat?.date ?? null)
      : (bodyFat?.date ?? null);
  const bodyFatSource =
    bodyFat === undefined
      ? (legacyBodyFat?.bodyFatSource ?? legacyBodyFat?.source ?? null)
      : (bodyFat?.source ?? null);

  const hasWeightTrend = trend.weeklyRate !== null;
  const availableMetrics = [
    hasWeightTrend,
    latestBodyFat !== null,
    settings.vo2Max !== null,
    settings.restingHeartRate !== null,
  ].filter(Boolean).length;
  const dataConfidence =
    availableMetrics >= 4 ? "high" : availableMetrics >= 2 ? "medium" : "low";

  const baselineReasons: string[] = [];
  if (settings.fitnessGoal === "athletic") {
    if (settings.vo2Max === null && settings.restingHeartRate === null)
      baselineReasons.push("Isi VO₂ max atau detak jantung istirahat di Profil. Detak istirahat bisa dihitung sendiri dari nadi saat bangun tidur, tanpa jam tangan.");
    if (settings.cardioMinutesWeekly === 0 && settings.strengthDaysWeekly === 0)
      baselineReasons.push("Lengkapi profil latihan mingguan untuk mulai membaca fokus fitness.");
  } else {
    const dates = lastNDateKeys(14, settings.timezone);
    const observed = new Set(weightEntries.filter((entry) => dates.includes(entry.date) && Number.isFinite(entry.weightKg) && entry.weightKg > 0).map((entry) => entry.date));
    const previousSamples = dates.slice(0, 7).filter((date) => observed.has(date)).length;
    const recentSamples = dates.slice(7).filter((date) => observed.has(date)).length;
    if (!hasWeightTrend || previousSamples < 2 || recentSamples < 2)
      baselineReasons.push(`Berat tersedia ${previousSamples} kali pada 7 hari sebelumnya dan ${recentSamples} kali pada 7 hari terakhir. Skor menunggu setidaknya 2 pada tiap jendela.`);
  }
  const baselineReady = baselineReasons.length === 0;

  let score = 45;
  const priorities: string[] = [];
  const rate = trend.weeklyRate;

  if (settings.fitnessGoal === "weight_loss") {
    if (rate !== null && rate <= -0.2 && rate >= -1) score += 25;
    else if (rate !== null && rate > 0.1)
      priorities.push(
        "Kembalikan rata-rata kalori ke target tanpa kompensasi ekstrem.",
      );
    else
      priorities.push(
        "Kumpulkan penimbangan rutin agar laju penurunan bisa dinilai.",
      );
    if (settings.strengthDaysWeekly >= 2) score += 15;
    else
      priorities.push(
        "Tambahkan 2 sesi latihan kekuatan untuk membantu mempertahankan otot.",
      );
    if (settings.cardioMinutesWeekly >= 120) score += 15;
    else
      priorities.push(
        "Naikkan aktivitas aerobik secara bertahap menuju sekitar 120–150 menit per minggu.",
      );
  }

  if (settings.fitnessGoal === "very_lean") {
    if (rate !== null && rate < -0.1 && rate >= -0.7) score += 20;
    if (settings.strengthDaysWeekly >= 3) score += 25;
    else
      priorities.push(
        "Prioritaskan setidaknya 3 hari latihan kekuatan agar massa otot tetap terjaga.",
      );
    if (latestBodyFat !== null) score += 10;
    else
      priorities.push(
        "Gunakan tren body fat beberapa minggu, bukan satu angka timbangan.",
      );
    priorities.push(
      "Jangan mempercepat defisit bila energi, tidur, atau performa latihan menurun.",
    );
  }

  if (settings.fitnessGoal === "athletic") {
    if (settings.cardioMinutesWeekly >= 150) score += 20;
    else
      priorities.push(
        "Bangun volume kardio menuju 150 menit per minggu secara bertahap.",
      );
    if (settings.strengthDaysWeekly >= 2) score += 20;
    else
      priorities.push(
        "Tambahkan minimal 2 hari latihan kekuatan untuk keseimbangan performa.",
      );
    if (settings.vo2Max !== null) score += 10;
    else
      priorities.push(
        "Catat VO₂ max agar perkembangan kapasitas aerobik bisa dipantau.",
      );
    if (settings.restingHeartRate !== null) score += 5;
  }

  if (settings.fitnessGoal === "muscle_gain") {
    if (rate !== null && rate >= 0.1 && rate <= 0.5) score += 20;
    else if (rate !== null && rate > 0.7)
      priorities.push(
        "Kenaikan berat terlihat cepat; pertimbangkan surplus yang lebih kecil.",
      );
    else
      priorities.push(
        "Pantau tren berat untuk memastikan kenaikan berlangsung perlahan dan terkontrol.",
      );
    if (settings.strengthDaysWeekly >= 3) score += 30;
    else
      priorities.push(
        "Targetkan 3–5 sesi latihan kekuatan progresif per minggu.",
      );
    if (settings.cardioMinutesWeekly >= 60) score += 5;
  }

  const finalScore = baselineReady ? clamp(score) : null;
  const scoreLabel =
    finalScore === null
      ? "baseline"
      : finalScore >= 75
      ? "on-track"
      : finalScore >= 55
        ? "building"
        : "needs-attention";
  const recap = finalScore === null
    ? "Sedang membangun baseline. Data yang belum tersedia belum menjadi penilaian performamu."
    : `${LABELS[settings.fitnessGoal]} score ${finalScore}/100. ${
    dataConfidence === "low"
      ? "Data masih terbatas, jadi fokus utama saat ini adalah membangun baseline yang konsisten."
      : "Penilaian menggunakan tren berat dan metrik fitness yang tersedia, bukan satu pengukuran saja."
  }`;

  return {
    goal: settings.fitnessGoal,
    label: LABELS[settings.fitnessGoal],
    score: finalScore,
    scoreLabel,
    baselineReady,
    baselineReasons,
    dataConfidence,
    bodyFatLatest: latestBodyFat,
    bodyFatDate,
    bodyFatSource,
    weightTrendKgWeek: trend.weeklyRate,
    vo2Max: settings.vo2Max,
    restingHeartRate: settings.restingHeartRate,
    vo2MaxReading: fitnessMeasurements.vo2Max ?? null,
    restingHeartRateReading: fitnessMeasurements.restingHeartRate ?? null,
    cardioMinutes: settings.cardioMinutesWeekly,
    strengthDays: settings.strengthDaysWeekly,
    priorities: priorities.slice(0, 3),
    recap,
  };
}
