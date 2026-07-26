import { PlanType } from "./types";

export interface PlanSuggestion {
  recommended: PlanType;
  reason: string;
}

// Rule of thumb: waking up late compresses the day, so a shorter eating
// window (intermittent fasting) is more practical than three spread meals.
// Waking up early leaves more hours to spread a calorie-deficit day out.
export function suggestPlanForWakeHour(wakeHour: number): PlanSuggestion {
  if (wakeHour >= 9) {
    return {
      recommended: "if",
      reason: `Kamu bangun jam ${wakeHour}:00, hari sudah terpotong — intermittent fasting bikin lebih gampang jaga kalori dengan waktu makan yang lebih singkat.`,
    };
  }
  return {
    recommended: "deficit",
    reason: `Kamu bangun jam ${wakeHour}:00, masih banyak waktu — defisit kalori dengan 3 meal terjadwal lebih nyaman dijalani hari ini.`,
  };
}
