import type { BodyResponseReport, ResponseDay } from "./bodyResponse";
import type { UserSettings } from "./types";
import { computeProgramRecommendation } from "./programCalories";

export interface CalibrationReview {
  decision: "applied" | "kept";
  reviewedAt: string;
  reviewAfter: string;
  periodStart: string;
  periodEnd: string;
  previousTarget: number;
  selectedTarget: number;
  estimatedTdee: number;
  tdeeRange: [number, number];
}
export interface CalibrationResult {
  status: "insufficient" | "paused" | "waiting" | "steady" | "proposal";
  reasons: string[];
  periodStart: string;
  periodEnd: string;
  foodDays: number;
  weightSamples: number;
  oldTarget: number;
  proposedTarget: number | null;
  initialTdee: number | null;
  estimatedTdee: number | null;
  tdeeRange: [number, number] | null;
  weeklyRate: number | null;
  reviewAfter: string | null;
}
export const CALIBRATION_POLICY = {
  periodDays: 28,
  minimumFoodDays: 26,
  minimumFoodDaysPerWeek: 6,
  minimumWeightSamples: 12,
  minimumEndpointSamples: 3,
  minimumWeightSpanDays: 21,
  maximumRecentGapDays: 3,
  maximumEndpointSdKg: 1,
  maximumRateDisagreementKgPerWeek: 0.5,
  maximumTargetChangeKcal: 100,
  maximumTargetChangeRatio: 0.05,
  reevaluateDays: 28,
} as const;
const DAY = 86400000;
const avg = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const to50 = (n: number) => Math.round(n / 50) * 50;
export const addCalendarDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
function endpoint(rows: ResponseDay[], start: string) {
  const samples = rows.filter((day) => day.weight !== null);
  if (!samples.length) return null;
  const mean = avg(samples.map((day) => day.weight!));
  return {
    mean,
    count: samples.length,
    day: avg(
      samples.map((row) => (Date.parse(row.date) - Date.parse(start)) / DAY),
    ),
    sd: Math.sqrt(avg(samples.map((row) => (row.weight! - mean) ** 2))),
  };
}

// Fixed 28 closed calendar days. The sensitivity range is a product heuristic,
// not a statistical confidence interval. Wearable energy is deliberately unused.
export function buildCalibration(
  today: string,
  report: BodyResponseReport,
  settings: UserSettings,
): CalibrationResult {
  const current = report.current;
  const program = computeProgramRecommendation(settings);
  const result: CalibrationResult = {
    status: "insufficient",
    reasons: [],
    periodStart: current.start,
    periodEnd: current.end,
    foodDays: current.food.observedDays,
    weightSamples: current.weight.observedDays,
    oldTarget: settings.dailyTargetKcal,
    proposedTarget: null,
    initialTdee: program.maintenanceCalories,
    estimatedTdee: null,
    tdeeRange: null,
    weeklyRate: null,
    reviewAfter: settings.calibrationReview?.reviewAfter ?? null,
  };
  const reasons = result.reasons;
  if (report.periodDays !== 28 || current.end !== addCalendarDays(today, -1))
    reasons.push(
      "Kalibrasi memerlukan 28 hari kalender yang sudah selesai; hari ini tidak dipakai.",
    );
  if (current.food.observedDays < 26)
    reasons.push(
      "Perlu minimal 26 dari 28 hari dengan asupan lengkap dan valid.",
    );
  for (let index = 0; index < 28; index += 7)
    if (
      current.days
        .slice(index, index + 7)
        .filter((day) => day.calories !== null).length < 6
    )
      reasons.push(
        `Pekan ${index / 7 + 1} perlu minimal 6 hari asupan lengkap.`,
      );
  if (current.weight.observedDays < 12)
    reasons.push("Perlu minimal 12 ukuran berat.");
  const first = endpoint(current.days.slice(0, 7), current.start),
    last = endpoint(current.days.slice(-7), current.start),
    middle = endpoint(current.days.slice(7, 21), current.start);
  if (!first || !last || first.count < 3 || last.count < 3)
    reasons.push(
      "Perlu minimal 3 ukuran berat pada masing-masing 7 hari awal dan akhir.",
    );
  if (!middle || middle.count < 3)
    reasons.push("Perlu minimal 3 ukuran berat di bagian tengah periode.");
  if (
    !current.weight.first ||
    !current.weight.last ||
    (Date.parse(current.weight.last.date) -
      Date.parse(current.weight.first.date)) /
      DAY <
      21
  )
    reasons.push("Jarak ukuran pertama dan terakhir perlu minimal 21 hari.");
  if (
    !current.weight.last ||
    (Date.parse(current.end) - Date.parse(current.weight.last.date)) / DAY > 3
  )
    reasons.push(
      "Ukuran berat terakhir perlu ada dalam 3 hari terakhir periode.",
    );
  if (reasons.length) return result;
  result.status = "paused";
  if (
    !settings.programConfigured ||
    !program.complete ||
    settings.age! < 18 ||
    !Number.isFinite(program.bmr) ||
    program.bmr! <= 0 ||
    !Number.isFinite(settings.dailyTargetKcal)
  )
    reasons.push(
      "Lengkapi dan terapkan profil program dewasa sebelum kalibrasi.",
    );
  if (
    (settings.heightCm && last!.mean / (settings.heightCm / 100) ** 2 < 20) ||
    (program.bmi !== null && program.bmi < 20)
  )
    reasons.push(
      "Kalibrasi otomatis ditunda untuk BMI di bawah 20; tinjau target secara personal.",
    );
  if (
    current.days.some((day) =>
      day.review.some(
        (code) => code.startsWith("food") || code.startsWith("weight"),
      ),
    )
  )
    reasons.push(
      "Tinjau nilai asupan atau berat yang ditandai sebelum memakai estimasi.",
    );
  if (!current.food.ready || !current.weight.ready)
    reasons.push(
      "Kualitas/sebaran asupan dan berat belum memenuhi aturan Body Response.",
    );
  const minimum = settings.biologicalSex === "male" ? 1500 : 1200;
  if (settings.dailyTargetKcal < minimum || current.food.average! < minimum)
    reasons.push(
      "Target aktif atau rata-rata asupan berada di bawah batas awal program; tinjau kecukupan makan sebelum kalibrasi.",
    );
  if (first!.sd > 1 || last!.sd > 1)
    reasons.push(
      "Variasi berat di jendela awal atau akhir terlalu besar untuk kalibrasi ini.",
    );
  const rate = ((last!.mean - first!.mean) / (last!.day - first!.day)) * 7;
  result.weeklyRate = Math.round(rate * 100) / 100;
  if (Math.abs(rate) > first!.mean * 0.01)
    reasons.push(
      "Perubahan berat melebihi 1% per minggu; jangan memakai kalibrasi ini untuk memperketat target.",
    );
  const earlyRate =
    ((middle!.mean - first!.mean) / (middle!.day - first!.day)) * 7;
  const lateRate =
    ((last!.mean - middle!.mean) / (last!.day - middle!.day)) * 7;
  if (Math.abs(earlyRate - lateRate) > 0.5)
    reasons.push(
      "Arah/laju berat awal dan akhir belum cukup konsisten; kumpulkan periode berikutnya.",
    );
  if (reasons.length) return result;
  const intake = current.food.average!;
  const energyCorrection = (rate * 7700) / 7;
  const estimate = intake - energyCorrection;
  // Sensitivity to intake error and weight/capture variation; not physiology precision.
  const margin = Math.max(
    200,
    intake * 0.1 + Math.abs(energyCorrection) * 0.35,
  );
  const range: [number, number] = [
    Math.floor((estimate - margin) / 50) * 50,
    Math.ceil((estimate + margin) / 50) * 50,
  ];
  if (
    !Number.isFinite(estimate) ||
    estimate < program.bmr! * 0.9 ||
    estimate > 4500 ||
    range[0] <= 0
  ) {
    reasons.push(
      "Estimasi di luar rentang penggunaan engine; tinjau catatan dan profil.",
    );
    return result;
  }
  result.estimatedTdee = to50(estimate);
  result.tdeeRange = range;
  if (
    settings.calibrationReview &&
    today < settings.calibrationReview.reviewAfter
  ) {
    result.status = "waiting";
    reasons.push(
      `Evaluasi ulang mulai ${settings.calibrationReview.reviewAfter}; beri pola baru waktu sebelum perubahan berikutnya.`,
    );
    return result;
  }
  const factor = 1 + program.adjustmentPercent / 100;
  const desired = Math.max(minimum, to50(estimate * factor));
  const limit =
    Math.floor(Math.min(100, settings.dailyTargetKcal * 0.05) / 50) * 50;
  const delta =
    Math.sign(desired - settings.dailyTargetKcal) *
    Math.min(limit, Math.abs(desired - settings.dailyTargetKcal));
  const proposed = Math.max(minimum, settings.dailyTargetKcal + delta);
  if (
    (settings.dailyTargetKcal >= range[0] * factor &&
      settings.dailyTargetKcal <= range[1] * factor) ||
    Math.abs(proposed - settings.dailyTargetKcal) < 50
  ) {
    result.status = "steady";
    reasons.push(
      "Target aktif masih berada dalam rentang perkiraan sesuai goal, atau selisih terlalu kecil; pertahankan dahulu.",
    );
    return result;
  }
  if (
    Math.abs(proposed - settings.dailyTargetKcal) > limit ||
    proposed < minimum
  ) {
    reasons.push(
      "Target aktif memerlukan peninjauan manual sebelum penyesuaian bertahap.",
    );
    return result;
  }
  result.status = "proposal";
  result.proposedTarget = proposed;
  reasons.push(
    `Usulan dibatasi ${limit} kcal per evaluasi; goal ${settings.fitnessGoal} memakai penyesuaian ${program.adjustmentPercent}% dari estimasi maintenance.`,
  );
  return result;
}
