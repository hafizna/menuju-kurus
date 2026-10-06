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

export async function generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummaryResult> {
  const parsed = await generateDeepseekJson<WeeklySummaryResult>({
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
  };
}
