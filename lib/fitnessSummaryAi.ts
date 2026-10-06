import type { FitnessIntelligence } from "./fitnessIntelligence";
import { generateDeepseekJson } from "./deepseekClient";

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
Berikan ringkasan Bahasa Indonesia 80-120 kata dan tepat 3 rekomendasi singkat yang actionable.`;

const JSON_SHAPE_HINT = `{"summary": "string, 80-120 kata", "recommendations": ["string", "string", "string"]}`;

// Zero-cost fallback for when DEEPSEEK_API_KEY isn't configured. The
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
  return { summary: input.recap, recommendations, source: "template" };
}

export async function generateFitnessSummary(input: FitnessIntelligence): Promise<FitnessSummaryResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return templateFitnessSummary(input);
  }

  const parsed = await generateDeepseekJson<Omit<FitnessSummaryResult, "source">>({
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
