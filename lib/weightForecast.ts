import type { WeightTrend } from "./weight";

export interface WeightForecast {
  status: "ready" | "need-more-data" | "goal-reached" | "moving-away";
  currentWeight: number | null;
  goalWeight: number;
  remainingKg: number | null;
  weeklyRate: number | null;
  estimatedWeeks: number | null;
  estimatedDate: string | null;
  message: string;
}

function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Math.round(weeks * 7));
  return result;
}

export function computeWeightForecast(
  trend: WeightTrend,
  goalWeightKg: number,
  now = new Date()
): WeightForecast {
  const currentWeight = trend.avg7 ?? trend.today;

  if (currentWeight === null) {
    return {
      status: "need-more-data",
      currentWeight: null,
      goalWeight: goalWeightKg,
      remainingKg: null,
      weeklyRate: trend.weeklyRate,
      estimatedWeeks: null,
      estimatedDate: null,
      message: "Catat berat secara rutin agar perkiraan waktu menuju target bisa dihitung.",
    };
  }

  const remainingKg = Math.round((currentWeight - goalWeightKg) * 10) / 10;
  if (remainingKg <= 0) {
    return {
      status: "goal-reached",
      currentWeight,
      goalWeight: goalWeightKg,
      remainingKg: 0,
      weeklyRate: trend.weeklyRate,
      estimatedWeeks: 0,
      estimatedDate: now.toISOString(),
      message: "Target berat sudah tercapai. Fokus berikutnya adalah mempertahankan pola yang stabil.",
    };
  }

  if (trend.weeklyRate === null || Math.abs(trend.weeklyRate) < 0.1) {
    return {
      status: "need-more-data",
      currentWeight,
      goalWeight: goalWeightKg,
      remainingKg,
      weeklyRate: trend.weeklyRate,
      estimatedWeeks: null,
      estimatedDate: null,
      message: "Tren belum cukup stabil untuk membuat ETA. Lanjutkan penimbangan 2–4 kali per minggu.",
    };
  }

  if (trend.weeklyRate > 0) {
    return {
      status: "moving-away",
      currentWeight,
      goalWeight: goalWeightKg,
      remainingKg,
      weeklyRate: trend.weeklyRate,
      estimatedWeeks: null,
      estimatedDate: null,
      message: "Tren saat ini bergerak menjauh dari target. Gunakan ini sebagai sinyal evaluasi, bukan kegagalan.",
    };
  }

  const estimatedWeeks = Math.min(104, remainingKg / Math.abs(trend.weeklyRate));
  return {
    status: "ready",
    currentWeight,
    goalWeight: goalWeightKg,
    remainingKg,
    weeklyRate: trend.weeklyRate,
    estimatedWeeks: Math.round(estimatedWeeks * 10) / 10,
    estimatedDate: addWeeks(now, estimatedWeeks).toISOString(),
    message: "ETA mengikuti laju tren saat ini dan akan berubah saat kebiasaan atau berat badan berubah.",
  };
}
