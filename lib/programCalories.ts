import type { ActivityLevel, BiologicalSex, FitnessGoal, UserSettings } from "./types";

export interface ProgramRecommendation {
  complete: boolean;
  bmi: number | null;
  bmiLabel: string;
  bmr: number | null;
  maintenanceCalories: number | null;
  recommendedCalories: number | null;
  recommendedProteinG: number | null;
  adjustmentPercent: number;
  confidence: "low" | "medium" | "high";
  notes: string[];
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

const GOAL_ADJUSTMENT: Record<FitnessGoal, number> = {
  weight_loss: -0.18,
  very_lean: -0.12,
  athletic: 0,
  muscle_gain: 0.08,
};

function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

export function computeProgramRecommendation(settings: UserSettings): ProgramRecommendation {
  const { age, biologicalSex, heightCm, activityLevel, weightKg, fitnessGoal } = settings;
  const complete = age !== null && biologicalSex !== null && heightCm !== null && activityLevel !== null;
  if (!complete) {
    return {
      complete: false, bmi: null, bmiLabel: "Profil belum lengkap", bmr: null,
      maintenanceCalories: null, recommendedCalories: null, recommendedProteinG: null,
      adjustmentPercent: 0, confidence: "low",
      notes: ["Lengkapi usia, jenis kelamin biologis, tinggi badan, dan level aktivitas untuk mendapatkan rekomendasi."],
    };
  }

  const heightM = heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  const bmiLabel = bmi < 18.5 ? "Berat badan rendah" : bmi < 25 ? "Rentang sehat" : bmi < 30 ? "Berat badan berlebih" : "Obesitas";
  const sexOffset = biologicalSex === "male" ? 5 : -161;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
  const maintenanceCalories = roundTo50(bmr * ACTIVITY_FACTOR[activityLevel]);
  let adjustment = GOAL_ADJUSTMENT[fitnessGoal];
  const notes: string[] = [];

  if (bmi < 18.5 && adjustment < 0) {
    adjustment = 0;
    notes.push("BMI berada di bawah 18,5, sehingga engine tidak menyarankan defisit kalori.");
  }
  if (bmi < 20 && fitnessGoal === "very_lean") {
    adjustment = 0;
    notes.push("Very lean mode tidak menambah defisit ketika BMI sudah rendah.");
  }
  if (bmi >= 30 && adjustment < -0.2) adjustment = -0.2;
  if (fitnessGoal === "athletic") notes.push("Target athletic dimulai dari maintenance; evaluasi berdasarkan performa dan tren berat.");
  if (fitnessGoal === "muscle_gain") notes.push("Surplus dibuat konservatif untuk membatasi kenaikan lemak yang tidak perlu.");
  notes.push("BMI adalah alat skrining dan dapat kurang tepat pada orang dengan massa otot tinggi.");

  const minimum = biologicalSex === "male" ? 1500 : 1200;
  const recommendedCalories = Math.max(minimum, roundTo50(maintenanceCalories * (1 + adjustment)));
  const proteinFactor = fitnessGoal === "muscle_gain" || fitnessGoal === "very_lean" ? 1.8 : fitnessGoal === "athletic" ? 1.6 : 1.5;
  const recommendedProteinG = Math.round(weightKg * proteinFactor / 5) * 5;

  return {
    complete: true, bmi, bmiLabel, bmr, maintenanceCalories, recommendedCalories, recommendedProteinG,
    adjustmentPercent: Math.round(adjustment * 100), confidence: "medium", notes,
  };
}
