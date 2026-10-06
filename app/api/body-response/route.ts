import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getSettings, getDayLog } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { getWeightEntries } from "@/lib/weight";
import { getBodyCheckIns } from "@/lib/bodyStore";
import { mergeBodySnapshots } from "@/lib/body";
import {
  RESPONSE_PERIODS,
  calendarDates,
  buildBodyResponse,
  type ResponsePeriod,
} from "@/lib/bodyResponse";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("days") ?? "28";
  if (!RESPONSE_PERIODS.some((days) => String(days) === raw))
    return NextResponse.json(
      { error: "days must be 14, 28, or 56" },
      { status: 400 },
    );
  const period = Number(raw) as ResponsePeriod;
  const settings = await getSettings(userId);
  const today = todayKey(settings.timezone);
  const dates = calendarDates(today, period * 2);
  const [logs, weights, checkIns] = await Promise.all([
    Promise.all(dates.map((date) => getDayLog(userId, date))),
    getWeightEntries(userId),
    getBodyCheckIns(userId),
  ]);
  return NextResponse.json(
    buildBodyResponse(
      today,
      period,
      logs,
      mergeBodySnapshots(weights, checkIns),
    ),
  );
}
