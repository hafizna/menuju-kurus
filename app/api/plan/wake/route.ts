import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey, zonedTimeToUtcISO } from "@/lib/dates";
import { suggestPlanForWakeHour } from "@/lib/plan";
import { getUserId } from "@/lib/session";

// Records the wake time the user actually reports (not just "whenever they
// opened the app"), so the IF/deficit suggestion and the IF eating-window
// anchor stay accurate even if they check the app well after waking up.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const time: string = typeof body?.time === "string" ? body.time : "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) {
    return NextResponse.json({ error: "time must be in HH:MM format" }, { status: 400 });
  }
  const hour = Math.min(23, parseInt(match[1], 10));
  const minute = Math.min(59, parseInt(match[2], 10));

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);

  const wakeTime = zonedTimeToUtcISO(date, hour, minute, settings.timezone);
  log.wakeTime = wakeTime;
  // Changing the reported wake time should re-anchor an already-chosen IF window too.
  if (log.plan === "if") {
    log.eatingWindowStart = wakeTime;
  }

  await saveDayLog(userId, log);
  const suggestion = suggestPlanForWakeHour(hour);
  return NextResponse.json({ log, suggestion });
}
