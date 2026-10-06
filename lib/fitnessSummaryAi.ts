import type { FitnessIntelligence } from "./fitnessIntelligence";
import { generateDeepseekJson } from "./deepseekClient";

export interface FitnessSummaryResult {
  summary: string;
  recommendations: string[];
}

const SYSTEM_PROMPT = `Kamu adalah coach kebugaran untuk aplikasi pribadi.
Gunakan HANYA data JSON yang diberikan. Jangan mengarang makanan, latihan, diagnosis, usia, jenis kelamin, atau riwayat medis.
VO2 max dan body fat dari perangkat adalah estimasi; jangan perlakukan sebagai hasil laboratorium.
Jangan mendorong body fat ekstrem, defisit agresif, puasa kompensasi, atau olahraga sebagai hukuman.
Sesuaikan interpretasi dengan goal pengguna: weight loss, very lean, athletic, atau muscle gain.
Berikan ringkasan Bahasa Indonesia 80-120 kata dan tepat 3 rekomendasi singkat yang actionable.`;

const JSON_SHAPE_HINT = `{"summary": "string, 80-120 kata", "recommendations": ["string", "string", "string"]}`;

export async function generateFitnessSummary(input: FitnessIntelligence): Promise<FitnessSummaryResult> {
  const parsed = await generateDeepseekJson<FitnessSummaryResult>({
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
