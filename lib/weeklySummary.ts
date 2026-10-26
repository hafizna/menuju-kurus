import { createHash } from "node:crypto";
import { computeWeeklyReview } from "./weeklyReview";
import type { WeeklySummaryInput } from "./weeklySummaryAi";
import type { DayLog, UserSettings, WeeklySummary, WeightEntry } from "./types";
import type { WeightTrend } from "./weight";

export interface StoredWeeklySummary extends WeeklySummary {
  periodStart: string | null;
  periodEnd: string | null;
  fingerprint: string;
}

// signals: deterministic observations from imported history (see lib/fitnessTrends.ts).
// They are part of the input, so a change in them also marks a saved summary stale.
export function weeklySummaryContext(logs: DayLog[], weights: WeightEntry[], settings: UserSettings, trend: WeightTrend, signals: string[] = []) {
  const review = computeWeeklyReview(logs, weights, settings, trend);
  const input: WeeklySummaryInput = {
    weightTrend: trend.weeklyRate, weeklyCalories: review.avgCalories,
    protein: review.avgProtein, exercise: review.exerciseDays, successRate: review.successRate,
    completedFoodDays: review.completedDays, totalDays: review.totalDays,
    belowRangeDays: review.belowRangeDays, withinRangeDays: review.withinRangeDays,
    aboveRangeDays: review.aboveRangeDays, incompleteDays: review.incompleteDays,
    fitnessGoal: settings.fitnessGoal, proteinTargetG: settings.proteinTargetG,
    periodStart: review.periodStart, periodEnd: review.periodEnd,
    ...(signals.length ? { signals } : {}),
  };
  // Numeric observations invalidate a narrative even when rounded means match.
  const observations = logs.map((log) => ({
    date: log.date, complete: log.foodLogComplete === true,
    meals: log.meals.map((meal) => [meal.calories, meal.protein_g, meal.carbs_g, meal.fat_g]),
    activity: log.burns.map((burn) => [burn.calories, burn.source]),
  }));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ version: 3, input, observations, target: settings.dailyTargetKcal,
      weights: weights.map((entry) => [entry.date, entry.weightKg]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    }))
    .digest("hex");
  return { input, fingerprint, periodStart: review.periodStart, periodEnd: review.periodEnd };
}

export function weeklySummaryIsStale(summary: StoredWeeklySummary, context: ReturnType<typeof weeklySummaryContext>) {
  return summary.fingerprint !== context.fingerprint ||
    summary.periodStart !== context.periodStart || summary.periodEnd !== context.periodEnd;
}
