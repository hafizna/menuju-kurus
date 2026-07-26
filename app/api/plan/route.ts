import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey, localHour } from "@/lib/dates";
import { suggestPlanForWakeHour } from "@/lib/plan";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);

  const now = new Date();
  const defaultWakeTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const suggestion = log.wakeTime
    ? suggestPlanForWakeHour(localHour(new Date(log.wakeTime), settings.timezone))
    : null;

  return NextResponse.json({ log, suggestion, defaultWakeTime });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || (body.plan !== "if" && body.plan !== "deficit")) {
    return NextResponse.json({ error: "plan must be 'if' or 'deficit'" }, { status: 400 });
  }

  const settings = await getSettings(userId);
  const date = todayKey(settings.timezone);
  const log = await getDayLog(userId, date);

  if (!log.wakeTime) {
    log.wakeTime = new Date().toISOString();
  }
  log.plan = body.plan;
  if (body.plan === "if") {
    log.eatingWindowStart = log.wakeTime;
    log.eatingWindowHours = settings.ifWindowHours;
  } else {
    log.eatingWindowStart = undefined;
    log.eatingWindowHours = undefined;
  }

  await saveDayLog(userId, log);
  return NextResponse.json({ log });
}
