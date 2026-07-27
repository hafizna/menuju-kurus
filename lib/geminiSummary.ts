import { generateGeminiJson } from "./geminiClient";

export interface WeeklySummaryInput {
  weightTrend: number | null;
  weeklyCalories: number;
  protein: number;
  exercise: number;
  successRate: number;
}

export interface WeeklySummaryResult {
  summary: string;
  recommendations: string[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    recommendations: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ["summary", "recommendations"],
};

const SYSTEM_PROMPT = `Kamu adalah asisten ringkasan mingguan untuk aplikasi pelacak kalori & berat badan pribadi.

ATURAN PENTING:
- Kamu HANYA boleh menggunakan angka-angka pada data JSON di bawah. JANGAN mengarang aktivitas, jenis makanan, tanggal, atau detail apa pun yang tidak ada di data.
- Jika sebuah nilai null, jangan berasumsi atau berpura-pura ada datanya — cukup lewati atau sebut sebagai "belum ada data".
- Nada: suportif tapi jujur. Kalau datanya kurang baik, katakan apa adanya, jangan hanya memuji.

Tugas:
1. "summary": ringkasan progres minggu ini dalam Bahasa Indonesia, sekitar 80-100 kata.
2. "recommendations": tepat 3 rekomendasi singkat dan actionable untuk minggu depan, berdasarkan angka yang diberikan.`;

export async function generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummaryResult> {
  const parsed = await generateGeminiJson<WeeklySummaryResult>({
    parts: [{ text: `${SYSTEM_PROMPT}\n\nData:\n${JSON.stringify(input, null, 2)}` }],
    responseSchema: RESPONSE_SCHEMA,
    emptyResponseMessage: "Gemini returned no summary",
  });

  return {
    summary: String(parsed.summary ?? ""),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 3).map((item: unknown) => String(item))
      : [],
  };
}
