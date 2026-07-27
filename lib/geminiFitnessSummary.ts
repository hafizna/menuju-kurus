import type { FitnessIntelligence } from "./fitnessIntelligence";

export interface FitnessSummaryResult {
  summary: string;
  recommendations: string[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    recommendations: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
  },
  required: ["summary", "recommendations"],
};

const SYSTEM_PROMPT = `Kamu adalah coach kebugaran untuk aplikasi pribadi.
Gunakan HANYA data JSON yang diberikan. Jangan mengarang makanan, latihan, diagnosis, usia, jenis kelamin, atau riwayat medis.
VO2 max dan body fat dari perangkat adalah estimasi; jangan perlakukan sebagai hasil laboratorium.
Jangan mendorong body fat ekstrem, defisit agresif, puasa kompensasi, atau olahraga sebagai hukuman.
Sesuaikan interpretasi dengan goal pengguna: weight loss, very lean, athletic, atau muscle gain.
Berikan ringkasan Bahasa Indonesia 80-120 kata dan tepat 3 rekomendasi singkat yang actionable.`;

export async function generateFitnessSummary(input: FitnessIntelligence): Promise<FitnessSummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nData:\n${JSON.stringify(input, null, 2)}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.25 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no summary");
  const parsed = JSON.parse(text);
  return {
    summary: String(parsed.summary ?? ""),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 3).map((item: unknown) => String(item))
      : [],
  };
}
