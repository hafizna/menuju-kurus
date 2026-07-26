import { NextRequest, NextResponse } from "next/server";
import { getSettings, getLastNDayLogs } from "@/lib/day";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { computeWeeklyReview } from "@/lib/weeklyReview";
import { generateWeeklySummary, WeeklySummaryInput } from "@/lib/geminiSummary";
import { getUserId } from "@/lib/session";
import { redis, keys } from "@/lib/redis";
import { WeeklySummary } from "@/lib/types";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const summary = await redis.get<WeeklySummary>(keys.weeklySummary(userId));
  return NextResponse.json({ summary: summary ?? null });
}

// Only called when the user explicitly taps "Buat Ringkasan AI" — never on
// page load — so a Gemini call happens once per user action, not per visit.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const [last7Logs, weightEntries] = await Promise.all([
    getLastNDayLogs(userId, 7, settings.timezone),
    getWeightEntries(userId),
  ]);
  const weightTrend = computeWeightTrend(weightEntries, settings.timezone);
  const review = computeWeeklyReview(last7Logs, weightEntries, settings, weightTrend);

  const input: WeeklySummaryInput = {
    weightTrend: weightTrend.weeklyRate,
    weeklyCalories: review.avgCalories,
    protein: review.avgProtein,
    exercise: review.exerciseDays,
    successRate: review.successRate,
  };

  try {
    const result = await generateWeeklySummary(input);
    const summary: WeeklySummary = { ...result, generatedAt: new Date().toISOString() };
    await redis.set(keys.weeklySummary(userId), summary);
    return NextResponse.json({ summary, input });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Gagal membuat ringkasan";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
