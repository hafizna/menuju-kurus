import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getSettings, getLastNDayLogs, summarizeDay } from "@/lib/day";
import { buildRestaurantStrategy, type RestaurantCategory } from "@/lib/restaurant";

const VALID_CATEGORIES: RestaurantCategory[] = [
  "all",
  "warteg",
  "padang",
  "ayam",
  "bakso_mie",
  "soto",
  "fast_food",
  "cafe",
];

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const settings = await getSettings(userId);
  const logs = await getLastNDayLogs(userId, 1, settings.timezone);
  const log = logs[0];
  const summary = summarizeDay(log, settings.dailyTargetKcal);
  const proteinToday = log.meals.reduce((sum, meal) => sum + meal.protein_g, 0);

  const category = VALID_CATEGORIES.includes(body.category) ? body.category : "all";
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
  const input = {
    remainingCalories: Math.max(0, summary.remaining),
    remainingProteinG: Math.max(0, settings.proteinTargetG - proteinToday),
    goal: settings.fitnessGoal,
    category,
    query,
  };

  return NextResponse.json({ input, strategy: buildRestaurantStrategy(input) });
}
