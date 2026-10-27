// Quick activity logging: a kind plus a duration gives a rough kcal figure, so
// nobody has to know calories to record that they moved. The figure is an
// estimate for the habit record; activity never adds to the food budget.

export interface ActivityKind {
  id: string;
  label: string;
  emoji: string;
  /** Metabolic equivalent of the task, from the common MET tables. */
  met: number;
}

export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  { id: "walk", label: "Jalan kaki", emoji: "🚶", met: 3.5 },
  { id: "run", label: "Lari", emoji: "🏃", met: 8 },
  { id: "bike", label: "Sepeda", emoji: "🚴", met: 6 },
  { id: "strength", label: "Gym", emoji: "🏋️", met: 4 },
  { id: "swim", label: "Renang", emoji: "🏊", met: 6 },
  { id: "yoga", label: "Yoga", emoji: "🧘", met: 2.5 },
  { id: "other", label: "Lainnya", emoji: "✨", met: 5 },
];

export const ACTIVITY_DURATIONS = [15, 30, 45, 60, 90] as const;
export const MAX_ACTIVITY_MINUTES = 720;
export const MAX_ACTIVITY_KCAL = 5000;
const FALLBACK_WEIGHT_KG = 70;

export function activityKind(id: string): ActivityKind | undefined {
  return ACTIVITY_KINDS.find((kind) => kind.id === id);
}

export function validDurationMin(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_ACTIVITY_MINUTES;
}

/**
 * Energy above resting for the activity: (MET - 1) x kg x hours, the same sense
 * as Apple Watch "Active Energy", rounded to the nearest 5 so the number does
 * not look more exact than it is. Returns null for an unusable duration.
 */
export function estimateActivityKcal(kindId: string, minutes: number, weightKg: number): number | null {
  const kind = activityKind(kindId);
  if (!kind || !validDurationMin(minutes)) return null;
  const kg = Number.isFinite(weightKg) && weightKg >= 25 && weightKg <= 350 ? weightKg : FALLBACK_WEIGHT_KG;
  const kcal = (kind.met - 1) * kg * (minutes / 60);
  return Math.max(5, Math.round(kcal / 5) * 5);
}

/** "Jalan kaki · 30 mnt", the line shown wherever an entry is listed. */
export function describeActivity(label: string, durationMin?: number): string {
  return validDurationMin(durationMin) ? `${label} · ${durationMin} mnt` : label;
}
