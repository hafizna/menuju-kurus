export interface WeeklySummaryInput {
  weightTrend: number | null; // kg/week, negative = losing
  weeklyCalories: number; // avg daily calorie intake this week
  protein: number; // avg daily protein (g) this week
  exercise: number; // days out of 7 with an exercise/burn logged
  successRate: number; // 0-100
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

// Deliberately receives only these 5 numbers — no meal names, no dates, no
// free text — so there's nothing concrete for the model to hallucinate
// details about. It must reason from the numbers alone.
const SYSTEM_PROMPT = `Kamu adalah asisten ringkasan mingguan untuk aplikasi pelacak kalori & berat badan pribadi.

ATURAN PENTING:
- Kamu HANYA boleh menggunakan angka-angka pada data JSON di bawah. JANGAN mengarang aktivitas, jenis makanan, tanggal, atau detail apa pun yang tidak ada di data.
- Jika sebuah nilai null, jangan berasumsi atau berpura-pura ada datanya — cukup lewati atau sebut sebagai "belum ada data".
- Nada: suportif tapi jujur. Kalau datanya kurang baik, katakan apa adanya, jangan hanya memuji.

Tugas:
1. "summary": ringkasan progres minggu ini dalam Bahasa Indonesia, sekitar 80-100 kata.
2. "recommendations": tepat 3 rekomendasi singkat dan actionable untuk minggu depan, berdasarkan angka yang diberikan.`;

export async function generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${SYSTEM_PROMPT}\n\nData:\n${JSON.stringify(input, null, 2)}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no summary");

  const parsed = JSON.parse(text);
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.slice(0, 3).map((r: unknown) => String(r))
    : [];

  return {
    summary: String(parsed.summary ?? ""),
    recommendations,
  };
}
