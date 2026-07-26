import { DayLog, UserSettings, WeightEntry } from "./types";
import { summarizeDay } from "./day";
import { WeightTrend } from "./weight";

export interface WeeklyReview {
  weightChange: number | null;
  avgCalories: number;
  avgProtein: number;
  successRate: number;
  bestDay: { date: string; net: number } | null;
  worstDay: { date: string; net: number } | null;
  recommendationFlags: string[];
}

export const FLAG_LABELS: Record<string, string> = {
  "no-weigh-in": "Belum ada catatan berat minggu ini",
  "low-protein": "Asupan protein rata-rata di bawah target",
  "over-budget": "Sering kelebihan kalori minggu ini",
  "weight-plateau": "Berat badan stagnan minggu ini",
  "losing-too-fast": "Penurunan berat lebih cepat dari batas aman (>1.2kg/minggu)",
  "great-week": "Minggu yang solid, pertahankan!",
};

// Pure, deterministic — no AI. The output is shaped so a future summarizer
// (e.g. Gemini) could turn it into a written recap without needing raw logs.
export function computeWeeklyReview(
  last7Logs: DayLog[], // oldest -> newest, 7 entries
  weightEntries: WeightEntry[],
  settings: UserSettings,
  weightTrend: WeightTrend
): WeeklyReview {
  const withData = last7Logs.filter((l) => l.meals.length > 0);

  const avgCalories = withData.length
    ? Math.round(
        withData.reduce((s, l) => s + l.meals.reduce((a, m) => a + m.calories, 0), 0) / withData.length
      )
    : 0;
  const avgProtein = withData.length
    ? Math.round(
        withData.reduce((s, l) => s + l.meals.reduce((a, m) => a + m.protein_g, 0), 0) / withData.length
      )
    : 0;

  const dayStats = withData.map((l) => {
    const summary = summarizeDay(l, settings.dailyTargetKcal);
    return { date: l.date, net: summary.net, diff: summary.net - settings.dailyTargetKcal, onTrack: summary.onTrack };
  });

  const successRate = dayStats.length
    ? Math.round((dayStats.filter((d) => d.onTrack).length / dayStats.length) * 100)
    : 0;

  let bestDay: WeeklyReview["bestDay"] = null;
  let worstDay: WeeklyReview["worstDay"] = null;
  if (dayStats.length) {
    const best = dayStats.reduce((a, b) => (b.diff < a.diff ? b : a));
    const worst = dayStats.reduce((a, b) => (b.diff > a.diff ? b : a));
    bestDay = { date: best.date, net: best.net };
    worstDay = { date: worst.date, net: worst.net };
  }

  const weekDates = new Set(last7Logs.map((l) => l.date));
  const weekWeightEntries = weightEntries
    .filter((e) => weekDates.has(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightChange =
    weekWeightEntries.length >= 2
      ? Math.round((weekWeightEntries[weekWeightEntries.length - 1].weightKg - weekWeightEntries[0].weightKg) * 100) /
        100
      : null;

  const recommendationFlags: string[] = [];
  if (weekWeightEntries.length === 0) recommendationFlags.push("no-weigh-in");
  if (withData.length > 0 && avgProtein < settings.weightKg * 1.2) recommendationFlags.push("low-protein");
  if (dayStats.length > 0 && successRate < 50) recommendationFlags.push("over-budget");
  if (weightTrend.weeklyRate !== null && Math.abs(weightTrend.weeklyRate) < 0.1) {
    recommendationFlags.push("weight-plateau");
  }
  if (weightTrend.weeklyRate !== null && weightTrend.weeklyRate < -1.2) {
    recommendationFlags.push("losing-too-fast");
  }
  if (successRate >= 85 && weightTrend.direction === "down") {
    recommendationFlags.push("great-week");
  }

  return { weightChange, avgCalories, avgProtein, successRate, bestDay, worstDay, recommendationFlags };
}
