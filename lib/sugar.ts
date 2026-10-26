import type { DayLog, MealEntry } from "./types";

// General reference for added/free sugar (WHO and Kemenkes guidance, rounded);
// a rule of thumb, not medical advice.
export const SUGAR_REFERENCE_G = 50;

export interface DaySugar {
  grams: number;
  knownMeals: number;
  totalMeals: number;
  // True only when every logged meal carries a sugar value.
  complete: boolean;
}

export function daySugar(meals: Pick<MealEntry, "sugar_g">[]): DaySugar {
  let grams = 0;
  let knownMeals = 0;
  for (const meal of meals) {
    if (typeof meal.sugar_g === "number" && Number.isFinite(meal.sugar_g)) {
      grams += meal.sugar_g;
      knownMeals += 1;
    }
  }
  return {
    grams: Math.round(grams),
    knownMeals,
    totalMeals: meals.length,
    complete: meals.length > 0 && knownMeals === meals.length,
  };
}

export interface WeekSugar {
  avgG: number | null;
  daysWithData: number;
  daysOver: number;
}

// Average over days whose sugar is fully known. A day with any meal of unknown
// sugar is skipped instead of being counted low, so old or partial entries
// cannot make the average look better than it is.
export function weekSugar(logs: Pick<DayLog, "meals">[]): WeekSugar {
  const totals = logs.map((log) => daySugar(log.meals)).filter((day) => day.complete);
  if (!totals.length) return { avgG: null, daysWithData: 0, daysOver: 0 };
  const sum = totals.reduce((total, day) => total + day.grams, 0);
  return {
    avgG: Math.round(sum / totals.length),
    daysWithData: totals.length,
    daysOver: totals.filter((day) => day.grams > SUGAR_REFERENCE_G).length,
  };
}

// API input: a missing or non-numeric value stays unknown (undefined), it is
// never coerced to 0. Real values are rounded and capped at 300 g.
export function parseSugarInput(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(300, Math.max(0, Math.round(n)));
}

// One line for Home: partial data is flagged, the weekly average is shown when
// it exists, and the reference reads as a guide rather than a limit.
export function sugarNote(today: DaySugar, week: WeekSugar): string {
  const parts: string[] = [];
  if (!today.complete) parts.push("Sebagian tercatat");
  if (week.avgG !== null) parts.push(`Rata-rata ${week.avgG} g/hari`);
  parts.push(today.grams > SUGAR_REFERENCE_G ? `Di atas patokan ${SUGAR_REFERENCE_G} g` : `Patokan sampai ${SUGAR_REFERENCE_G} g`);
  return parts.join(" · ");
}
