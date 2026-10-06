import { generateDeepseekJson } from "./deepseekClient";

export interface WeeklySummaryInput {
  weightTrend: number | null;
  weeklyCalories: number | null;
  protein: number | null;
  exercise: number;
  successRate: number | null;
  completedFoodDays: number;
  totalDays: number;
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
- Nada: suportif tapi jujur. Kalau datanya kurang baik, katakan apa adanya, jangan hanya memuji.

Tugas:
1. "summary": ringkasan progres minggu ini dalam Bahasa Indonesia, sekitar 80-100 kata.
2. "recommendations": tepat 3 rekomendasi singkat dan actionable untuk minggu depan, berdasarkan angka yang diberikan.`;

const JSON_SHAPE_HINT = `{"summary": "string, 80-100 kata", "recommendations": ["string", "string", "string"]}`;

// Pure, deterministic, zero-cost fallback used whenever DEEPSEEK_API_KEY isn't
// configured — same input/output shape as the AI path, just template
// sentences instead of a model call. Lets the feature work for free (no AI
// spend at all) until/unless DeepSeek is turned on later.
function templateWeeklySummary(input: WeeklySummaryInput): WeeklySummaryResult {
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
    if (input.successRate !== null) {
      if (input.successRate >= 70) {
        sentences.push(`Success rate ${input.successRate}% — cukup konsisten di jalur target.`);
      } else if (input.successRate >= 40) {
        sentences.push(`Success rate ${input.successRate}% — separuh lebih hari di jalur target, masih ada ruang perbaikan.`);
      } else {
        sentences.push(`Success rate ${input.successRate}% — sebagian besar hari di atas target.`);
      }
    }
  }

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
  if (input.weightTrend !== null && input.weightTrend > 0.3) {
    recs.push({ text: "Tren berat naik cukup cepat minggu ini — evaluasi total asupan mingguan.", priority: 95 });
  }
  if (input.weightTrend !== null && input.weightTrend < -1.2) {
    recs.push({ text: "Penurunan berat sudah cukup cepat — jangan tambah defisit dulu.", priority: 95 });
  }
  if (input.protein !== null && input.protein < 80) {
    recs.push({ text: "Tambahkan sumber protein di tiap meal biar lebih kenyang dan sesuai target.", priority: 90 });
  }
  if (input.successRate !== null && input.successRate < 50) {
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
  recs.push({ text: "Konsistensi minggu ini sudah bagus — jaga ritme yang sama minggu depan.", priority: 1 });

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

  return {
    summary: String(parsed.summary ?? ""),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 3).map((item: unknown) => String(item))
      : [],
    source: "ai",
  };
}
