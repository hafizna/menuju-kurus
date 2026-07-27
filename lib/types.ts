export type PlanType = "if" | "deficit";
export type FitnessGoal = "weight_loss" | "very_lean" | "athletic" | "muscle_gain";
export type BiologicalSex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active";

export interface MealEntry { id: string; time: string; foodName: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; portionNote?: string; source: "photo" | "manual"; }
export interface BurnEntry { id: string; time: string; calories: number; label: string; source: "manual" | "shortcuts"; }
export interface DayLog { date: string; wakeTime?: string; plan?: PlanType; eatingWindowStart?: string; eatingWindowHours?: number; meals: MealEntry[]; burns: BurnEntry[]; challengeId?: string; challengeDone?: boolean; }

export interface UserSettings {
  dailyTargetKcal: number;
  weightKg: number;
  goalWeightKg: number;
  ifWindowHours: number;
  timezone: string;
  proteinTargetG: number;
  fitnessGoal: FitnessGoal;
  targetBodyFatPercent: number | null;
  vo2Max: number | null;
  restingHeartRate: number | null;
  cardioMinutesWeekly: number;
  strengthDaysWeekly: number;
  age: number | null;
  biologicalSex: BiologicalSex | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  programConfigured: boolean;
}

export interface StreakState { count: number; lastSuccessDate?: string; bestCount: number; }

export const DEFAULT_SETTINGS: UserSettings = {
  dailyTargetKcal: 1800,
  weightKg: 70,
  goalWeightKg: 65,
  ifWindowHours: 8,
  timezone: "Asia/Jakarta",
  proteinTargetG: 120,
  fitnessGoal: "weight_loss",
  targetBodyFatPercent: null,
  vo2Max: null,
  restingHeartRate: null,
  cardioMinutesWeekly: 0,
  strengthDaysWeekly: 0,
  age: null,
  biologicalSex: null,
  heightCm: null,
  activityLevel: null,
  programConfigured: false,
};

export interface WeeklySummary { summary: string; recommendations: string[]; generatedAt: string; }
export interface WeightEntry { id: string; date: string; weightKg: number; bodyFat?: number; note?: string; createdAt: string; source?: "manual" | "shortcuts"; }
