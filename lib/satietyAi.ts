import type { SatietyStrategy, SatietyStrategyInput } from "./satiety";
import { generateDeepseekJson } from "./deepseekClient";

interface SatietyAiResult {
  summary: string;
  suggestions: string[];
  source: "ai" | "template";
}

const JSON_SHAPE_HINT = `{"summary": "string", "suggestions": ["string", "string", "string"]}`;

// Zero-cost fallback for when DEEPSEEK_API_KEY isn't configured. The
// underlying engine (lib/satiety.ts) already computes a deterministic
// `message` and ranked food list with a `why` for each — this just turns
// the top 3 into readable lines instead of calling any model.
const GENERIC_SATIETY_SUGGESTIONS = [
  "Sesuaikan porsi dengan rasa lapar sebenarnya, bukan cuma sisa budget kalori.",
  "Tambahkan bahan di kolom pantry biar rekomendasi lebih sesuai yang ada di rumah.",
  "Coba ubah filter objective kalau pilihan di atas belum pas seleranya.",
];

function templateSatietySummary(strategy: SatietyStrategy): SatietyAiResult {
  const top = strategy.recommendations.slice(0, 3);
  const suggestions = top.map((food) => `${food.name} (${food.calories} kcal, ${food.proteinG} g protein) — ${food.why}`);
  for (const generic of GENERIC_SATIETY_SUGGESTIONS) {
    if (suggestions.length >= 3) break;
    suggestions.push(generic);
  }
  return { summary: strategy.message, suggestions, source: "template" };
}

export async function generateSatietySummary(input: SatietyStrategyInput, strategy: SatietyStrategy): Promise<SatietyAiResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return templateSatietySummary(strategy);
  }

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

  const parsed = await generateDeepseekJson<Omit<SatietyAiResult, "source">>({
    systemPrompt: system,
    userContent: `Data:\n${JSON.stringify(payload, null, 2)}`,
    jsonShapeHint: JSON_SHAPE_HINT,
    emptyResponseMessage: "DeepSeek returned no satiety summary",
  });

  return {
    summary: String(parsed.summary ?? ""),
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
    source: "ai",
  };
}
