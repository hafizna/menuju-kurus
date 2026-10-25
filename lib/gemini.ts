import { generateGeminiJson } from "./geminiClient";

export type ComponentRole = "staple" | "oil_sauce" | "other";

export interface FoodComponent {
  name: string;
  role: ComponentRole;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodAnalysis {
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote: string;
  confidence: "low" | "medium" | "high";
  components: FoodComponent[];
  kcalLow: number;
  kcalHigh: number;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    foodName: { type: "STRING" },
    portionNote: { type: "STRING" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    kcalLow: { type: "NUMBER" },
    kcalHigh: { type: "NUMBER" },
    components: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          role: { type: "STRING", enum: ["staple", "oil_sauce", "other"] },
          grams: { type: "NUMBER" },
          calories: { type: "NUMBER" },
          protein_g: { type: "NUMBER" },
          carbs_g: { type: "NUMBER" },
          fat_g: { type: "NUMBER" },
        },
        required: ["name", "role", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
      },
    },
  },
  required: ["foodName", "portionNote", "confidence", "kcalLow", "kcalHigh", "components"],
};

// Anchors so estimates stay consistent from photo to photo instead of being
// guessed from scratch. Typical warung/home portions of cooked food, in kcal;
// approximate on purpose. Scale up or down for the portion actually shown.
export const LOCAL_PORTION_REFERENCE = `- nasi putih 1 centong (about 100 g): 130
- telur dadar warteg 1 butir (oily): 160-200; telur ceplok/mata sapi: 110-130
- terong balado 1 portion: 130-180; sambal balado/terasi 1 tbsp: 30-40
- tempe goreng 2 pieces: 150; tahu goreng 2 pieces: 120
- ayam goreng paha with skin: 250-300; ayam goreng dada: 200-250
- ikan goreng medium: 180-250; ikan teri/ikan kecil goreng 1 portion: 100-150
- sayur bening/sop 1 small bowl: 40-70; tumis kangkung/sayur tumis 1 portion: 70-100
- gorengan (bakwan, tahu isi, pisang goreng) 1 piece: 120-150
- lauk berkuah santan (gulai, opor, rendang) 1 portion: 250-350
- teh manis 1 glass: 110; kopi susu 1 glass: 180`;

export function buildFoodPrompt(): string {
  return `You are a nutrition estimation assistant for Indonesian users. Look at the photo of
food/drink and estimate its nutrition for the portion shown.

Estimate realistically, the way an Indonesian warung/restaurant or home cook actually prepares food.
Do NOT give a minimum or best-case number: include cooking oil absorbed by fried food, coconut milk
(santan), sambal and sauces, sugar in drinks, and typical warung rice portions (warung plates often
hold 1.5-2 centong of rice).

Reference values for typical portions (kcal, approximate; scale to the portion in the photo):
${LOCAL_PORTION_REFERENCE}

Break the meal into components (max 8). For each give name (Indonesian), role, grams (edible weight,
best guess), calories and macros:
- role "staple": the main carbohydrate base (nasi, mie, lontong, roti). Use at most ONE staple component.
- role "oil_sauce": oil, santan, balado/sambal, dressing or sauce that adds noticeable calories on top
  of the ingredients. Only include it when it is visibly significant.
- role "other": everything else (protein, vegetables, fruit, drinks, snacks).
Also give foodName (short dish name), portionNote (one short phrase), confidence
("low" | "medium" | "high" by how clearly you could identify the food), and kcalLow / kcalHigh: the
realistic range of total kcal for this portion (the true value should usually fall inside).
Respond only with the requested JSON fields.`;
}

interface RawComponent {
  name?: unknown;
  role?: unknown;
  grams?: unknown;
  calories?: unknown;
  protein_g?: unknown;
  carbs_g?: unknown;
  fat_g?: unknown;
}
interface RawAnalysis {
  foodName?: unknown;
  portionNote?: unknown;
  confidence?: unknown;
  kcalLow?: unknown;
  kcalHigh?: unknown;
  components?: unknown;
  calories?: unknown;
  protein_g?: unknown;
  carbs_g?: unknown;
  fat_g?: unknown;
}

const whole = (value: unknown): number => Math.max(0, Math.round(Number(value) || 0));

// Totals always equal the sum of the components, so the numbers shown to the
// user and the numbers saved can never disagree with the breakdown.
export function normalizeFoodAnalysis(parsed: RawAnalysis): FoodAnalysis {
  let seenStaple = false;
  const components: FoodComponent[] = (Array.isArray(parsed.components) ? (parsed.components as RawComponent[]) : [])
    .slice(0, 8)
    .map((c) => {
      let role: ComponentRole = c?.role === "staple" || c?.role === "oil_sauce" ? c.role : "other";
      if (role === "staple") {
        if (seenStaple) role = "other";
        seenStaple = true;
      }
      return {
        name: String(c?.name ?? "").trim().slice(0, 60) || "Komponen",
        role,
        grams: Math.min(2000, whole(c?.grams)),
        calories: whole(c?.calories),
        protein_g: whole(c?.protein_g),
        carbs_g: whole(c?.carbs_g),
        fat_g: whole(c?.fat_g),
      };
    })
    .filter((c) => c.calories > 0);

  const sum = (key: "calories" | "protein_g" | "carbs_g" | "fat_g") => components.reduce((total, c) => total + c[key], 0);
  const calories = components.length ? sum("calories") : whole(parsed.calories);

  let kcalLow = whole(parsed.kcalLow);
  let kcalHigh = whole(parsed.kcalHigh);
  // Untrustworthy or missing range: fall back to a skewed-up band, since
  // under-estimation of local food is the common failure.
  if (kcalLow <= 0 || kcalHigh <= 0 || kcalLow > calories || kcalHigh < calories) {
    kcalLow = Math.round(calories * 0.8);
    kcalHigh = Math.round(calories * 1.3);
  }

  const confidence = parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
    ? parsed.confidence
    : "medium";

  return {
    foodName: String(parsed.foodName ?? "").trim() || "Makanan tidak dikenali",
    calories,
    protein_g: components.length ? sum("protein_g") : whole(parsed.protein_g),
    carbs_g: components.length ? sum("carbs_g") : whole(parsed.carbs_g),
    fat_g: components.length ? sum("fat_g") : whole(parsed.fat_g),
    portionNote: String(parsed.portionNote ?? ""),
    confidence,
    components,
    kcalLow,
    kcalHigh,
  };
}

export async function analyzeFoodPhoto(imageBase64: string, mimeType: string): Promise<FoodAnalysis> {
  const parsed = await generateGeminiJson<RawAnalysis>({
    parts: [
      { text: buildFoodPrompt() },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    responseSchema: RESPONSE_SCHEMA,
    emptyResponseMessage: "Gemini returned no analysis",
  });
  return normalizeFoodAnalysis(parsed);
}
