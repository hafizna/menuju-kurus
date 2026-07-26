import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey, localHour } from "@/lib/dates";
import { suggestPlanForWakeHour } from "@/lib/plan";

export async function GET() {
  const settings = await getSettings();
  const now = new Date();
  const hour = localHour(now, settings.timezone);
  const suggestion = suggestPlanForWakeHour(hour);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(date);
  return NextResponse.json({ suggestion, currentHour: hour, log });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || (body.plan !== "if" && body.plan !== "deficit")) {
    return NextResponse.json({ error: "plan must be 'if' or 'deficit'" }, { status: 400 });
  }

  const settings = await getSettings();
  const date = todayKey(settings.timezone);
  const log = await getDayLog(date);
  const wakeTime = new Date().toISOString();

  log.wakeTime = wakeTime;
  log.plan = body.plan;
  if (body.plan === "if") {
    log.eatingWindowStart = wakeTime;
    log.eatingWindowHours = settings.ifWindowHours;
  } else {
    log.eatingWindowStart = undefined;
    log.eatingWindowHours = undefined;
  }

  await saveDayLog(log);
  return NextResponse.json({ log });
}
