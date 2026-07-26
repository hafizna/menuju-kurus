import { NextResponse } from "next/server";
import { getDayLog, getSettings, summarizeDay, computeStreak } from "@/lib/day";
import { lastNDateKeys } from "@/lib/dates";

export async function GET() {
  const settings = await getSettings();
  const dateKeys = lastNDateKeys(14, settings.timezone);

  const days = await Promise.all(
    dateKeys.map(async (date) => {
      const log = await getDayLog(date);
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
  const streak = await computeStreak(settings.timezone, settings.dailyTargetKcal);

  return NextResponse.json({ days, successRate, streak });
}
