export interface Activity {
  id: string;
  label: string;
  met: number;
  unit: "minutes" | "km";
}

// MET (Metabolic Equivalent of Task) values, standard approximations.
// kcal burned = MET * 3.5 * weightKg / 200 * minutes
export const ACTIVITIES: Activity[] = [
  { id: "run", label: "Lari (pace santai)", met: 9.8, unit: "km" },
  { id: "brisk-walk", label: "Jalan cepat", met: 5.0, unit: "minutes" },
  { id: "jump-rope", label: "Lompat tali", met: 11.0, unit: "minutes" },
  { id: "cycling", label: "Sepeda santai", met: 8.0, unit: "km" },
  { id: "hiit", label: "HIIT / cardio set", met: 8.5, unit: "minutes" },
];

const RUN_PACE_MIN_PER_KM = 7; // assumed easy running pace
const CYCLE_PACE_MIN_PER_KM = 3; // assumed easy cycling pace

export interface ExerciseSuggestion {
  activityId: string;
  label: string;
  minutes: number;
  distanceKm?: number;
}

export function suggestExerciseForCalories(extraKcal: number, weightKg: number): ExerciseSuggestion[] {
  if (extraKcal <= 0) return [];
  return ACTIVITIES.map((activity) => {
    const kcalPerMin = (activity.met * 3.5 * weightKg) / 200;
    const minutes = extraKcal / kcalPerMin;
    if (activity.unit === "km") {
      const paceMinPerKm = activity.id === "run" ? RUN_PACE_MIN_PER_KM : CYCLE_PACE_MIN_PER_KM;
      return {
        activityId: activity.id,
        label: activity.label,
        minutes: Math.round(minutes),
        distanceKm: Math.round((minutes / paceMinPerKm) * 10) / 10,
      };
    }
    return {
      activityId: activity.id,
      label: activity.label,
      minutes: Math.round(minutes),
    };
  });
}
