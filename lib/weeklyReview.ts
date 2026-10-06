import { DayLog, UserSettings, WeightEntry } from "./types";
import { summarizeDay, foodLogStatus, TARGET_FEEDBACK_MIN_RATIO } from "./energy";
import { WeightTrend } from "./weight";

export interface WeeklyReview {
  weightChange: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  successRate: number | null;
  completedDays: number;
  totalDays: number;
  exerciseDays: number; // out of the last 7 days, how many had a burn logged
  bestDay: { date: string; caloriesIn: number } | null;
  worstDay: { date: string; caloriesIn: number } | null;
  recommendationFlags: string[];
}

export const FLAG_LABELS: Record<string, string> = {
  "incomplete-food-logs": "Rata-rata hanya memakai catatan makan yang dikonfirmasi lengkap",
  "low-intake": "Ada asupan tercatat jauh di bawah target; tinjau kecukupan makan dan catatan",
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
  const withData = last7Logs.filter((l) => foodLogStatus(l) === "complete");
  const exerciseDays = last7Logs.filter((l) => l.burns.some((burn) => burn.calories > 0)).length;

  const avgCalories = withData.length
    ? Math.round(
        withData.reduce((s, l) => s + l.meals.reduce((a, m) => a + m.calories, 0), 0) / withData.length
      )
    : null;
  const avgProtein = withData.length
    ? Math.round(
        withData.reduce((s, l) => s + l.meals.reduce((a, m) => a + m.protein_g, 0), 0) / withData.length
      )
    : null;

  const dayStats = withData.map((l) => {
    const summary = summarizeDay(l, settings.dailyTargetKcal);
    return { date: l.date, caloriesIn: summary.caloriesIn, diff: summary.caloriesIn - settings.dailyTargetKcal, onTrack: summary.onTrack };
  });

  const successRate = dayStats.length
    ? Math.round((dayStats.filter((d) => d.onTrack).length / dayStats.length) * 100)
    : null;

  let bestDay: WeeklyReview["bestDay"] = null;
  let worstDay: WeeklyReview["worstDay"] = null;
  if (dayStats.length) {
    const best = dayStats.reduce((a, b) => (Math.abs(b.diff) < Math.abs(a.diff) ? b : a));
    const worst = dayStats.reduce((a, b) => (Math.abs(b.diff) > Math.abs(a.diff) ? b : a));
    bestDay = { date: best.date, caloriesIn: best.caloriesIn };
    worstDay = { date: worst.date, caloriesIn: worst.caloriesIn };
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
  if (withData.length < last7Logs.length) recommendationFlags.push("incomplete-food-logs");
  if (dayStats.some((day) => day.caloriesIn < settings.dailyTargetKcal * TARGET_FEEDBACK_MIN_RATIO)) recommendationFlags.push("low-intake");
  if (weekWeightEntries.length === 0) recommendationFlags.push("no-weigh-in");
  if (withData.length > 0 && avgProtein !== null && avgProtein < settings.weightKg * 1.2) recommendationFlags.push("low-protein");
  if (dayStats.filter((day) => day.diff > 0).length > dayStats.length / 2) recommendationFlags.push("over-budget");
  if (weightTrend.weeklyRate !== null && Math.abs(weightTrend.weeklyRate) < 0.1) {
    recommendationFlags.push("weight-plateau");
  }
  if (weightTrend.weeklyRate !== null && weightTrend.weeklyRate < -1.2) {
    recommendationFlags.push("losing-too-fast");
  }
  if (withData.length >= 5 && successRate !== null && successRate >= 85 && weightTrend.direction === "down") {
    recommendationFlags.push("great-week");
  }

  return { completedDays: withData.length, totalDays: last7Logs.length, weightChange, avgCalories, avgProtein, successRate, exerciseDays, bestDay, worstDay, recommendationFlags };
}
