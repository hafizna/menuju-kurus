import type { FitnessIntelligence } from "./fitnessIntelligence";
import { generateTextJson, SUMMARY_RESPONSE_SCHEMA, textAiProvider } from "./textAi";

export interface FitnessSummaryResult {
  summary: string;
  recommendations: string[];
  source: "ai" | "template";
}

const SYSTEM_PROMPT = `Kamu adalah coach kebugaran untuk aplikasi pribadi.
Gunakan HANYA data JSON yang diberikan. Jangan mengarang makanan, latihan, diagnosis, usia, jenis kelamin, atau riwayat medis.
VO2 max dan body fat dari perangkat adalah estimasi; jangan perlakukan sebagai hasil laboratorium.
Jangan mendorong body fat ekstrem, defisit agresif, puasa kompensasi, atau olahraga sebagai hukuman.
Sesuaikan interpretasi dengan goal pengguna: weight loss, very lean, athletic, atau muscle gain.

Bidang hasil perhitungan aplikasi pada data:
- signals: pengamatan deterministik dari riwayat berat, body fat, detak istirahat, dan VO2 max. Jadikan ini sumber utama penjelasan; jangan menghitung ulang angka dan jangan menambah sebab baru.
- composition: perubahan rata-rata berat, massa lemak, dan massa bebas lemak (estimasi dari timbangan impedansi). Massa bebas lemak mencakup air, glikogen, organ, dan tulang, BUKAN otot saja; jangan menyebut kehilangan atau penambahan otot. Jika ready=false, katakan datanya belum cukup (lihat needs) dan jangan menyimpulkan pola. confidence "low" berarti sampel masih sedikit.
- restingHeartRateTrend dan vo2MaxTrend: stale=true berarti pembacaan lama, jadi sebutkan umurnya (ageDays) dan jangan menyebutnya kondisi terkini. Detak istirahat lebih tinggi dari baseline hanya boleh dikaitkan dengan kemungkinan tidur, stres, kafein, latihan berat, atau kurang sehat, dan bukan diagnosis.
- Nilai null atau ready=false berarti belum ada data: lewati atau sebut "belum cukup data", jangan berasumsi.
Berikan ringkasan Bahasa Indonesia 80-120 kata dan tepat 3 rekomendasi singkat yang actionable, berdasarkan priorities dan signals.`;

const JSON_SHAPE_HINT = `{"summary": "string, 80-120 kata", "recommendations": ["string", "string", "string"]}`;

// Zero-cost fallback for when no text AI key (Gemini or DeepSeek) is configured. The
// underlying engine (lib/fitnessIntelligence.ts) already computes a
// deterministic one-line `recap` and ranked `priorities` — this just
// repackages that existing output instead of calling any model, so there's
// no separate template logic to keep in sync with the engine.
const GENERIC_FITNESS_RECS = [
  "Pertahankan pola latihan dan logging yang sudah berjalan.",
  "Catat VO2 max, resting heart rate, atau body fat secara rutin biar skor makin akurat.",
  "Review lagi minggu depan untuk lihat progres lanjutan.",
];

function templateFitnessSummary(input: FitnessIntelligence): FitnessSummaryResult {
  const recommendations = input.priorities.slice(0, 3);
  for (const generic of GENERIC_FITNESS_RECS) {
    if (recommendations.length >= 3) break;
    if (!recommendations.includes(generic)) recommendations.push(generic);
  }
  const summary = [input.recap, ...input.signals.slice(0, 2)].join(" ");
  return { summary, recommendations, source: "template" };
}

export async function generateFitnessSummary(input: FitnessIntelligence): Promise<FitnessSummaryResult> {
  if (!textAiProvider()) {
    return templateFitnessSummary(input);
  }

  const parsed = await generateTextJson<Omit<FitnessSummaryResult, "source">>({
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Data:\n${JSON.stringify(input, null, 2)}`,
    jsonShapeHint: JSON_SHAPE_HINT,
    responseSchema: SUMMARY_RESPONSE_SCHEMA,
    emptyResponseMessage: "The AI provider returned no summary",
  });

  return {
    summary: String(parsed.summary ?? ""),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 3).map((item: unknown) => String(item))
      : [],
    source: "ai",
  };
}
