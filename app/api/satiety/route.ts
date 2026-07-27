import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getSettings, getLastNDayLogs, summarizeDay } from "@/lib/day";
import { buildSatietyStrategy, type HungerIntent, type NutritionObjective } from "@/lib/satiety";
import { generateSatietySummary } from "@/lib/geminiSatiety";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const settings = await getSettings(userId);
  const logs = await getLastNDayLogs(userId, 1, settings.timezone);
  const log = logs[0];
  const summary = summarizeDay(log, settings.dailyTargetKcal);
  const proteinToday = log.meals.reduce((sum, meal) => sum + meal.protein_g, 0);

  const validIntents: HungerIntent[] = ["hungry", "sweet", "savory", "crispy", "comfort", "quick"];
  const validObjectives: NutritionObjective[] = ["high_volume", "high_protein", "high_fiber", "low_calorie", "vegetarian"];
  const intent = validIntents.includes(body.intent) ? body.intent : "hungry";
  const objectives = Array.isArray(body.objectives)
    ? body.objectives.filter((value: unknown): value is NutritionObjective => validObjectives.includes(value as NutritionObjective))
    : ["high_volume", "high_protein"];
  const pantry = typeof body.pantry === "string"
    ? body.pantry.split(/[,\n]/).map((item: string) => item.trim()).filter(Boolean).slice(0, 20)
    : [];

  const input = {
    remainingCalories: Math.max(0, summary.remaining),
    remainingProteinG: Math.max(0, settings.proteinTargetG - proteinToday),
    goal: settings.fitnessGoal,
    intent,
    objectives,
    pantry,
  };
  const strategy = buildSatietyStrategy(input);

  if (!body.withAi) return NextResponse.json({ input, strategy, ai: null });

  try {
    const ai = await generateSatietySummary(input, strategy);
    return NextResponse.json({ input, strategy, ai });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat penjelasan AI";
    return NextResponse.json({ input, strategy, ai: null, aiError: message });
  }
}
