import type { FitnessGoal, UserSettings, WeightEntry } from "./types";
import type { WeightTrend } from "./weight";

export interface FitnessIntelligence {
  goal: FitnessGoal;
  label: string;
  score: number;
  scoreLabel: "needs-attention" | "building" | "on-track";
  dataConfidence: "low" | "medium" | "high";
  bodyFatLatest: number | null;
  weightTrendKgWeek: number | null;
  vo2Max: number | null;
  restingHeartRate: number | null;
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
  weightEntries: WeightEntry[]
): FitnessIntelligence {
  const latestBodyFat = weightEntries
    .filter((entry) => typeof entry.bodyFat === "number")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.bodyFat ?? null;

  const hasWeightTrend = trend.weeklyRate !== null;
  const availableMetrics = [hasWeightTrend, latestBodyFat !== null, settings.vo2Max !== null, settings.restingHeartRate !== null]
    .filter(Boolean).length;
  const dataConfidence = availableMetrics >= 4 ? "high" : availableMetrics >= 2 ? "medium" : "low";

  let score = 45;
  const priorities: string[] = [];
  const rate = trend.weeklyRate;

  if (settings.fitnessGoal === "weight_loss") {
    if (rate !== null && rate <= -0.2 && rate >= -1) score += 25;
    else if (rate !== null && rate > 0.1) priorities.push("Kembalikan rata-rata kalori ke target tanpa kompensasi ekstrem.");
    else priorities.push("Kumpulkan penimbangan rutin agar laju penurunan bisa dinilai.");
    if (settings.strengthDaysWeekly >= 2) score += 15;
    else priorities.push("Tambahkan 2 sesi latihan kekuatan untuk membantu mempertahankan otot.");
    if (settings.cardioMinutesWeekly >= 120) score += 15;
    else priorities.push("Naikkan aktivitas aerobik secara bertahap menuju sekitar 120–150 menit per minggu.");
  }

  if (settings.fitnessGoal === "very_lean") {
    if (rate !== null && rate < -0.1 && rate >= -0.7) score += 20;
    if (settings.strengthDaysWeekly >= 3) score += 25;
    else priorities.push("Prioritaskan setidaknya 3 hari latihan kekuatan agar massa otot tetap terjaga.");
    if (latestBodyFat !== null) score += 10;
    else priorities.push("Gunakan tren body fat beberapa minggu, bukan satu angka timbangan.");
    priorities.push("Jangan mempercepat defisit bila energi, tidur, atau performa latihan menurun.");
  }

  if (settings.fitnessGoal === "athletic") {
    if (settings.cardioMinutesWeekly >= 150) score += 20;
    else priorities.push("Bangun volume kardio menuju 150 menit per minggu secara bertahap.");
    if (settings.strengthDaysWeekly >= 2) score += 20;
    else priorities.push("Tambahkan minimal 2 hari latihan kekuatan untuk keseimbangan performa.");
    if (settings.vo2Max !== null) score += 10;
    else priorities.push("Catat VO₂ max agar perkembangan kapasitas aerobik bisa dipantau.");
    if (settings.restingHeartRate !== null) score += 5;
  }

  if (settings.fitnessGoal === "muscle_gain") {
    if (rate !== null && rate >= 0.1 && rate <= 0.5) score += 20;
    else if (rate !== null && rate > 0.7) priorities.push("Kenaikan berat terlihat cepat; pertimbangkan surplus yang lebih kecil.");
    else priorities.push("Pantau tren berat untuk memastikan kenaikan berlangsung perlahan dan terkontrol.");
    if (settings.strengthDaysWeekly >= 3) score += 30;
    else priorities.push("Targetkan 3–5 sesi latihan kekuatan progresif per minggu.");
    if (settings.cardioMinutesWeekly >= 60) score += 5;
  }

  const finalScore = clamp(score);
  const scoreLabel = finalScore >= 75 ? "on-track" : finalScore >= 55 ? "building" : "needs-attention";
  const recap = `${LABELS[settings.fitnessGoal]} score ${finalScore}/100. ${
    dataConfidence === "low"
      ? "Data masih terbatas, jadi fokus utama saat ini adalah membangun baseline yang konsisten."
      : "Penilaian menggunakan tren berat dan metrik fitness yang tersedia, bukan satu pengukuran saja."
  }`;

  return {
    goal: settings.fitnessGoal,
    label: LABELS[settings.fitnessGoal],
    score: finalScore,
    scoreLabel,
    dataConfidence,
    bodyFatLatest: latestBodyFat,
    weightTrendKgWeek: trend.weeklyRate,
    vo2Max: settings.vo2Max,
    restingHeartRate: settings.restingHeartRate,
    cardioMinutes: settings.cardioMinutesWeekly,
    strengthDays: settings.strengthDaysWeekly,
    priorities: priorities.slice(0, 3),
    recap,
  };
}
