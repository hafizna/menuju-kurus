import { NextResponse } from "next/server";
import { getDayLog, getSettings, summarizeDay, computeStreak } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { challengeForDate } from "@/lib/challenges";

export async function GET() {
  const settings = await getSettings();
  const date = todayKey(settings.timezone);
  const log = await getDayLog(date);
  const summary = summarizeDay(log, settings.dailyTargetKcal);
  const streak = await computeStreak(settings.timezone, settings.dailyTargetKcal);
  const challenge = challengeForDate(date);

  return NextResponse.json({
    date,
    log,
    summary,
    settings,
    streak,
    challenge,
  });
}
