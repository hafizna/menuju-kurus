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
    return "Santai dulu hari ini, besok balik ke ritme biasa";
  if (moment === "eating_out")
    return "Makan di luar? Pilih menu yang paling pas buat sisa budgetmu";
  if (moment === "very_hungry")
    return "Sangat lapar? Makan yang lengkap, jangan ditahan-tahan";
  if (moment === "craving")
    return "Lagi pengen sesuatu? Boleh, atur porsinya dulu";
  if (personalMeal)
    return `${personalMeal.name} bisa jadi pilihan gampang buat makan berikutnya`;
  if (status === "watch")
    return "Ada satu-dua hal kecil yang paling berpengaruh hari ini";
  return "Hari ini kamu on track, lanjut begini aja";
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
      title: "Cek lagi catatan makanmu",
      detail:
        "Yang tercatat jauh di bawah target. Coba cek, mungkin ada makanan atau minuman yang kelewat. Jangan sengaja makan lebih sedikit demi angka yang lebih kecil.",
      evidence: `${summary.caloriesIn} kcal tercatat dari target ${summary.target} kcal · catatan sudah ditutup lengkap`,
      priority: 125,
      href: "/makan",
      actionLabel: "Cek catatan",
    });
  }

  if (moment === "eating_out") {
    recommendations.push({
      id: "restaurant",
      title: "Bandingkan menu dulu sebelum pesan",
      detail:
        "Aku urutkan menu restoran Indonesia berdasarkan sisa kalori, protein, dan tujuanmu, lengkap dengan perkiraan porsinya.",
      evidence: `sisa ${Math.max(0, summary.remaining)} kcal dan ${proteinRemaining} g protein hari ini`,
      priority: 130,
      href: "/makan/restaurant",
      actionLabel: "Lihat menu restoran",
    });
  }

  if (moment === "very_hungry") {
    recommendations.push({
      id: "very-hungry",
      title: personalMeal
        ? `Makan lengkap seperti biasa: ${personalMeal.name}`
        : "Pilih makanan lengkap yang bikin kenyang",
      detail: personalMeal
        ? `Dari catatanmu, menu ini biasanya kamu makan saat ${personalMeal.usualWindow.toLowerCase()}, rata-rata ${personalMeal.averageProteinG} g protein.`
        : "Gabungkan protein, sayur atau buah, dan karbo secukupnya. Menahan lapar terlalu lama biasanya bikin makan berikutnya malah kalap.",
      evidence: personalMeal
        ? `${personalMeal.count} catatan · rata-rata ${personalMeal.averageCalories} kcal`
        : `kamu pilih: sangat lapar · sisa ${Math.max(0, summary.remaining)} kcal`,
      priority: 125,
      href: personalMeal ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: personalMeal
        ? "Lihat makanan favoritmu"
        : "Cari yang bikin kenyang",
    });
  } else if (moment === "hungry") {
    recommendations.push({
      id: "hungry",
      title: personalMeal
        ? `${personalMeal.name} pas dengan kebiasaan jam makanmu`
        : "Pakai sisa budget buat makan seperti biasa",
      detail: personalMeal
        ? "Ini dari kebiasaanmu sendiri dan masih muat di budget makan berikutnya. Sesuaikan porsinya kalau hari ini beda."
        : "Nggak perlu menahan lapar. Pilih yang berprotein dan porsinya besar supaya kenyangnya awet.",
      evidence: personalMeal
        ? `${personalMeal.averageCalories} kcal · ${personalMeal.averageProteinG} g protein · ${personalMeal.usualWindow}`
        : `sisa ${Math.max(0, summary.remaining)} kcal dan ${proteinRemaining} g protein`,
      priority: 118,
      href: personalMeal ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: personalMeal ? "Pakai yang ini" : "Cari ide makan",
    });
  } else if (moment === "craving") {
    recommendations.push({
      id: "craving",
      title: "Craving itu wajar, tinggal atur porsinya",
      detail:
        "Pilih rasa yang kamu pengen, tentukan porsinya sebelum mulai makan, lalu balik ke pola biasa di makan berikutnya.",
      evidence: `sisa ${Math.max(0, summary.remaining)} kcal · budget mingguan ${weeklyBudget.remaining < 0 ? "sudah lewat" : weeklyBudget.isComplete ? "masih ada" : "masih sementara"}`,
      priority: 120,
      href: "/makan?mode=cari",
      actionLabel: "Cari yang sesuai craving",
    });
  }

  if (surplus > 0 || weeklyOver) {
    recommendations.push({
      id: "recovery",
      title: "Nggak usah menghukum diri",
      detail: weeklyOver
        ? "Jangan makan lebih sedikit buat 'membayar' minggu ini. Cukup balik ke target normal di makan berikutnya dan beberapa hari ke depan, tanpa puasa."
        : "Lanjut seperti biasa dan berhenti saat sudah cukup kenyang. Budget mingguan masih bisa berubah kalau ada catatan yang belum lengkap.",
      evidence:
        surplus > 0
          ? `${surplus} kcal di atas target hari ini${weeklyOver ? " · budget mingguan sudah lewat" : ""}`
          : `Budget mingguan lewat ${Math.abs(weeklyBudget.remaining)} kcal`,
      priority: 140,
    });
  }

  if (proteinRemaining >= 25 && surplus === 0) {
    recommendations.push({
      id: "protein",
      title: proteinAnchor
        ? `Andalkan ${proteinAnchor.name} untuk protein`
        : `Tambah sekitar ${Math.min(40, proteinRemaining)} g protein lagi`,
      detail: proteinAnchor
        ? "Ini menu langgananmu yang proteinnya lumayan tinggi. Jadikan porsinya patokan, bukan keharusan."
        : "Pilih sumber protein yang bikin kenyang dulu, baru camilan atau tambahan karbo.",
      evidence: proteinAnchor
        ? `${proteinAnchor.count} catatan · rata-rata ${proteinAnchor.averageProteinG} g protein dan ${proteinAnchor.averageCalories} kcal`
        : `sisa ${proteinRemaining} g protein`,
      priority: 105,
      href: proteinAnchor ? "/makan/habits" : "/makan?mode=cari",
      actionLabel: proteinAnchor ? "Lihat kebiasaanmu" : "Cari sumber protein",
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
      title: "Beratmu turun cukup cepat, jangan tambah defisit dulu",
      detail:
        "Tahan di target sekarang dan perhatikan energi, rasa lapar, dan performa latihanmu sebelum bikin target lebih ketat.",
      evidence: `${weightTrend.weeklyRate} kg/minggu · batas aman sekitar -${fastestReasonableLoss.toFixed(1)} kg/minggu`,
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
      title: "Cek konsistensi dulu sebelum ubah target",
      detail:
        "Lihat lagi porsi menu langgananmu, kelengkapan catatan, dan budget mingguan. Satu minggu belum cukup untuk menyimpulkan kebutuhan kalorimu berubah.",
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
        title: "Berat turun cepat, cek asupanmu",
        detail:
          "Jangan tambah defisit. Cek apakah catatan makanmu lengkap, dan perhatikan energi serta rasa laparmu. Kalau turunnya tidak disengaja atau ada keluhan, sebaiknya konsultasi ke tenaga kesehatan.",
        evidence: `${rate.toFixed(2)} kg/minggu dari rata-rata jendela awal/akhir · ${weight.observedDays} ukuran · ${current.start} — ${current.end}`,
        priority: 155,
        href: "/progress",
        actionLabel: "Lihat pola tubuhmu",
      });
    } else if (
      weight.ready &&
      current.waist.ready &&
      Math.abs(weight.change ?? 0) <= 0.3 &&
      (current.waist.change ?? 0) <= -0.5
    ) {
      recommendations.push({
        id: "body-stable-waist",
        title: "Berat stabil, tapi pinggang berubah",
        detail:
          "Pertahankan pola sekarang dan ukur dengan kondisi yang sama tiap kali. Ini belum tentu berarti lemak turun atau otot naik, jadi jangan memperketat target hanya karena timbangan stabil.",
        evidence: `Selisih rata-rata berat ${weight.change} kg · pinggang ${current.waist.change} cm (${current.waist.first!.date} — ${current.waist.last!.date})`,
        priority: 98,
        href: "/progress",
        actionLabel: "Lihat ukuran tubuhmu",
      });
    } else if (
      rate !== null &&
      rate > 0.1 &&
      settings.fitnessGoal !== "muscle_gain"
    ) {
      recommendations.push({
        id: "body-trend-up",
        title: "Cek pola dulu sebelum ubah target",
        detail:
          "Lihat lagi porsi, kelengkapan catatan, dan cara kamu menimbang. Target baru baru ditawarkan kalau datanya sudah cukup rapi, dan keputusannya tetap di kamu.",
        evidence: `${rate.toFixed(2)} kg/minggu · ${weight.observedDays} ukuran sepanjang ${span} hari`,
        priority: 88,
        href: "/progress",
        actionLabel: "Lihat respons tubuhmu",
      });
    }
    if (!weight.ready || !current.food.ready)
      recommendations.push({
        id: "body-data",
        title: "Data belum cukup untuk menilai respons tubuhmu",
        detail:
          "Tutup hari hanya kalau catatan makannya benar-benar lengkap, dan timbang berat rutin dengan kondisi yang mirip. Data yang jarang belum cukup untuk mengubah target.",
        evidence: `${current.food.observedDays}/28 hari asupan lengkap · ${weight.observedDays} ukuran berat`,
        priority: 72,
        href: "/progress",
        actionLabel: "Lihat data yang kurang",
      });
    if (
      current.protein.ready &&
      current.protein.average! < settings.proteinTargetG * 0.8
    )
      recommendations.push({
        id: "body-protein",
        title: "Naikkan protein harianmu pelan-pelan",
        detail:
          "Rata-rata proteinmu masih di bawah target. Coba taruh sumber protein di tiap makan utama. Angka ini tidak mengukur massa ototmu, ya.",
        evidence: `${current.protein.average} g/hari dari ${current.protein.observedDays} hari lengkap · target ${settings.proteinTargetG} g`,
        priority: 92,
        href: "/makan",
        actionLabel: "Atur sumber proteinmu",
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
      title: `Kalau mau ${repeatedLargeMeal.name}, kecilkan porsinya`,
      detail:
        "Tetap boleh, tapi biasanya porsimu lebih besar dari sisa budget hari ini. Ambil porsi lebih kecil atau kurangi pendampingnya.",
      evidence: `biasanya ${repeatedLargeMeal.averageCalories} kcal · hari ini sisa ${summary.remaining} kcal`,
      priority: moment === "hungry" || moment === "very_hungry" ? 108 : 78,
      href: "/makan/habits",
      actionLabel: "Lihat porsi biasanya",
    });
  }

  if (!log.plan) {
    recommendations.push({
      id: "plan",
      title: "Pilih strategi buat hari ini",
      detail:
        "Punya rencana sederhana bikin keputusan makan berikutnya lebih gampang dan nggak asal ambil.",
      evidence: "belum ada rencana hari ini",
      priority: 96,
      href: "/plan",
      actionLabel: "Pilih rencana",
    });
  }

  if (log.burns.length === 0 && surplus === 0) {
    recommendations.push({
      id: "movement",
      title: "Kalau sempat, gerak ringan dulu",
      detail:
        "Jalan santai bisa bikin segar dan mengalihkan craving. Tapi ini bukan kewajiban, dan bukan untuk 'membayar' makanan.",
      evidence: "belum ada aktivitas tercatat",
      priority: 45,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "maintain",
      title: "Pola kamu sudah bagus, lanjut",
      detail:
        "Nggak ada yang perlu dikoreksi. Makan sesuai rasa lapar dan target yang sudah kamu tetapkan.",
      evidence:
        "kalori, protein, dan budget mingguan semuanya aman",
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
