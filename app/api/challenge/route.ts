import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { challengeForDate } from "@/lib/challenges";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);
  const challenge = challengeForDate(date, userId);
  return NextResponse.json({ challenge, done: !!log.challengeDone });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);
  const challenge = challengeForDate(date, userId);

  log.challengeId = challenge.id;
  log.challengeDone = !!body.done;
  await saveDayLog(userId, log);
  return NextResponse.json({ challenge, done: log.challengeDone });
}
