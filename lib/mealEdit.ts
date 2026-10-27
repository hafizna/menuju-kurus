import { dateKeyFor } from "./dates";
import { sanitizeBreakdown } from "./mealBreakdown";
import type { MealEntry } from "./types";

/** A saved meal can be corrected for today and the six days before it, the same window as the weekly review. */
export const MEAL_EDIT_DAYS = 7;

const DAY_MS = 86_400_000;

function validDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** The oldest date that can still be corrected, given today's date key. */
export function oldestEditableDate(today: string): string {
  return new Date(Date.parse(today) - (MEAL_EDIT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function isEditableDate(value: unknown, today: string): value is string {
  return validDateKey(value) && value <= today && value >= oldestEditableDate(today);
}

const number = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : null;

/**
 * Applies the fields of a correction to a saved meal. Only the fields that are
 * present change, and the id, source and date never do. Returns the problem as
 * a sentence the person can act on when something does not hold up.
 */
export function applyMealEdit(
  meal: MealEntry,
  patch: Record<string, unknown>,
  context: { date: string; timezone: string; now: Date },
): { meal: MealEntry } | { error: string } {
  const next: MealEntry = { ...meal };
  let changed = false;

  if (patch.foodName !== undefined) {
    const name = typeof patch.foodName === "string" ? patch.foodName.trim() : "";
    if (!name || name.length > 120) return { error: "Nama makanan harus diisi, maksimal 120 huruf." };
    next.foodName = name; changed = true;
  }
  if (patch.calories !== undefined) {
    const value = number(patch.calories, 1, 20000);
    if (value === null) return { error: "Kalori harus antara 1 dan 20000." };
    next.calories = value; changed = true;
  }
  for (const [field, max, label] of [["protein_g", 1000, "Protein"], ["carbs_g", 2000, "Karbo"], ["fat_g", 2000, "Lemak"]] as const) {
    if (patch[field] === undefined) continue;
    const value = number(patch[field], 0, max);
    if (value === null) return { error: `${label} harus antara 0 dan ${max} g.` };
    next[field] = value; changed = true;
  }
  if (patch.sugar_g !== undefined) {
    if (patch.sugar_g === null) delete next.sugar_g;
    else {
      const value = number(patch.sugar_g, 0, 300);
      if (value === null) return { error: "Gula tambahan harus antara 0 dan 300 g." };
      next.sugar_g = value;
    }
    changed = true;
  }
  if (patch.portionNote !== undefined) {
    if (patch.portionNote === null || patch.portionNote === "") delete next.portionNote;
    else if (typeof patch.portionNote === "string" && patch.portionNote.length <= 600) next.portionNote = patch.portionNote.trim();
    else return { error: "Catatan porsi terlalu panjang." };
    changed = true;
  }
  if (patch.time !== undefined) {
    const instant = typeof patch.time === "string" ? Date.parse(patch.time) : NaN;
    if (!Number.isFinite(instant) || instant > context.now.getTime() + 5 * 60_000 ||
      dateKeyFor(new Date(instant), context.timezone) !== context.date) {
      return { error: "Jam makan harus sudah terjadi dan tetap di tanggal yang sama." };
    }
    next.time = new Date(instant).toISOString(); changed = true;
  }
  if (patch.breakdown !== undefined) {
    if (patch.breakdown === null) delete next.breakdown;
    else {
      const breakdown = sanitizeBreakdown(patch.breakdown);
      if (!breakdown) return { error: "Rincian makanan tidak valid." };
      next.breakdown = breakdown;
    }
    changed = true;
  }
  if (!changed) return { error: "Tidak ada perubahan untuk disimpan." };
  next.editedAt = context.now.toISOString();
  return { meal: next };
}
