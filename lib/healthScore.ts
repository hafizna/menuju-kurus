import { DayLog } from "./types";
import { DaySummary } from "./day";
import { WeightTrend } from "./weight";

export interface HealthScore {
  total: number; // 0-100
  calories: number; // out of 30
  protein: number; // out of 20
  weightTrend: number; // out of 20
  activity: number; // out of 15
  consistency: number; // out of 15
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function caloriesScore(summary: DaySummary): number {
  if (summary.net <= summary.target) return 30;
  const over = summary.net - summary.target;
  const falloffRange = Math.max(summary.target * 0.5, 1);
  return Math.round(clamp(30 * (1 - over / falloffRange), 0, 30));
}

function proteinScore(proteinG: number, proteinTargetG: number): number {
  if (proteinTargetG <= 0) return 0;
  return Math.round(clamp(20 * (proteinG / proteinTargetG), 0, 20));
}

// No weigh-in today gets neutral half credit rather than zero — this score
// shouldn't punish someone for not owning a scale that day.
function weightTrendScore(weeklyRate: number | null): number {
  if (weeklyRate === null) return 10;
  const idealCenter = -0.6; // kg/week, a commonly cited sustainable cut pace
  const idealHalfWidth = 0.5;
  const dist = Math.abs(weeklyRate - idealCenter);
  if (dist <= idealHalfWidth) return 20;
  const extra = dist - idealHalfWidth;
  return Math.round(clamp(20 * (1 - extra / 1.0), 0, 20));
}

function activityScore(caloriesOut: number): number {
  const fullCreditAt = 250; // ~30min moderate cardio
  return Math.round(clamp(15 * (caloriesOut / fullCreditAt), 0, 15));
}

function consistencyScore(last7Logs: DayLog[]): number {
  if (last7Logs.length === 0) return 0;
  const daysWithData = last7Logs.filter((l) => l.meals.length > 0).length;
  return Math.round(15 * (daysWithData / last7Logs.length));
}

export function computeHealthScore(input: {
  summary: DaySummary;
  proteinG: number;
  proteinTargetG: number;
  weightTrend: WeightTrend;
  last7Logs: DayLog[];
}): HealthScore {
  const calories = caloriesScore(input.summary);
  const protein = proteinScore(input.proteinG, input.proteinTargetG);
  const weightTrend = weightTrendScore(input.weightTrend.weeklyRate);
  const activity = activityScore(input.summary.caloriesOut);
  const consistency = consistencyScore(input.last7Logs);
  const total = clamp(calories + protein + weightTrend + activity + consistency, 0, 100);
  return { total, calories, protein, weightTrend, activity, consistency };
}
