import type { DayLog } from "./types";

export type FoodLogStatus = "empty" | "partial" | "complete";

// A product feedback band, not a clinical minimum or a reason to stop eating.
export const TARGET_FEEDBACK_MIN_RATIO = 0.8;

export function foodLogStatus(log: DayLog): FoodLogStatus {
  if (log.foodLogComplete === true) return "complete";
  return log.meals.length ? "partial" : "empty";
}

export interface DaySummary {
  caloriesIn: number;
  caloriesOut: number;
  /** Informational intake minus recorded activity; never used as a food budget. */
  net: number;
  target: number;
  remaining: number;
  onTrack: boolean;
  foodLogStatus: FoodLogStatus;
}

export function summarizeDay(log: DayLog, target: number): DaySummary {
  const caloriesIn = log.meals.reduce((sum, meal) => sum + meal.calories, 0);
  const caloriesOut = log.burns.reduce((sum, burn) => sum + burn.calories, 0);
  const status = foodLogStatus(log);
  return {
    caloriesIn, caloriesOut, net: caloriesIn - caloriesOut, target,
    remaining: target - caloriesIn,
    onTrack: status === "complete" && target > 0 &&
      caloriesIn >= target * TARGET_FEEDBACK_MIN_RATIO && caloriesIn <= target,
    foodLogStatus: status,
  };
}

export interface WeeklyBudget {
  weeklyTarget: number;
  consumed: number;
  /** Provisional until every day's food log is confirmed complete. */
  remaining: number;
  completedDays: number;
  totalDays: number;
  isComplete: boolean;
}

export function computeWeeklyBudget(logs: DayLog[], dailyTarget: number): WeeklyBudget {
  const weeklyTarget = dailyTarget * logs.length;
  const consumed = logs.reduce((sum, log) => sum + summarizeDay(log, dailyTarget).caloriesIn, 0);
  const completedDays = logs.filter((log) => foodLogStatus(log) === "complete").length;
  return {
    weeklyTarget, consumed, remaining: weeklyTarget - consumed,
    completedDays, totalDays: logs.length,
    isComplete: logs.length > 0 && completedDays === logs.length,
  };
}
