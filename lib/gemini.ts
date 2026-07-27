import { generateGeminiJson } from "./geminiClient";

export interface FoodAnalysis {
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote: string;
  confidence: "low" | "medium" | "high";
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    foodName: { type: "STRING" },
    calories: { type: "NUMBER" },
    protein_g: { type: "NUMBER" },
    carbs_g: { type: "NUMBER" },
    fat_g: { type: "NUMBER" },
    portionNote: { type: "STRING" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
  },
  required: ["foodName", "calories", "protein_g", "carbs_g", "fat_g", "portionNote", "confidence"],
};

const PROMPT = `You are a nutrition estimation assistant. Look at the photo of food/drink and
estimate its nutrition for the portion shown. Be a realistic home-cook/restaurant estimator,
not overly conservative. If multiple items are visible, sum them into one combined estimate
and describe them in foodName. Respond only with the requested JSON fields:
- foodName: short name of the food/dish (in Indonesian if the food is a local dish)
- calories: total estimated kcal for the visible portion
- protein_g, carbs_g, fat_g: estimated grams
- portionNote: one short phrase describing the portion size you assumed
- confidence: "low" | "medium" | "high" based on how clearly you could identify the food`;

export async function analyzeFoodPhoto(imageBase64: string, mimeType: string): Promise<FoodAnalysis> {
  const parsed = await generateGeminiJson<FoodAnalysis>({
    parts: [
      { text: PROMPT },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    responseSchema: RESPONSE_SCHEMA,
    emptyResponseMessage: "Gemini returned no analysis",
  });

  return {
    foodName: String(parsed.foodName ?? "Makanan tidak dikenali"),
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein_g: Math.max(0, Math.round(Number(parsed.protein_g) || 0)),
    carbs_g: Math.max(0, Math.round(Number(parsed.carbs_g) || 0)),
    fat_g: Math.max(0, Math.round(Number(parsed.fat_g) || 0)),
    portionNote: String(parsed.portionNote ?? ""),
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium",
  };
}
