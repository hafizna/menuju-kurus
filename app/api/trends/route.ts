import { NextRequest, NextResponse } from "next/server";
import { getDayLog, getSettings, summarizeDay, computeStreak } from "@/lib/day";
import { lastNDateKeys } from "@/lib/dates";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const dateKeys = lastNDateKeys(14, settings.timezone);

  const days = await Promise.all(
    dateKeys.map(async (date) => {
      const log = await getDayLog(userId, date);
      const summary = summarizeDay(log, settings.dailyTargetKcal);
      return {
        date,
        caloriesIn: summary.caloriesIn,
        caloriesOut: summary.caloriesOut,
        net: summary.net,
        target: summary.target,
        onTrack: summary.onTrack,
        hasData: log.meals.length > 0,
        plan: log.plan,
        challengeDone: !!log.challengeDone,
      };
    })
  );

  const daysWithData = days.filter((d) => d.hasData);
  const successDays = daysWithData.filter((d) => d.onTrack).length;
  const successRate = daysWithData.length > 0 ? Math.round((successDays / daysWithData.length) * 100) : 0;
  const streak = await computeStreak(userId, settings.timezone, settings.dailyTargetKcal);

  return NextResponse.json({ days, successRate, streak });
}
