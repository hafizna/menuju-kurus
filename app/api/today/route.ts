import { NextRequest, NextResponse } from "next/server";
import { getDayLog, getSettings, summarizeDay, computeStreak } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { challengeForDate } from "@/lib/challenges";
import { getUserId } from "@/lib/session";
import { getUserById } from "@/lib/users";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);
  const summary = summarizeDay(log, settings.dailyTargetKcal);
  const streak = await computeStreak(userId, settings.timezone, settings.dailyTargetKcal);
  const challenge = challengeForDate(date, userId);

  return NextResponse.json({
    date,
    log,
    summary,
    settings,
    streak,
    challenge,
    userName: getUserById(userId)?.name ?? "",
  });
}
