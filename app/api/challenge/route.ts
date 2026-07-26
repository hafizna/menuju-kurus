import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { challengeForDate } from "@/lib/challenges";

export async function GET() {
  const settings = await getSettings();
  const date = todayKey(settings.timezone);
  const log = await getDayLog(date);
  const challenge = challengeForDate(date);
  return NextResponse.json({ challenge, done: !!log.challengeDone });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const date = todayKey(settings.timezone);
  const log = await getDayLog(date);
  const challenge = challengeForDate(date);

  log.challengeId = challenge.id;
  log.challengeDone = !!body.done;
  await saveDayLog(log);
  return NextResponse.json({ challenge, done: log.challengeDone });
}
