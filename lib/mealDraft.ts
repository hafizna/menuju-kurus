import type { FoodAnalysis } from "./gemini";
import { COMPONENT_SCALES, NO_ADJUST, type MealAdjust } from "./mealMath";
import { dateKeyFor, zonedTimeToUtcISO } from "./dates";
import type { HabitMeal } from "./habits";
import type { MealEntry } from "./types";

export interface ManualMealDraft { name: string; kcal: string; protein: string; time: string; sugar?: string }
export interface MealDraft {
  result: FoodAnalysis | null;
  name: string;
  adjust: MealAdjust;
  kcalEdit: string | null;
  /** Protein typed over the estimate; null means use the estimate. */
  proteinEdit: string | null;
  /** The note for the AI ("telur 3 butir"). */
  note: string;
  time: string;
  manualOpen: boolean;
  manual: ManualMealDraft;
  /** The "Tulis & hitung" form: whether it is open and what has been written in it. */
  describe: { open: boolean; text: string };
  /** Where `result` came from, so a saved meal records whether it had a photo. */
  resultFrom: "photo" | "text";
  quick: RepeatMeal | null;
  quickPortion: string;
  quickTime: string;
}
const PREFIX = "slothly:meal-draft:v1:";
export function mealDraftUserPrefix(userId: string): string {
  return `${PREFIX}${encodeURIComponent(userId)}:`;
}
export function mealDraftKey(userId: string, date: string): string {
  return `${mealDraftUserPrefix(userId)}${date}`;
}
export function priorMealDraft(storage: Pick<Storage, "length" | "key" | "getItem">, userId: string, currentDate: string): { date: string; draft: MealDraft } | null {
  const prefix = mealDraftUserPrefix(userId);
  const found: Array<{ date: string; draft: MealDraft }> = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date >= currentDate) continue;
    const draft = readMealDraft(storage.getItem(key));
    if (draft && hasMealDraft(draft)) found.push({ date, draft });
  }
  return found.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}
export function emptyMealDraft(time: string): MealDraft {
  return { result: null, name: "", adjust: { ...NO_ADJUST }, kcalEdit: null, proteinEdit: null, note: "", time, manualOpen: false, manual: { name: "", kcal: "", protein: "", time }, describe: { open: false, text: "" }, resultFrom: "photo", quick: null, quickPortion: "1", quickTime: time };
}
export function hasMealDraft(draft: MealDraft): boolean {
  return Boolean(draft.result || draft.name.trim() || draft.manual.name.trim() || draft.manual.kcal || draft.manual.protein || draft.manual.sugar || draft.describe.text.trim() || draft.quick);
}
// Explicit allowlist: image bytes, blob URLs and account metadata never enter storage.
export function serializeMealDraft(draft: MealDraft): string {
  return JSON.stringify({ result: draft.result, name: draft.name, adjust: draft.adjust, kcalEdit: draft.kcalEdit, proteinEdit: draft.proteinEdit, note: draft.note, time: draft.time, manualOpen: draft.manualOpen, manual: draft.manual, describe: draft.describe, resultFrom: draft.resultFrom, quick: draft.quick, quickPortion: draft.quickPortion, quickTime: draft.quickTime });
}
export function readMealDraft(raw: string | null): MealDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as MealDraft;
    if (typeof d.name !== "string" || typeof d.time !== "string" || typeof d.manualOpen !== "boolean" || !d.manual ||
      [d.manual.name, d.manual.kcal, d.manual.protein, d.manual.time].some((v) => typeof v !== "string") ||
      (d.manual.sugar !== undefined && typeof d.manual.sugar !== "string") ||
      !d.adjust || !Number.isFinite(d.adjust.stapleDeltaG) || !["less", "normal", "more"].includes(d.adjust.oil) ||
      ![1, 0.75, 0.5, 0.25].includes(d.adjust.eaten) || (d.kcalEdit !== null && typeof d.kcalEdit !== "string")) return null;
    // Drafts saved before ingredient amounts and typed protein existed lack these fields; they stay readable.
    if (d.adjust.scales !== undefined && (!Array.isArray(d.adjust.scales) || d.adjust.scales.some((value) => !(COMPONENT_SCALES as readonly number[]).includes(value)))) return null;
    if (d.proteinEdit !== undefined && d.proteinEdit !== null && typeof d.proteinEdit !== "string") return null;
    if (d.note !== undefined && typeof d.note !== "string") return null;
    // Drafts saved before "Tulis & hitung" existed lack these two fields.
    if (d.describe !== undefined && (!d.describe || typeof d.describe.open !== "boolean" || typeof d.describe.text !== "string")) return null;
    if (d.resultFrom !== undefined && d.resultFrom !== "photo" && d.resultFrom !== "text") return null;
    d.describe = d.describe ?? { open: false, text: "" };
    d.resultFrom = d.resultFrom ?? "photo";
    d.proteinEdit = d.proteinEdit ?? null;
    d.note = d.note ?? "";
    if (typeof d.quickPortion !== "string" || typeof d.quickTime !== "string" || (d.quick && (typeof d.quick.name !== "string" || typeof d.quick.key !== "string" || typeof d.quick.portion !== "string" || typeof d.quick.detail !== "string" || ![d.quick.kcal, d.quick.protein, d.quick.carbs, d.quick.fat].every(Number.isFinite) || (d.quick.sugar !== undefined && !Number.isFinite(d.quick.sugar))))) return null;
    if (d.result && (!Array.isArray(d.result.components) || typeof d.result.foodName !== "string" || typeof d.result.portionNote !== "string" ||
      ![d.result.calories, d.result.protein_g, d.result.carbs_g, d.result.fat_g, d.result.kcalLow, d.result.kcalHigh].every(Number.isFinite) ||
      !["low", "medium", "high"].includes(d.result.confidence) ||
      d.result.components.some((c) => typeof c.name !== "string" || !["staple", "oil_sauce", "other"].includes(c.role) ||
        ![c.grams, c.calories, c.protein_g, c.carbs_g, c.fat_g].every(Number.isFinite)))) return null;
    return d;
  } catch { return null; }
}
export function mealTimeIso(time: string, date: string, timezone: string, now = new Date(), explicitlyContinuePreviousDate = false): string | null {
  const today = dateKeyFor(now, timezone);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
    date > today || (date !== today && !explicitlyContinuePreviousDate)) return null;
  const [h, m] = time.split(":").map(Number);
  const iso = zonedTimeToUtcISO(date, h, m, timezone);
  const instant = Date.parse(iso);
  return instant <= now.getTime() + 5 * 60_000 && instant >= now.getTime() - 36 * 3_600_000 ? iso : null;
}
export function formatMealTime(value: string, timezone: string): string {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Jam belum tersedia";
  try { return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date); }
  catch { return "Jam belum tersedia"; }
}
export interface RepeatMeal {
  key: string; name: string; kcal: number; protein: number; carbs: number; fat: number; sugar?: number; portion: string; detail: string;
}
export function recentMealChoices(meals: MealEntry[], recurring: HabitMeal[], limit = 3): RepeatMeal[] {
  const choices: RepeatMeal[] = [];
  const names = new Set<string>();
  const add = (meal: RepeatMeal) => {
    const normalized = meal.name.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
    if (!normalized || names.has(normalized) || choices.length >= limit) return;
    names.add(normalized); choices.push(meal);
  };
  [...meals].sort((a, b) => b.time.localeCompare(a.time)).forEach((m) => add({ key: m.id, name: m.foodName, kcal: m.calories, protein: m.protein_g, carbs: m.carbs_g, fat: m.fat_g, sugar: m.sugar_g, portion: m.portionNote || "1 porsi catatan terakhir", detail: "Terakhir dicatat" }));
  recurring.forEach((m) => add({ key: m.key, name: m.name, kcal: m.averageCalories, protein: m.averageProteinG, carbs: m.averageCarbsG, fat: m.averageFatG, portion: m.portionNote || "1 porsi biasanya", detail: `Rata-rata ${m.count} catatan` }));
  return choices;
}

/** The value for an <input type="time"> (HH:mm) from a saved meal time, in the person's timezone. */
export function mealTimeInput(value: string, timezone: string): string {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const format = (zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  try { return format(timezone); } catch { return format("Asia/Jakarta"); }
}

/**
 * The instant for a time of day on a given date. Unlike mealTimeIso it has no
 * 36 hour limit, because a correction keeps the meal on its own date; the
 * server checks that the date is unchanged and that the time has happened.
 */
export function mealTimeToIso(time: string, date: string, timezone: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [h, m] = time.split(":").map(Number);
  return zonedTimeToUtcISO(date, h, m, timezone);
}
