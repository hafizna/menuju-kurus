import { normalizeFoodAnalysis, type FoodAnalysis } from "./gemini";
import { COMPONENT_SCALES, type MealAdjust, type OilLevel, type EatenFraction } from "./mealMath";
import { cleanNote } from "./mealNote";

/**
 * What is kept with a photo meal: the ingredient estimate, the corrections made
 * to it, any typed calories or protein, and the note given to the AI. With this
 * a saved meal can be opened again and corrected the same way it was reviewed.
 */
export interface MealBreakdown {
  analysis: FoodAnalysis;
  adjust: MealAdjust;
  kcalEdit: number | null;
  proteinEdit: number | null;
  note?: string;
}

const OILS: OilLevel[] = ["less", "normal", "more"];
const EATEN: EatenFraction[] = [1, 0.75, 0.5, 0.25];

function wholeOrNull(value: unknown, max: number): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return undefined;
  return Math.round(value);
}

/** Returns a clean breakdown, or null when the input cannot be trusted. */
export function sanitizeBreakdown(raw: unknown): MealBreakdown | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  if (!input.analysis || typeof input.analysis !== "object" || Array.isArray(input.analysis)) return null;
  const analysis = normalizeFoodAnalysis(input.analysis as Parameters<typeof normalizeFoodAnalysis>[0]);
  if (!analysis.components.length) return null;

  const adjustInput = input.adjust as Record<string, unknown> | undefined;
  if (!adjustInput || typeof adjustInput !== "object") return null;
  const stapleDeltaG = adjustInput.stapleDeltaG;
  if (typeof stapleDeltaG !== "number" || !Number.isFinite(stapleDeltaG) || Math.abs(stapleDeltaG) > 800) return null;
  if (!OILS.includes(adjustInput.oil as OilLevel) || !EATEN.includes(adjustInput.eaten as EatenFraction)) return null;
  const adjust: MealAdjust = { stapleDeltaG: Math.round(stapleDeltaG), oil: adjustInput.oil as OilLevel, eaten: adjustInput.eaten as EatenFraction };
  if (adjustInput.scales !== undefined) {
    const scales = adjustInput.scales;
    // A scale that does not line up with the ingredients would change the wrong one.
    if (!Array.isArray(scales) || scales.length !== analysis.components.length ||
      scales.some((value) => !(COMPONENT_SCALES as readonly number[]).includes(value as number))) return null;
    if (scales.some((value) => value !== 1)) adjust.scales = scales as number[];
  }

  const kcalEdit = wholeOrNull(input.kcalEdit, 20000);
  const proteinEdit = wholeOrNull(input.proteinEdit, 1000);
  if (kcalEdit === undefined || proteinEdit === undefined) return null;
  const note = cleanNote(input.note);
  return { analysis, adjust, kcalEdit, proteinEdit, ...(note ? { note } : {}) };
}
