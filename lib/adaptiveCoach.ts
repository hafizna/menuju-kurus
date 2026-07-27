import type { DayLog, UserSettings } from "./types";
import type { DaySummary, WeeklyBudget } from "./day";
import type { WeightTrend } from "./weight";
import type { HabitMeal, HabitStrategy } from "./habits";

export type CoachMoment = "neutral" | "hungry" | "very_hungry" | "craving" | "eating_out";
export type CoachConfidence = "low" | "medium" | "high";

export interface AdaptiveCoachInput {
  log: DayLog;
  summary: DaySummary;
  weeklyBudget: WeeklyBudget;
  weightTrend: WeightTrend;
  proteinToday: number;
  settings: UserSettings;
  habits: HabitStrategy;
  moment: CoachMoment;
  now?: Date;
}

export interface AdaptiveCoachRecommendation {
  id: string;
  title: string;
  detail: string;
  priority: number;
  evidence: string;
  href?: string;
  actionLabel?: string;
}

export interface AdaptiveCoachResult {
  status: "on-track" | "watch" | "recover";
  headline: string;
  confidence: CoachConfidence;
  basis: string[];
  recommendations: AdaptiveCoachRecommendation[];
}

const WINDOW_LABELS = {
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
  malam: "Malam",
  larut: "Larut malam",
} as const;

type WindowId = keyof typeof WINDOW_LABELS;

function localHour(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : date.getHours();
}

function currentWindow(date: Date, timezone: string): WindowId {
  const hour = localHour(date, timezone);
  if (hour < 5 || hour >= 22) return "larut";
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}

function fitsCurrentWindow(meal: HabitMeal, window: WindowId): boolean {
  return meal.usualWindow.toLowerCase().startsWith(WINDOW_LABELS[window].toLowerCase());
}

function choosePersonalMeal(
  habits: HabitStrategy,
  window: WindowId,
  remainingCalories: number,
  proteinRemaining: number
): HabitMeal | undefined {
  const usableBudget = Math.max(250, remainingCalories);
  return habits.recurringMeals
    .filter((meal) => fitsCurrentWindow(meal, window) && meal.averageCalories <= usableBudget * 1.1)
    .sort((a, b) => {
      const proteinNeed = proteinRemaining >= 20 ? b.averageProteinG - a.averageProteinG : 0;
      return proteinNeed || b.count - a.count || a.averageCalories - b.averageCalories;
    })[0];
}

function chooseProteinAnchor(habits: HabitStrategy, dailyTarget: number): HabitMeal | undefined {
  return habits.recurringMeals
    .filter((meal) => meal.averageProteinG >= 20 && meal.averageCalories <= dailyTarget * 0.4)
    .sort((a, b) => b.averageProteinG - a.averageProteinG || b.count - a.count)[0];
}

function confidenceFor(habits: HabitStrategy, weightTrend: WeightTrend): CoachConfidence {
  if (habits.readiness === "ready" && weightTrend.weeklyRate !== null) return "high";
  if (habits.readiness !== "insufficient" || weightTrend.weeklyRate !== null) return "medium";
  return "low";
}

function headlineFor(
  status: AdaptiveCoachResult["status"],
  moment: CoachMoment,
  personalMeal?: HabitMeal
): string {
  if (status === "recover") return "Tenangkan hari ini, lalu kembali ke pola normal";
  if (moment === "eating_out") return "Pilih menu luar rumah dengan trade-off yang jelas";
  if (moment === "very_hungry") return "Utamakan makanan lengkap, bukan sekadar menahan lapar";
  if (moment === "craving") return "Beri ruang untuk craving dengan porsi yang disengaja";
  if (personalMeal) return `Pola ${personalMeal.name} bisa mempermudah keputusan berikutnya`;
  if (status === "watch") return "Ada satu-dua keputusan kecil yang paling berdampak";
  return "Kamu berada di jalur yang baik hari ini";
}

export function buildAdaptiveCoach(input: AdaptiveCoachInput): AdaptiveCoachResult {
  const { log, summary, weeklyBudget, weightTrend, proteinToday, settings, habits, moment } = input;
  const recommendations: AdaptiveCoachRecommendation[] = [];
  const proteinRemaining = Math.max(0, settings.proteinTargetG - proteinToday);
  const surplus = Math.max(0, summary.net - summary.target);
  const weeklyOver = weeklyBudget.remaining < 0;
  const window = currentWindow(input.now ?? new Date(), settings.timezone);
  const personalMeal = habits.readiness === "ready"
    ? choosePersonalMeal(habits, window, summary.remaining, proteinRemaining)
    : undefined;
  const proteinAnchor = habits.readiness !== "insufficient"
    ? chooseProteinAnchor(habits, settings.dailyTargetKcal)
    : undefined;

  if (moment === "eating_out") {
    recommendations.push({
      id: "restaurant",
      title: "Bandingkan menu sebelum memesan",
      detail: "Restaurant Intelligence akan meranking menu Indonesia memakai sisa kalori, protein, goal, dan asumsi porsi yang transparan.",
      evidence: `${Math.max(0, summary.remaining)} kcal dan ${proteinRemaining} g protein tersisa hari ini`,
      priority: 130,
      href: "/makan/restaurant",
      actionLabel: "Buka menu restoran",
    });
  }

  if (moment === "very_hungry") {
    recommendations.push({
      id: "very-hungry",
      title: personalMeal ? `Pilih pola makan lengkap seperti ${personalMeal.name}` : "Pilih makanan lengkap yang benar-benar mengenyangkan",
      detail: personalMeal
        ? `Catatanmu menunjukkan menu ini biasa muncul pada ${personalMeal.usualWindow.toLowerCase()} dengan rata-rata ${personalMeal.averageProteinG} g protein.`
        : "Gabungkan protein, sayur atau buah, dan karbohidrat yang cukup. Menahan lapar terlalu lama dapat membuat keputusan berikutnya lebih reaktif.",
      evidence: personalMeal
        ? `${personalMeal.count} catatan · rata-rata ${personalMeal.averageCalories} kcal`
        : `Kondisi dipilih: sangat lapar · ${Math.max(0, summary.remaining)} kcal tersisa`,
      priority: 125,
      href: personalMeal ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: personalMeal ? "Lihat quick add" : "Cari makanan mengenyangkan",
    });
  } else if (moment === "hungry") {
    recommendations.push({
      id: "hungry",
      title: personalMeal ? `${personalMeal.name} cocok dengan pola waktumu` : "Gunakan sisa budget untuk makan normal",
      detail: personalMeal
        ? "Pilihan ini berasal dari kebiasaanmu sendiri dan masih mendekati budget makan berikutnya. Koreksi porsi bila kondisi hari ini berbeda."
        : "Tidak perlu sengaja menahan lapar. Prioritaskan protein dan volume agar rasa kenyang lebih bertahan.",
      evidence: personalMeal
        ? `${personalMeal.averageCalories} kcal · ${personalMeal.averageProteinG} g protein · ${personalMeal.usualWindow}`
        : `${Math.max(0, summary.remaining)} kcal dan ${proteinRemaining} g protein tersisa`,
      priority: 118,
      href: personalMeal ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: personalMeal ? "Gunakan pola ini" : "Cari rekomendasi",
    });
  } else if (moment === "craving") {
    recommendations.push({
      id: "craving",
      title: "Rencanakan porsinya, jangan jadikan craving sebagai kegagalan",
      detail: "Pilih rasa yang kamu cari, tentukan porsi sebelum mulai, lalu kembali ke pola normal pada makan berikutnya.",
      evidence: `${Math.max(0, summary.remaining)} kcal tersisa · budget mingguan ${weeklyBudget.remaining >= 0 ? "masih tersedia" : "sedang terlampaui"}`,
      priority: 120,
      href: "/makan?mode=cari",
      actionLabel: "Cari opsi sesuai craving",
    });
  }

  if (surplus > 0) {
    recommendations.push({
      id: "recovery",
      title: "Tidak perlu menghukum diri",
      detail: weeklyOver
        ? "Hentikan upaya mengejar angka hari ini. Kembali ke target normal besok dan jaga keputusan beberapa hari ke depan tanpa puasa kompensasi."
        : "Budget mingguan masih dapat menyerap sebagian variasi hari ini. Lanjutkan secara normal dan berhenti saat cukup kenyang.",
      evidence: `${surplus} kcal di atas target hari ini${weeklyOver ? " · budget mingguan terlampaui" : ""}`,
      priority: 140,
    });
  }

  if (proteinRemaining >= 25 && surplus === 0) {
    recommendations.push({
      id: "protein",
      title: proteinAnchor ? `Gunakan ${proteinAnchor.name} sebagai jangkar protein` : `Cari sekitar ${Math.min(40, proteinRemaining)} g protein lagi`,
      detail: proteinAnchor
        ? "Ini adalah menu berulangmu yang relatif tinggi protein. Gunakan porsinya sebagai referensi, bukan kewajiban."
        : "Pilih sumber protein yang mengenyangkan sebelum menambah camilan atau porsi karbohidrat.",
      evidence: proteinAnchor
        ? `${proteinAnchor.count} catatan · rata-rata ${proteinAnchor.averageProteinG} g protein dan ${proteinAnchor.averageCalories} kcal`
        : `${proteinRemaining} g protein tersisa`,
      priority: 105,
      href: proteinAnchor ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: proteinAnchor ? "Lihat kebiasaan" : "Cari opsi protein",
    });
  }

  const fastestReasonableLoss = Math.max(0.7, settings.weightKg * 0.01);
  if (weightTrend.weeklyRate !== null && weightTrend.weeklyRate < -fastestReasonableLoss) {
    recommendations.push({
      id: "fast-loss",
      title: "Tren turun cukup cepat—jangan tambah defisit dulu",
      detail: "Pertahankan target saat ini dan perhatikan energi, rasa lapar, serta kualitas latihan sebelum membuat target lebih agresif.",
      evidence: `${weightTrend.weeklyRate} kg/minggu · batas kehati-hatian sekitar -${fastestReasonableLoss.toFixed(1)} kg/minggu`,
      priority: 112,
      href: "/progress?tab=weight",
      actionLabel: "Lihat tren berat",
    });
  } else if (weightTrend.direction === "up" && weightTrend.weeklyRate !== null) {
    recommendations.push({
      id: "trend-up",
      title: "Tinjau konsistensi sebelum mengubah target",
      detail: "Periksa porsi menu berulang, kelengkapan logging, dan budget mingguan. Satu minggu belum cukup untuk menyimpulkan kebutuhan kalori baru.",
      evidence: `${weightTrend.weeklyRate > 0 ? "+" : ""}${weightTrend.weeklyRate} kg/minggu`,
      priority: 88,
      href: "/progress?tab=weight",
      actionLabel: "Lihat tren berat",
    });
  }

  const repeatedLargeMeal = habits.readiness === "ready"
    ? habits.recurringMeals.find((meal) => meal.averageCalories >= settings.dailyTargetKcal * 0.42)
    : undefined;
  if (repeatedLargeMeal && summary.remaining > 0 && summary.remaining < repeatedLargeMeal.averageCalories * 0.85) {
    recommendations.push({
      id: "large-repeat",
      title: `Kalau memilih ${repeatedLargeMeal.name}, sesuaikan porsinya`,
      detail: "Menu ini tetap boleh dipilih, tetapi rata-rata porsimu lebih besar daripada sisa budget hari ini. Gunakan porsi lebih kecil atau sederhanakan pendampingnya.",
      evidence: `Biasanya ${repeatedLargeMeal.averageCalories} kcal · hari ini tersisa ${summary.remaining} kcal`,
      priority: moment === "hungry" || moment === "very_hungry" ? 108 : 78,
      href: "/makan/habits",
      actionLabel: "Lihat pola porsinya",
    });
  }

  if (!log.plan) {
    recommendations.push({
      id: "plan",
      title: "Tentukan strategi hari ini",
      detail: "Rencana sederhana membuat keputusan makan berikutnya lebih mudah dan mengurangi keputusan reaktif.",
      evidence: "Belum ada rencana makan yang dipilih hari ini",
      priority: 96,
      href: "/plan",
      actionLabel: "Pilih rencana",
    });
  }

  if (log.burns.length === 0 && surplus === 0) {
    recommendations.push({
      id: "movement",
      title: "Tambahkan gerak ringan bila memungkinkan",
      detail: "Jalan singkat dapat membantu energi dan mengalihkan craving, tetapi bukan kewajiban dan bukan kompensasi makanan.",
      evidence: "Belum ada aktivitas tercatat hari ini",
      priority: 45,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "maintain",
      title: "Pertahankan pola yang sedang berjalan",
      detail: "Tidak ada koreksi besar yang diperlukan. Lanjutkan makan sesuai rasa lapar dan target yang sudah ditetapkan.",
      evidence: "Kalori, protein, dan budget mingguan tidak menunjukkan prioritas mendesak",
      priority: 20,
    });
  }

  const selected = recommendations
    .sort((a, b) => b.priority - a.priority)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 3);
  const status: AdaptiveCoachResult["status"] = surplus >= 400 || weeklyOver
    ? "recover"
    : surplus > 0 || proteinRemaining >= 40 || weightTrend.direction === "up"
      ? "watch"
      : "on-track";
  const confidence = confidenceFor(habits, weightTrend);
  const basis = [
    "status hari ini",
    "budget mingguan",
    weightTrend.weeklyRate !== null ? "tren berat" : null,
    habits.readiness === "ready" ? "pola 28 hari" : habits.readiness === "learning" ? "pola awal" : null,
    moment !== "neutral" ? "kondisi yang kamu pilih" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    status,
    headline: headlineFor(status, moment, personalMeal),
    confidence,
    basis,
    recommendations: selected,
  };
}
