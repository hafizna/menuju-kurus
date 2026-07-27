import type { FitnessGoal } from "./types";

export type HungerIntent = "hungry" | "sweet" | "savory" | "crispy" | "comfort" | "quick";
export type NutritionObjective = "high_volume" | "high_protein" | "high_fiber" | "low_calorie" | "vegetarian";

export interface SatietyFood {
  id: string;
  name: string;
  serving: string;
  calories: number;
  proteinG: number;
  fiberG: number;
  volume: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  why: string;
}

export interface SatietyStrategyInput {
  remainingCalories: number;
  remainingProteinG: number;
  goal: FitnessGoal;
  intent: HungerIntent;
  objectives: NutritionObjective[];
  pantry?: string[];
}

export interface SatietyRecommendation extends SatietyFood {
  fullnessScore: number;
  fitScore: number;
}

export interface SatietyStrategy {
  mealCalorieBudget: number;
  proteinTargetG: number;
  message: string;
  recommendations: SatietyRecommendation[];
  dataNote: string;
}

export const SATIETY_FOODS: SatietyFood[] = [
  { id: "cucumber-yogurt", name: "Salad timun dengan dressing yogurt", serving: "1 mangkuk besar", calories: 145, proteinG: 10, fiberG: 3, volume: 5, tags: ["savory", "crispy", "quick", "high_volume", "low_calorie", "vegetarian", "timun", "yogurt"], why: "Timun memberi volume dan sensasi renyah, sedangkan yogurt menambah protein dengan kalori relatif rendah." },
  { id: "chicken-salad", name: "Salad ayam tinggi volume", serving: "ayam 120 g + sayuran", calories: 310, proteinG: 38, fiberG: 6, volume: 5, tags: ["savory", "hungry", "high_volume", "high_protein", "low_calorie", "ayam", "sayur"], why: "Kombinasi protein tinggi dan volume sayuran membantu kenyang lebih lama." },
  { id: "boiled-potato", name: "Kentang rebus + yogurt dip", serving: "250 g kentang", calories: 260, proteinG: 10, fiberG: 5, volume: 5, tags: ["savory", "comfort", "hungry", "high_volume", "high_fiber", "vegetarian", "kentang", "yogurt"], why: "Kentang rebus memberi volume dan tekstur mengenyangkan tanpa minyak goreng tambahan." },
  { id: "greek-yogurt-fruit", name: "Greek yogurt dan buah", serving: "200 g yogurt + buah", calories: 220, proteinG: 20, fiberG: 4, volume: 4, tags: ["sweet", "quick", "high_protein", "low_calorie", "vegetarian", "yogurt", "buah"], why: "Protein yogurt membantu menahan lapar, sementara buah memberi rasa manis dan volume." },
  { id: "egg-veg-soup", name: "Sup telur dan sayuran", serving: "1 mangkuk besar", calories: 240, proteinG: 19, fiberG: 5, volume: 5, tags: ["savory", "comfort", "hungry", "high_volume", "low_calorie", "telur", "sayur"], why: "Kuah dan sayuran memberi volume besar; telur menambah protein." },
  { id: "tofu-bowl", name: "Tahu, edamame, dan sayuran", serving: "1 bowl", calories: 360, proteinG: 27, fiberG: 9, volume: 4, tags: ["savory", "hungry", "high_protein", "high_fiber", "vegetarian", "tahu", "edamame", "sayur"], why: "Protein nabati dan serat membuat makanan lebih padat nutrisi dan mengenyangkan." },
  { id: "air-popcorn", name: "Popcorn tanpa butter", serving: "5 cangkir", calories: 155, proteinG: 5, fiberG: 6, volume: 5, tags: ["savory", "crispy", "quick", "high_volume", "high_fiber", "low_calorie", "vegetarian", "popcorn"], why: "Volumenya besar untuk kalori yang relatif rendah dan cocok saat ingin terus mengunyah." },
  { id: "oat-egg", name: "Oat gurih dengan telur", serving: "1 mangkuk", calories: 330, proteinG: 22, fiberG: 7, volume: 4, tags: ["savory", "comfort", "hungry", "high_fiber", "vegetarian", "oat", "telur"], why: "Oat memberi serat dan telur menambah protein sehingga lebih tahan lama." },
  { id: "watermelon-yogurt", name: "Semangka dan yogurt", serving: "1 mangkuk besar", calories: 180, proteinG: 12, fiberG: 2, volume: 5, tags: ["sweet", "quick", "high_volume", "low_calorie", "vegetarian", "semangka", "yogurt"], why: "Semangka memberi volume dan rasa manis, sedangkan yogurt mengurangi kemungkinan cepat lapar lagi." },
  { id: "chicken-rice-bowl", name: "Chicken rice bowl porsi terukur", serving: "ayam 120 g + nasi 100 g + sayuran", calories: 480, proteinG: 39, fiberG: 5, volume: 4, tags: ["savory", "comfort", "hungry", "high_protein", "ayam", "nasi", "sayur"], why: "Porsi protein dominan dengan nasi terukur memberi rasa puas tanpa menghabiskan budget secara tidak terkendali." },
];

function fullness(food: SatietyFood): number {
  const protein = Math.min(2, food.proteinG / 15);
  const fiber = Math.min(1.5, food.fiberG / 5);
  const density = food.calories <= 250 ? 1 : food.calories <= 400 ? 0.5 : 0;
  return Math.max(1, Math.min(5, Math.round(food.volume * 0.45 + protein + fiber + density)));
}

export function buildSatietyStrategy(input: SatietyStrategyInput): SatietyStrategy {
  const remaining = Math.max(0, Math.round(input.remainingCalories));
  const mealCalorieBudget = Math.max(100, Math.min(remaining || 250, remaining > 700 ? 550 : remaining));
  const proteinTargetG = Math.max(0, Math.min(Math.round(input.remainingProteinG), input.goal === "muscle_gain" ? 45 : 35));
  const pantry = (input.pantry ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);

  const scored = SATIETY_FOODS.map((food) => {
    let fitScore = 0;
    if (food.calories <= mealCalorieBudget) fitScore += 5;
    else fitScore -= Math.min(5, (food.calories - mealCalorieBudget) / 50);
    if (food.tags.includes(input.intent)) fitScore += 3;
    fitScore += input.objectives.filter((o) => food.tags.includes(o)).length * 2;
    if (proteinTargetG > 0) fitScore += Math.min(3, food.proteinG / Math.max(10, proteinTargetG / 2));
    if (input.goal === "athletic" && food.calories >= 250) fitScore += 1;
    if ((input.goal === "very_lean" || input.goal === "weight_loss") && food.calories <= 350) fitScore += 1;
    if (input.goal === "muscle_gain" && food.proteinG >= 25) fitScore += 2;
    if (pantry.length) {
      const matches = pantry.filter((item) => food.tags.some((tag) => tag.includes(item) || item.includes(tag))).length;
      fitScore += matches * 2;
      if (matches === 0) fitScore -= 2;
    }
    return { ...food, fullnessScore: fullness(food), fitScore: Math.round(fitScore * 10) / 10 };
  })
    .sort((a, b) => b.fitScore - a.fitScore || b.fullnessScore - a.fullnessScore)
    .slice(0, 5);

  const message = remaining <= 0
    ? "Budget hari ini sudah habis. Pilih opsi sangat ringan bila benar-benar lapar, lalu kembali ke target normal besok tanpa kompensasi ekstrem."
    : `Gunakan sekitar ${mealCalorieBudget} kcal untuk pilihan yang paling memuaskan, dengan prioritas ${proteinTargetG > 0 ? `hingga ${proteinTargetG} g protein` : "volume dan serat"}.`;

  return {
    mealCalorieBudget,
    proteinTargetG,
    message,
    recommendations: scored,
    dataNote: "Fullness Score adalah heuristik berbasis protein, serat, volume, dan kepadatan energi—bukan pengukuran klinis.",
  };
}
