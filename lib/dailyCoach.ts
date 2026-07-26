import type { DayLog, UserSettings } from "./types";
import type { DaySummary, WeeklyBudget } from "./day";
import type { WeightTrend } from "./weight";

export interface CoachInput {
  log: DayLog;
  summary: DaySummary;
  weeklyBudget: WeeklyBudget;
  weightTrend: WeightTrend;
  proteinToday: number;
  settings: UserSettings;
}

export interface CoachRecommendation {
  id: string;
  icon: string;
  title: string;
  detail: string;
  priority: number;
}

export interface DailyCoachResult {
  status: "on-track" | "watch" | "recover";
  headline: string;
  recommendations: CoachRecommendation[];
}

export function buildDailyCoach(input: CoachInput): DailyCoachResult {
  const { log, summary, weeklyBudget, weightTrend, proteinToday, settings } = input;
  const recommendations: CoachRecommendation[] = [];
  const proteinRemaining = Math.max(0, settings.proteinTargetG - proteinToday);
  const surplus = Math.max(0, summary.net - summary.target);
  const weeklyOver = weeklyBudget.remaining < 0;

  if (proteinRemaining >= 25) {
    recommendations.push({
      id: "protein",
      icon: "🥚",
      title: `Cari sekitar ${Math.min(40, proteinRemaining)} g protein lagi`,
      detail: "Pilih sumber protein yang mengenyangkan sebelum menambah camilan atau porsi karbohidrat.",
      priority: 100,
    });
  }

  if (surplus > 0) {
    recommendations.push({
      id: "surplus",
      icon: "🧭",
      title: "Tidak perlu menghukum diri",
      detail: weeklyOver
        ? "Berhenti mengejar angka hari ini. Kembali ke pola normal pada waktu makan berikutnya dan jaga porsi beberapa hari ke depan."
        : "Budget mingguan masih memberi ruang. Lanjutkan hari secara normal dan hentikan makan saat sudah cukup kenyang.",
      priority: 95,
    });
  } else if (summary.remaining > 500 && log.meals.length > 0) {
    recommendations.push({
      id: "save-budget",
      icon: "🍽️",
      title: "Masih ada ruang untuk makan normal",
      detail: "Tidak perlu sengaja menahan lapar. Gunakan sisa budget untuk makanan lengkap dengan protein dan sayur.",
      priority: 75,
    });
  }

  if (log.burns.length === 0) {
    recommendations.push({
      id: "movement",
      icon: "🚶",
      title: "Tambahkan gerak ringan bila memungkinkan",
      detail: "Jalan singkat dapat membantu mengalihkan craving dan menambah aktivitas, tetapi sifatnya opsional.",
      priority: surplus > 0 ? 85 : 55,
    });
  }

  if (weightTrend.direction === "up" && weightTrend.weeklyRate !== null) {
    recommendations.push({
      id: "trend",
      icon: "⚖️",
      title: "Lihat pola mingguan, bukan satu kali timbang",
      detail: `Tren saat ini ${weightTrend.weeklyRate > 0 ? "+" : ""}${weightTrend.weeklyRate} kg/minggu. Fokus pada konsistensi logging sebelum mengubah target.`,
      priority: 70,
    });
  }

  if (!log.plan) {
    recommendations.push({
      id: "plan",
      icon: "🎯",
      title: "Tentukan strategi hari ini",
      detail: "Pilih rencana makan agar keputusan berikutnya lebih mudah dan tidak reaktif terhadap rasa lapar.",
      priority: 90,
    });
  }

  const selected = recommendations.sort((a, b) => b.priority - a.priority).slice(0, 3);
  const status = surplus >= 400 || weeklyOver ? "recover" : surplus > 0 || proteinRemaining >= 40 ? "watch" : "on-track";

  return {
    status,
    headline:
      status === "recover"
        ? "Tenangkan hari ini, lalu kembali ke pola normal"
        : status === "watch"
        ? "Ada beberapa keputusan kecil yang bisa membantu"
        : "Kamu berada di jalur yang baik hari ini",
    recommendations: selected,
  };
}
