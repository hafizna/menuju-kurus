import type { SatietyStrategy, SatietyStrategyInput } from "./satiety";
import { generateGeminiJson } from "./geminiClient";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    suggestions: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
  },
  required: ["summary", "suggestions"],
};

interface SatietyAiResult {
  summary: string;
  suggestions: string[];
}

export async function generateSatietySummary(input: SatietyStrategyInput, strategy: SatietyStrategy) {
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

  const parsed = await generateGeminiJson<SatietyAiResult>({
    parts: [{ text: `${system}\n\nData:\n${JSON.stringify(payload, null, 2)}` }],
    responseSchema: RESPONSE_SCHEMA,
    emptyResponseMessage: "Gemini returned no satiety summary",
  });

  return {
    summary: String(parsed.summary ?? ""),
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
  };
}
