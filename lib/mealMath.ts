import type { FoodAnalysis, FoodComponent } from "./gemini";

export type OilLevel = "less" | "normal" | "more";
export type EatenFraction = 1 | 0.75 | 0.5 | 0.25;

export interface MealAdjust {
  stapleDeltaG: number;
  oil: OilLevel;
  eaten: EatenFraction;
}

export const NO_ADJUST: MealAdjust = { stapleDeltaG: 0, oil: "normal", eaten: 1 };
export const STAPLE_STEP_G = 50;
export const CENTONG_G = 100;
const OIL_FACTOR: Record<OilLevel, number> = { less: 0.5, normal: 1, more: 1.6 };

export function stapleOf(analysis: Pick<FoodAnalysis, "components">): FoodComponent | undefined {
  return analysis.components.find((c) => c.role === "staple" && c.grams > 0);
}

export function hasOil(analysis: Pick<FoodAnalysis, "components">): boolean {
  return analysis.components.some((c) => c.role === "oil_sauce");
}

// Recomputes the meal from the user's concrete corrections (how much rice,
// how oily, how much of the plate was eaten) instead of one abstract multiplier.
export function adjustMeal(analysis: FoodAnalysis, adjust: MealAdjust) {
  const components: FoodComponent[] = analysis.components.length
    ? analysis.components
    : [{ name: analysis.foodName, role: "other", grams: 0, calories: analysis.calories, protein_g: analysis.protein_g, carbs_g: analysis.carbs_g, fat_g: analysis.fat_g, sugar_g: analysis.sugar_g }];
  const staple = stapleOf(analysis);

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let sugar = 0;
  for (const c of components) {
    let scale = 1;
    if (staple && c === staple) scale = Math.max(0, (c.grams + adjust.stapleDeltaG) / c.grams);
    else if (c.role === "oil_sauce") scale = OIL_FACTOR[adjust.oil];
    calories += c.calories * scale;
    protein += c.protein_g * scale;
    carbs += c.carbs_g * scale;
    fat += c.fat_g * scale;
    sugar += c.sugar_g * scale;
  }

  const k = adjust.eaten;
  const ratio = analysis.calories > 0 ? calories / analysis.calories : 1;
  return {
    calories: Math.round(calories * k),
    protein_g: Math.round(protein * k),
    carbs_g: Math.round(carbs * k),
    fat_g: Math.round(fat * k),
    sugar_g: Math.round(sugar * k),
    low: Math.round(analysis.kcalLow * ratio * k),
    high: Math.round(analysis.kcalHigh * ratio * k),
    stapleGrams: staple ? Math.max(0, staple.grams + adjust.stapleDeltaG) : 0,
  };
}
