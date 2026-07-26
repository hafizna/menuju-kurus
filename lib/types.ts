export type PlanType = "if" | "deficit";

export interface MealEntry {
  id: string;
  time: string; // ISO timestamp
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote?: string;
  source: "photo" | "manual";
}

export interface BurnEntry {
  id: string;
  time: string; // ISO timestamp
  calories: number;
  label: string;
  source: "manual" | "shortcuts";
}

export interface DayLog {
  date: string; // YYYY-MM-DD
  wakeTime?: string; // ISO timestamp
  plan?: PlanType;
  eatingWindowStart?: string; // ISO timestamp, for IF
  eatingWindowHours?: number;
  meals: MealEntry[];
  burns: BurnEntry[];
  challengeId?: string;
  challengeDone?: boolean;
}

export interface UserSettings {
  dailyTargetKcal: number;
  weightKg: number;
  goalWeightKg: number;
  ifWindowHours: number; // eating window length for intermittent fasting
  timezone: string;
  proteinTargetG: number;
}

export interface StreakState {
  count: number;
  lastSuccessDate?: string;
  bestCount: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  dailyTargetKcal: 1800,
  weightKg: 70,
  goalWeightKg: 65,
  ifWindowHours: 8,
  timezone: "Asia/Jakarta",
  proteinTargetG: 120,
};

export interface WeeklySummary {
  summary: string;
  recommendations: string[];
  generatedAt: string; // ISO timestamp
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD, one entry per date (later log overwrites earlier same-day log)
  weightKg: number;
  bodyFat?: number;
  note?: string;
  createdAt: string; // ISO timestamp
}
