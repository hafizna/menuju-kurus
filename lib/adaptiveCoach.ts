import type { BodyResponseReport } from "./bodyResponse";
import { TARGET_FEEDBACK_MIN_RATIO } from "./energy";
import type { DayLog, UserSettings } from "./types";
import type { DaySummary, WeeklyBudget } from "./day";
import type { WeightTrend } from "./weight";
import type { HabitMeal, HabitStrategy } from "./habits";

export type CoachMoment =
  | "neutral"
  | "hungry"
  | "very_hungry"
  | "craving"
  | "eating_out";
export type CoachConfidence = "low" | "medium" | "high";

export interface AdaptiveCoachInput {
  bodyResponse?: BodyResponseReport;
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
  return meal.usualWindow
    .toLowerCase()
    .startsWith(WINDOW_LABELS[window].toLowerCase());
}

function choosePersonalMeal(
  habits: HabitStrategy,
  window: WindowId,
  remainingCalories: number,
  proteinRemaining: number,
): HabitMeal | undefined {
  const usableBudget = Math.max(250, remainingCalories);
  return habits.recurringMeals
    .filter(
      (meal) =>
        fitsCurrentWindow(meal, window) &&
        meal.averageCalories <= usableBudget * 1.1,
    )
    .sort((a, b) => {
      const proteinNeed =
        proteinRemaining >= 20 ? b.averageProteinG - a.averageProteinG : 0;
      return (
        proteinNeed ||
        b.count - a.count ||
        a.averageCalories - b.averageCalories
      );
    })[0];
}

function chooseProteinAnchor(
  habits: HabitStrategy,
  dailyTarget: number,
): HabitMeal | undefined {
  return habits.recurringMeals
    .filter(
      (meal) =>
        meal.averageProteinG >= 20 && meal.averageCalories <= dailyTarget * 0.4,
    )
    .sort(
      (a, b) => b.averageProteinG - a.averageProteinG || b.count - a.count,
    )[0];
}

function confidenceFor(
  habits: HabitStrategy,
  weightTrend: WeightTrend,
): CoachConfidence {
  if (habits.readiness === "ready" && weightTrend.weeklyRate !== null)
    return "high";
  if (habits.readiness !== "insufficient" || weightTrend.weeklyRate !== null)
    return "medium";
  return "low";
}

function headlineFor(
  status: AdaptiveCoachResult["status"],
  moment: CoachMoment,
  personalMeal?: HabitMeal,
): string {
  if (status === "recover")
    return "Tenangkan hari ini, lalu kembali ke pola normal";
  if (moment === "eating_out")
    return "Pilih menu luar rumah dengan trade-off yang jelas";
  if (moment === "very_hungry")
    return "Utamakan makanan lengkap, bukan sekadar menahan lapar";
  if (moment === "craving")
    return "Beri ruang untuk craving dengan porsi yang disengaja";
  if (personalMeal)
    return `Pola ${personalMeal.name} bisa mempermudah keputusan berikutnya`;
  if (status === "watch")
    return "Ada satu-dua keputusan kecil yang paling berdampak";
  return "Kamu berada di jalur yang baik hari ini";
}

export function buildAdaptiveCoach(
  input: AdaptiveCoachInput,
): AdaptiveCoachResult {
  const {
    log,
    summary,
    weeklyBudget,
    weightTrend,
    proteinToday,
    settings,
    habits,
    moment,
  } = input;
  const recommendations: AdaptiveCoachRecommendation[] = [];
  const proteinRemaining = Math.max(0, settings.proteinTargetG - proteinToday);
  const surplus = Math.max(0, summary.caloriesIn - summary.target);
  const weeklyOver = weeklyBudget.remaining < 0;
  const window = currentWindow(input.now ?? new Date(), settings.timezone);
  const personalMeal =
    habits.readiness === "ready"
      ? choosePersonalMeal(habits, window, summary.remaining, proteinRemaining)
      : undefined;
  const proteinAnchor =
    habits.readiness !== "insufficient"
      ? chooseProteinAnchor(habits, settings.dailyTargetKcal)
      : undefined;

  if (
    summary.foodLogStatus === "complete" &&
    summary.caloriesIn < summary.target * TARGET_FEEDBACK_MIN_RATIO
  ) {
    recommendations.push({
      id: "check-intake",
      title: "Tinjau kecukupan makan dan catatan",
      detail:
        "Asupan tercatat jauh di bawah target. Periksa apakah ada makanan atau minuman terlewat; jangan sengaja memperbesar defisit demi angka yang lebih rendah.",
      evidence: `${summary.caloriesIn} kcal tercatat dari target ${summary.target} kcal · catatan dikonfirmasi lengkap`,
      priority: 125,
      href: "/makan",
      actionLabel: "Tinjau catatan",
    });
  }

  if (moment === "eating_out") {
    recommendations.push({
      id: "restaurant",
      title: "Bandingkan menu sebelum memesan",
      detail:
        "Restaurant Intelligence akan meranking menu Indonesia memakai sisa kalori, protein, goal, dan asumsi porsi yang transparan.",
      evidence: `${Math.max(0, summary.remaining)} kcal dan ${proteinRemaining} g protein tersisa hari ini`,
      priority: 130,
      href: "/makan/restaurant",
      actionLabel: "Buka menu restoran",
    });
  }

  if (moment === "very_hungry") {
    recommendations.push({
      id: "very-hungry",
      title: personalMeal
        ? `Pilih pola makan lengkap seperti ${personalMeal.name}`
        : "Pilih makanan lengkap yang benar-benar mengenyangkan",
      detail: personalMeal
        ? `Catatanmu menunjukkan menu ini biasa muncul pada ${personalMeal.usualWindow.toLowerCase()} dengan rata-rata ${personalMeal.averageProteinG} g protein.`
        : "Gabungkan protein, sayur atau buah, dan karbohidrat yang cukup. Menahan lapar terlalu lama dapat membuat keputusan berikutnya lebih reaktif.",
      evidence: personalMeal
        ? `${personalMeal.count} catatan · rata-rata ${personalMeal.averageCalories} kcal`
        : `Kondisi dipilih: sangat lapar · ${Math.max(0, summary.remaining)} kcal tersisa`,
      priority: 125,
      href: personalMeal ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: personalMeal
        ? "Lihat quick add"
        : "Cari makanan mengenyangkan",
    });
  } else if (moment === "hungry") {
    recommendations.push({
      id: "hungry",
      title: personalMeal
        ? `${personalMeal.name} cocok dengan pola waktumu`
        : "Gunakan sisa budget untuk makan normal",
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
      detail:
        "Pilih rasa yang kamu cari, tentukan porsi sebelum mulai, lalu kembali ke pola normal pada makan berikutnya.",
      evidence: `${Math.max(0, summary.remaining)} kcal tersisa · budget mingguan ${weeklyBudget.remaining < 0 ? "sedang terlampaui" : weeklyBudget.isComplete ? "masih tersedia" : "masih sementara"}`,
      priority: 120,
      href: "/makan?mode=cari",
      actionLabel: "Cari opsi sesuai craving",
    });
  }

  if (surplus > 0 || weeklyOver) {
    recommendations.push({
      id: "recovery",
      title: "Tidak perlu menghukum diri",
      detail: weeklyOver
        ? "Jangan menekan kalori lebih rendah untuk membayar minggu ini. Jalankan target normal pada makan berikutnya dan beberapa hari ke depan tanpa puasa kompensasi."
        : "Lanjutkan secara normal dan berhenti saat cukup kenyang. Budget mingguan masih sementara bila ada catatan yang belum lengkap.",
      evidence:
        surplus > 0
          ? `${surplus} kcal di atas target hari ini${weeklyOver ? " · budget mingguan terlampaui" : ""}`
          : `Budget mingguan terlampaui ${Math.abs(weeklyBudget.remaining)} kcal`,
      priority: 140,
    });
  }

  if (proteinRemaining >= 25 && surplus === 0) {
    recommendations.push({
      id: "protein",
      title: proteinAnchor
        ? `Gunakan ${proteinAnchor.name} sebagai jangkar protein`
        : `Cari sekitar ${Math.min(40, proteinRemaining)} g protein lagi`,
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
  if (
    !input.bodyResponse &&
    weightTrend.weeklyRate !== null &&
    weightTrend.weeklyRate < -fastestReasonableLoss
  ) {
    recommendations.push({
      id: "fast-loss",
      title: "Tren turun cukup cepat—jangan tambah defisit dulu",
      detail:
        "Pertahankan target saat ini dan perhatikan energi, rasa lapar, serta kualitas latihan sebelum membuat target lebih agresif.",
      evidence: `${weightTrend.weeklyRate} kg/minggu · batas kehati-hatian sekitar -${fastestReasonableLoss.toFixed(1)} kg/minggu`,
      priority: 112,
      href: "/progress?tab=weight",
      actionLabel: "Lihat tren berat",
    });
  } else if (
    !input.bodyResponse &&
    weightTrend.direction === "up" &&
    weightTrend.weeklyRate !== null
  ) {
    recommendations.push({
      id: "trend-up",
      title: "Tinjau konsistensi sebelum mengubah target",
      detail:
        "Periksa porsi menu berulang, kelengkapan logging, dan budget mingguan. Satu minggu belum cukup untuk menyimpulkan kebutuhan kalori baru.",
      evidence: `${weightTrend.weeklyRate > 0 ? "+" : ""}${weightTrend.weeklyRate} kg/minggu`,
      priority: 88,
      href: "/progress?tab=weight",
      actionLabel: "Lihat tren berat",
    });
  }

  if (input.bodyResponse) {
    const { current } = input.bodyResponse;
    const weight = current.weight;
    const span =
      weight.first && weight.last
        ? (Date.parse(weight.last.date) - Date.parse(weight.first.date)) /
          86400000
        : 0;
    // Coach rate uses mean measurement dates, rather than the full account age.
    const early = current.days.slice(0, 7).filter((day) => day.weight !== null);
    const late = current.days.slice(-7).filter((day) => day.weight !== null);
    const meanDate = (days: typeof early) =>
      days.reduce((total, day) => total + Date.parse(day.date), 0) /
      days.length;
    const interval =
      early.length && late.length
        ? (meanDate(late) - meanDate(early)) / 86400000
        : 0;
    const rate =
      weight.ready && weight.change !== null && interval > 0
        ? (weight.change / interval) * 7
        : null;
    if (
      rate !== null &&
      rate < -Math.max(0.7, (weight.baseline ?? settings.weightKg) * 0.01)
    ) {
      recommendations.push({
        id: "body-fast-loss",
        title: "Berat turun cepat; tinjau kecukupan makan",
        detail:
          "Jangan tambah defisit. Tinjau kelengkapan asupan, energi, rasa lapar, dan kondisi pengukuran; bila perubahan tidak disengaja atau disertai keluhan, pertimbangkan bantuan tenaga kesehatan.",
        evidence: `${rate.toFixed(2)} kg/minggu dari rata-rata jendela awal/akhir · ${weight.observedDays} ukuran · ${current.start} — ${current.end}`,
        priority: 155,
        href: "/progress",
        actionLabel: "Tinjau pola tubuh",
      });
    } else if (
      weight.ready &&
      current.waist.ready &&
      Math.abs(weight.change ?? 0) <= 0.3 &&
      (current.waist.change ?? 0) <= -0.5
    ) {
      recommendations.push({
        id: "body-stable-waist",
        title: "Berat relatif stabil, pinggang berubah",
        detail:
          "Pertahankan pola dahulu dan ukur pada kondisi yang konsisten. Perubahan ini tidak membuktikan kehilangan lemak atau penambahan otot; jangan memperketat target hanya karena timbangan stabil.",
        evidence: `Selisih rata-rata berat ${weight.change} kg · pinggang ${current.waist.change} cm (${current.waist.first!.date} — ${current.waist.last!.date})`,
        priority: 98,
        href: "/progress",
        actionLabel: "Lihat ukuran dan periode",
      });
    } else if (
      rate !== null &&
      rate > 0.1 &&
      settings.fitnessGoal !== "muscle_gain"
    ) {
      recommendations.push({
        id: "body-trend-up",
        title: "Tinjau pola sebelum mengubah target",
        detail:
          "Periksa porsi, kelengkapan catatan, dan kondisi pengukuran. Kalibrasi hanya menawarkan perubahan bila data lebih ketat sudah cukup; target tetap milikmu.",
        evidence: `${rate.toFixed(2)} kg/minggu · ${weight.observedDays} ukuran sepanjang ${span} hari`,
        priority: 88,
        href: "/progress",
        actionLabel: "Tinjau Body Response",
      });
    }
    if (!weight.ready || !current.food.ready)
      recommendations.push({
        id: "body-data",
        title: "Lengkapi pola data sebelum menilai respons tubuh",
        detail:
          "Konfirmasi catatan makan yang benar-benar lengkap dan ukur berat secara berkala pada kondisi serupa. Data jarang belum cukup untuk memperketat target.",
        evidence: `${current.food.observedDays}/28 hari asupan lengkap · ${weight.observedDays} ukuran berat`,
        priority: 72,
        href: "/progress",
        actionLabel: "Lihat kesiapan data",
      });
    if (
      current.protein.ready &&
      current.protein.average! < settings.proteinTargetG * 0.8
    )
      recommendations.push({
        id: "body-protein",
        title: "Bangun konsistensi protein harian",
        detail:
          "Rata-rata protein tercatat masih di bawah target. Pilih sumber protein pada makan utama; angka ini tidak mengukur massa otot.",
        evidence: `${current.protein.average} g/hari dari ${current.protein.observedDays} hari lengkap · target ${settings.proteinTargetG} g`,
        priority: 92,
        href: "/makan",
        actionLabel: "Rencanakan sumber protein",
      });
  }

  const repeatedLargeMeal =
    habits.readiness === "ready"
      ? habits.recurringMeals.find(
          (meal) => meal.averageCalories >= settings.dailyTargetKcal * 0.42,
        )
      : undefined;
  if (
    repeatedLargeMeal &&
    summary.remaining > 0 &&
    summary.remaining < repeatedLargeMeal.averageCalories * 0.85
  ) {
    recommendations.push({
      id: "large-repeat",
      title: `Kalau memilih ${repeatedLargeMeal.name}, sesuaikan porsinya`,
      detail:
        "Menu ini tetap boleh dipilih, tetapi rata-rata porsimu lebih besar daripada sisa budget hari ini. Gunakan porsi lebih kecil atau sederhanakan pendampingnya.",
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
      detail:
        "Rencana sederhana membuat keputusan makan berikutnya lebih mudah dan mengurangi keputusan reaktif.",
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
      detail:
        "Jalan singkat dapat membantu energi dan mengalihkan craving, tetapi bukan kewajiban dan bukan kompensasi makanan.",
      evidence: "Belum ada aktivitas tercatat hari ini",
      priority: 45,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "maintain",
      title: "Pertahankan pola yang sedang berjalan",
      detail:
        "Tidak ada koreksi besar yang diperlukan. Lanjutkan makan sesuai rasa lapar dan target yang sudah ditetapkan.",
      evidence:
        "Kalori, protein, dan budget mingguan tidak menunjukkan prioritas mendesak",
      priority: 20,
    });
  }

  const selected = recommendations
    .sort((a, b) => b.priority - a.priority)
    .filter(
      (item, index, list) =>
        list.findIndex((candidate) => candidate.id === item.id) === index,
    )
    .slice(0, 3);
  const status: AdaptiveCoachResult["status"] =
    surplus >= 400 || weeklyOver
      ? "recover"
      : !summary.onTrack ||
          surplus > 0 ||
          proteinRemaining >= 40 ||
          selected.some((item) =>
            ["body-fast-loss", "body-trend-up", "body-data"].includes(item.id),
          ) ||
          (!input.bodyResponse && weightTrend.direction === "up")
        ? "watch"
        : "on-track";
  const confidence = input.bodyResponse
    ? input.bodyResponse.current.weight.ready &&
      input.bodyResponse.current.food.ready
      ? "medium"
      : "low"
    : confidenceFor(habits, weightTrend);
  const basis = [
    "status hari ini",
    "budget mingguan",
    input.bodyResponse
      ? "Body Response 28 hari dengan status kesiapan"
      : weightTrend.weeklyRate !== null
        ? "tren berat"
        : null,
    habits.readiness === "ready"
      ? "pola 28 hari"
      : habits.readiness === "learning"
        ? "pola awal"
        : null,
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
