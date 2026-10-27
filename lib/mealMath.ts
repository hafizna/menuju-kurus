import type { FoodAnalysis, FoodComponent } from "./gemini";

export type OilLevel = "less" | "normal" | "more";
export type EatenFraction = 1 | 0.75 | 0.5 | 0.25;

export interface MealAdjust {
  stapleDeltaG: number;
  oil: OilLevel;
  eaten: EatenFraction;
  /**
   * How much of each other ingredient (not rice, not oil), index-aligned with the
   * analysis components; missing means 1. This is how "telur 1 -> 3" is expressed.
   */
  scales?: number[];
}

/** The amounts a person can step through for one ingredient. */
export const COMPONENT_SCALES = [0, 0.5, 1, 1.5, 2, 3, 4, 5] as const;
export function stepScale(current: number, direction: 1 | -1): number {
  const index = COMPONENT_SCALES.findIndex((value) => value >= current);
  const at = index === -1 ? COMPONENT_SCALES.length - 1 : index;
  const next = direction === 1
    ? (COMPONENT_SCALES[at] > current ? at : at + 1)
    : at - 1;
  return COMPONENT_SCALES[Math.min(COMPONENT_SCALES.length - 1, Math.max(0, next))];
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

  const corrected = components.map((c, index) => {
    let scale = 1;
    if (staple && c === staple) scale = Math.max(0, (c.grams + adjust.stapleDeltaG) / c.grams);
    else if (c.role === "oil_sauce") scale = OIL_FACTOR[adjust.oil];
    else if (c.role === "other") scale = adjust.scales?.[index] ?? 1;
    const k = scale * adjust.eaten;
    return { ...c, grams: Math.round(c.grams * k), calories: Math.round(c.calories * k), protein_g: Math.round(c.protein_g * k), carbs_g: Math.round(c.carbs_g * k), fat_g: Math.round(c.fat_g * k), sugar_g: Math.round(c.sugar_g * k) };
  });
  const sum = (field: "calories" | "protein_g" | "carbs_g" | "fat_g" | "sugar_g") => corrected.reduce((total, c) => total + c[field], 0);
  const calories = sum("calories");
  const ratio = analysis.calories > 0 ? calories / analysis.calories : adjust.eaten;
  return {
    calories,
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    // A restored draft from before sugar existed has no value: stay unknown, not 0.
    sugar_g: components.every((c) => Number.isFinite(c.sugar_g)) ? sum("sugar_g") : undefined,
    low: Math.round(analysis.kcalLow * ratio),
    high: Math.round(analysis.kcalHigh * ratio),
    components: corrected,
    stapleGrams: staple ? Math.max(0, staple.grams + adjust.stapleDeltaG) : 0,
  };
}

/**
 * The numbers that get saved: the estimate from the ingredients and corrections,
 * unless the person typed their own calories or protein, which win. Typed
 * calories do not rescale the other macros, and the screen says so.
 */
export function mealTotals(analysis: FoodAnalysis, adjust: MealAdjust, kcalEdit: string | null, proteinEdit: string | null) {
  const meal = adjustMeal(analysis, adjust);
  return {
    meal,
    calories: kcalEdit !== null ? Number(kcalEdit) : meal.calories,
    protein_g: proteinEdit !== null ? Number(proteinEdit) : meal.protein_g,
  };
}

/** The one-line description kept with a saved meal, so the note always matches the corrections behind it. */
export function portionSummary(
  analysis: FoodAnalysis,
  adjust: MealAdjust,
  meal: ReturnType<typeof adjustMeal>,
  overrides: { kcal: boolean; protein: boolean },
): string {
  const staple = stapleOf(analysis);
  const oil = { less: "sedikit", normal: "biasa", more: "banyak" }[adjust.oil];
  const amounts = analysis.components.flatMap((c, i) =>
    c.role === "other" && (adjust.scales?.[i] ?? 1) !== 1 ? [`${c.name} ×${adjust.scales?.[i]}`] : []);
  return `${analysis.portionNote}${staple ? ` · ${staple.name} ${meal.stapleGrams} g di piring` : ""}${hasOil(analysis) ? ` · minyak/saus ${oil}` : ""}${amounts.length ? ` · ${amounts.join(", ")}` : ""} · dimakan ${adjust.eaten * 100}%${overrides.kcal ? " · kalori dikoreksi manual; makro tetap estimasi porsi" : ""}${overrides.protein ? " · protein dikoreksi manual" : ""}`;
}
