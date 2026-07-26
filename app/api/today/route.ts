import { NextRequest, NextResponse } from "next/server";
import { getSettings, getLastNDayLogs, summarizeDay, computeStreak, computeWeeklyBudget } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { challengeForDate } from "@/lib/challenges";
import { getUserId } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { computeHealthScore } from "@/lib/healthScore";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);

  const [last7Logs, weightEntries] = await Promise.all([
    getLastNDayLogs(userId, 7, settings.timezone),
    getWeightEntries(userId),
  ]);
  const log = last7Logs[last7Logs.length - 1]; // today is the last entry (oldest -> newest)

  const summary = summarizeDay(log, settings.dailyTargetKcal);
  const streak = await computeStreak(userId, settings.timezone, settings.dailyTargetKcal);
  const challenge = challengeForDate(date, userId);
  const weeklyBudget = computeWeeklyBudget(last7Logs, settings.dailyTargetKcal);
  const weightTrend = computeWeightTrend(weightEntries, settings.timezone);
  const proteinToday = log.meals.reduce((s, m) => s + m.protein_g, 0);
  const healthScore = computeHealthScore({
    summary,
    proteinG: proteinToday,
    proteinTargetG: settings.proteinTargetG,
    weightTrend,
    last7Logs,
  });

  return NextResponse.json({
    date,
    log,
    summary,
    settings,
    streak,
    challenge,
    userName: getUserById(userId)?.name ?? "",
    weeklyBudget,
    weightTrend,
    proteinToday,
    healthScore,
  });
}
