import { TARGET_FEEDBACK_MIN_RATIO, foodLogStatus, type FoodLogStatus } from "./energy";
import type { DayLog } from "./types";

// One day, boiled down for the rings in the history: how much was eaten against
// the calorie and protein targets, in the same bands the weekly review uses.
export type CalorieState = "empty" | "below" | "within" | "over";
export type ProteinState = "empty" | "short" | "met";

export interface DayRecap {
  mealCount: number;
  activityCount: number;
  caloriesIn: number;
  caloriesOut: number;
  kcalTarget: number;
  kcalState: CalorieState;
  /** Eaten minus the target, so negative while under it. */
  kcalGap: number;
  /** How much of the ring is drawn, 0 to 1. */
  kcalFill: number;
  /** How far past the target, as a share of the target: a second lap drawn over the first. 0 to 1. */
  kcalOverflow: number;
  proteinG: number;
  proteinTarget: number;
  proteinState: ProteinState;
  /** Target minus eaten, so negative once the target is passed. */
  proteinGap: number;
  proteinFill: number;
  /** Meals saved by hand without a protein figure, which count as 0 g here. */
  proteinUnknown: number;
  status: FoodLogStatus;
}

const fill = (value: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, value / target)) : 0);

export function recapDay(log: DayLog, targets: { kcal: number; protein: number }): DayRecap {
  const caloriesIn = log.meals.reduce((sum, meal) => sum + meal.calories, 0);
  const caloriesOut = log.burns.reduce((sum, burn) => sum + burn.calories, 0);
  const proteinG = log.meals.reduce((sum, meal) => sum + meal.protein_g, 0);
  const mealCount = log.meals.length;
  const kcalState: CalorieState = mealCount === 0 ? "empty"
    : !(targets.kcal > 0) ? "within"
    : caloriesIn > targets.kcal ? "over"
    : caloriesIn < targets.kcal * TARGET_FEEDBACK_MIN_RATIO ? "below"
    : "within";
  const proteinState: ProteinState = mealCount === 0 ? "empty" : targets.protein > 0 && proteinG < targets.protein ? "short" : "met";
  return {
    mealCount,
    activityCount: log.burns.length,
    caloriesIn, caloriesOut,
    kcalTarget: targets.kcal,
    kcalState,
    kcalGap: caloriesIn - targets.kcal,
    kcalFill: fill(caloriesIn, targets.kcal),
    kcalOverflow: targets.kcal > 0 ? Math.min(1, Math.max(0, caloriesIn / targets.kcal - 1)) : 0,
    proteinG,
    proteinTarget: targets.protein,
    proteinState,
    proteinGap: targets.protein - proteinG,
    proteinFill: fill(proteinG, targets.protein),
    proteinUnknown: log.meals.filter((meal) => meal.source === "manual" && meal.protein_g === 0 && !meal.breakdown).length,
    status: foodLogStatus(log),
  };
}

const number = (value: number) => Math.round(value).toLocaleString("id-ID");

/** The words beside the calorie ring. Same names as the weekly review: below range, within range, above target. */
export function describeCalories(recap: DayRecap): { headline: string; detail: string } {
  const gap = number(Math.abs(recap.kcalGap));
  switch (recap.kcalState) {
    case "empty": return { headline: "Belum ada makanan", detail: "" };
    case "below": return { headline: "Di bawah rentang", detail: `kurang ${gap} kcal dari target` };
    case "over": return { headline: "Di atas target", detail: `lebih ${gap} kcal` };
    default: return { headline: "Dalam rentang", detail: recap.kcalGap === 0 ? "pas dengan target" : `sisa ${gap} kcal` };
  }
}

/** The words beside the protein ring. */
export function describeProtein(recap: DayRecap): { headline: string; detail: string } {
  if (recap.proteinState === "empty") return { headline: "Belum ada makanan", detail: "" };
  if (recap.proteinState === "short") return { headline: "Belum sampai target", detail: `kurang ${number(recap.proteinGap)} g` };
  return { headline: "Target tercapai", detail: recap.proteinGap < 0 ? `lebih ${number(-recap.proteinGap)} g` : "" };
}
