import { generateDeepseekJson } from "./deepseekClient";
import type { FitnessGoal } from "./types";

export interface WeeklySummaryInput {
  weightTrend: number | null;
  weeklyCalories: number | null;
  protein: number | null;
  exercise: number;
  successRate: number | null;
  completedFoodDays: number;
  totalDays: number;
  belowRangeDays: number;
  withinRangeDays: number;
  aboveRangeDays: number;
  incompleteDays: number;
  fitnessGoal: FitnessGoal;
  proteinTargetG: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface WeeklySummaryResult {
  summary: string;
  recommendations: string[];
  source: "ai" | "template";
}

const SYSTEM_PROMPT = `Kamu adalah asisten ringkasan mingguan untuk aplikasi pelacak kalori & berat badan pribadi.

ATURAN PENTING:
- Kamu HANYA boleh menggunakan angka-angka pada data JSON di bawah. JANGAN mengarang aktivitas, jenis makanan, tanggal, atau detail apa pun yang tidak ada di data.
- Jika sebuah nilai null, jangan berasumsi atau berpura-pura ada datanya — cukup lewati atau sebut sebagai "belum ada data".
- weeklyCalories adalah rata-rata asupan dari hari dengan catatan lengkap, bukan kalori bersih atau total mingguan. Hari yang belum lengkap tidak dianggap asupan nol. Sebutkan cakupan completedFoodDays/totalDays. Aktivitas tidak menambah budget makan dan tidak perlu ditebus.
- belowRangeDays, withinRangeDays, aboveRangeDays adalah jumlah hari lengkap dengan asupan di bawah 80%, 80–100%, atau di atas target. incompleteDays tidak boleh dinilai. successRate rendah tidak berarti kebanyakan hari kelebihan makan; jelaskan penyebab dari jumlah hari aktual. Rentang ini heuristik aplikasi, bukan batas kecukupan medis.
- Sesuaikan interpretasi arah berat dengan fitnessGoal. Kenaikan berat bukan otomatis masalah pada muscle_gain. Gunakan proteinTargetG, jangan buat target protein sendiri. Jangan mengklaim persentase di bawah 50% sebagai mayoritas.
- Nada: suportif tapi jujur. Kalau datanya kurang baik, katakan apa adanya, jangan hanya memuji.

Tugas:
1. "summary": ringkasan progres minggu ini dalam Bahasa Indonesia, sekitar 80-100 kata.
2. "recommendations": tepat 3 rekomendasi singkat dan actionable untuk minggu depan, berdasarkan angka yang diberikan.`;

const JSON_SHAPE_HINT = `{"summary": "string, 80-100 kata", "recommendations": ["string", "string", "string"]}`;

// Pure, deterministic, zero-cost fallback used whenever DEEPSEEK_API_KEY isn't
// configured — same input/output shape as the AI path, just template
// sentences instead of a model call. Lets the feature work for free (no AI
// spend at all) until/unless DeepSeek is turned on later.
export function templateWeeklySummary(input: WeeklySummaryInput): WeeklySummaryResult {
  const sentences: string[] = [];
  const coverage = input.totalDays > 0 ? `${input.completedFoodDays}/${input.totalDays} hari` : null;

  if (input.completedFoodDays === 0) {
    sentences.push(
      coverage
        ? `Belum ada hari dengan catatan makan lengkap dari ${coverage} minggu ini.`
        : "Belum ada catatan makan minggu ini."
    );
    sentences.push("Belum cukup data untuk melihat pola — coba catat makan lebih konsisten minggu depan.");
  } else {
    sentences.push(`Minggu ini kamu punya catatan makan lengkap di ${coverage}.`);
    if (input.weeklyCalories !== null) {
      sentences.push(`Rata-rata asupan di hari lengkap sekitar ${Math.round(input.weeklyCalories)} kcal.`);
    }
    if (input.protein !== null) {
      sentences.push(`Protein rata-rata ${Math.round(input.protein)} g per hari.`);
    }
    sentences.push(`${input.belowRangeDays} hari di bawah rentang feedback, ${input.withinRangeDays} hari di dalam rentang, dan ${input.aboveRangeDays} hari di atas target.`);
    if (input.successRate !== null) sentences.push(`${input.successRate}% hari lengkap berada dalam rentang feedback 80–100% target; ini heuristik aplikasi.`);
  }
  if (input.incompleteDays > 0) sentences.push(`${input.incompleteDays} hari belum lengkap dan belum dinilai.`);

  if (input.weightTrend !== null) {
    if (input.weightTrend < -0.1) {
      sentences.push(`Tren berat turun sekitar ${Math.abs(input.weightTrend).toFixed(1)} kg/minggu.`);
    } else if (input.weightTrend > 0.1) {
      sentences.push(`Tren berat naik sekitar ${input.weightTrend.toFixed(1)} kg/minggu.`);
    } else {
      sentences.push("Berat relatif stabil minggu ini.");
    }
  } else {
    sentences.push("Belum ada tren berat yang bisa dibaca — coba timbang lebih rutin.");
  }

  if (input.exercise > 0) {
    sentences.push(`Tercatat aktivitas di ${input.exercise} hari, tidak menambah budget makan.`);
  }

  const recs: { text: string; priority: number }[] = [];
  if (input.totalDays > 0 && input.completedFoodDays < input.totalDays * 0.5) {
    recs.push({ text: "Catat makan lebih konsisten, minimal di hari-hari biasa, biar polanya kebaca.", priority: 100 });
  }
  if (input.belowRangeDays > 0) {
    recs.push({ text: "Tinjau hari dengan asupan di bawah rentang: cek catatan yang terlewat dan kecukupan makan; jangan memperbesar defisit.", priority: 98 });
  }
  if (input.weightTrend !== null && input.weightTrend > 0.3 && input.fitnessGoal !== "muscle_gain") {
    recs.push({ text: "Tren berat naik cukup cepat minggu ini — evaluasi total asupan mingguan.", priority: 95 });
  }
  if (input.weightTrend !== null && input.weightTrend < -1.2) {
    recs.push({ text: "Penurunan berat sudah cukup cepat — jangan tambah defisit dulu.", priority: 95 });
  }
  if (input.protein !== null && input.protein < input.proteinTargetG) {
    recs.push({ text: "Tambahkan sumber protein di tiap meal biar lebih kenyang dan sesuai target.", priority: 90 });
  }
  if (input.aboveRangeDays > input.completedFoodDays / 2) {
    recs.push({ text: "Perhatikan porsi di hari-hari yang kalorinya sering lebih dari target.", priority: 85 });
  }
  if (input.weightTrend === null) {
    recs.push({ text: "Timbang badan lebih rutin biar tren mingguan bisa kebaca.", priority: 80 });
  }
  if (input.exercise === 0) {
    recs.push({ text: "Aktivitas ringan boleh ditambah, tidak wajib tapi membantu konsistensi.", priority: 50 });
  }
  // Always-available generics so the list still reaches 3 even when none of
  // the conditional checks above fire (i.e. the week genuinely looks fine).
  recs.push({ text: "Pertahankan pola makan dan logging yang sudah berjalan.", priority: 10 });
  recs.push({ text: "Review lagi minggu depan untuk lihat progres lanjutan.", priority: 5 });
  recs.push({ text: "Pilih satu kebiasaan sederhana yang ingin kamu lanjutkan minggu depan.", priority: 1 });

  const recommendations = recs
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((r) => r.text);

  return { summary: sentences.join(" "), recommendations, source: "template" };
}

export async function generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummaryResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return templateWeeklySummary(input);
  }

  const parsed = await generateDeepseekJson<Omit<WeeklySummaryResult, "source">>({
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Data:\n${JSON.stringify(input, null, 2)}`,
    jsonShapeHint: JSON_SHAPE_HINT,
    emptyResponseMessage: "DeepSeek returned no summary",
  });

  if (typeof parsed.summary !== "string" || !parsed.summary.trim() ||
    !Array.isArray(parsed.recommendations) || parsed.recommendations.length !== 3 ||
    parsed.recommendations.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("Provider returned an incomplete weekly summary");
  }

  return {
    summary: parsed.summary.trim(),
    recommendations: parsed.recommendations.map((item) => item.trim()),
    source: "ai",
  };
}
