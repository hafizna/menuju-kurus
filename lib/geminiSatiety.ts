import type { SatietyStrategy, SatietyStrategyInput } from "./satiety";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    suggestions: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
  },
  required: ["summary", "suggestions"],
};

export async function generateSatietySummary(input: SatietyStrategyInput, strategy: SatietyStrategy) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const payload = {
    goal: input.goal,
    intent: input.intent,
    objectives: input.objectives,
    remainingCalories: input.remainingCalories,
    remainingProteinG: input.remainingProteinG,
    pantry: input.pantry ?? [],
    mealCalorieBudget: strategy.mealCalorieBudget,
    proteinTargetG: strategy.proteinTargetG,
    rankedFoods: strategy.recommendations.map((food) => ({
      name: food.name,
      serving: food.serving,
      calories: food.calories,
      proteinG: food.proteinG,
      fiberG: food.fiberG,
      fullnessScore: food.fullnessScore,
      why: food.why,
    })),
  };

  const system = `Kamu adalah nutrition decision assistant berbahasa Indonesia.
Gunakan HANYA data JSON yang diberikan. Jangan mengarang kalori, bahan, diagnosis, kondisi medis, atau klaim pasti tentang rasa kenyang.
Fullness Score adalah estimasi heuristik, bukan fakta klinis.
Jangan menyarankan puasa kompensasi, muntah, olahraga sebagai hukuman, atau target ekstrem.
Tulis satu ringkasan singkat dan tepat 3 saran praktis. Bila pantry kosong, sebut contoh sebagai opsi, bukan bahan yang pasti tersedia.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${system}\n\nData:\n${JSON.stringify(payload, null, 2)}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.25 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no satiety summary");
  const parsed = JSON.parse(text);
  return {
    summary: String(parsed.summary ?? ""),
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
  };
}
