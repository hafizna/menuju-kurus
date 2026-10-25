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
    : [{ name: analysis.foodName, role: "other", grams: 0, calories: analysis.calories, protein_g: analysis.protein_g, carbs_g: analysis.carbs_g, fat_g: analysis.fat_g }];
  const staple = stapleOf(analysis);

  const corrected = components.map((c) => {
    let scale = 1;
    if (staple && c === staple) scale = Math.max(0, (c.grams + adjust.stapleDeltaG) / c.grams);
    else if (c.role === "oil_sauce") scale = OIL_FACTOR[adjust.oil];
    const k = scale * adjust.eaten;
    return { ...c, grams: Math.round(c.grams * k), calories: Math.round(c.calories * k), protein_g: Math.round(c.protein_g * k), carbs_g: Math.round(c.carbs_g * k), fat_g: Math.round(c.fat_g * k) };
  });
  const sum = (field: "calories" | "protein_g" | "carbs_g" | "fat_g") => corrected.reduce((total, c) => total + c[field], 0);
  const calories = sum("calories");
  const ratio = analysis.calories > 0 ? calories / analysis.calories : adjust.eaten;
  return {
    calories,
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    low: Math.round(analysis.kcalLow * ratio),
    high: Math.round(analysis.kcalHigh * ratio),
    components: corrected,
    stapleGrams: staple ? Math.max(0, staple.grams + adjust.stapleDeltaG) : 0,
  };
}
