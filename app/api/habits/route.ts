import { NextRequest, NextResponse } from "next/server";
import { getLastNDayLogs, getSettings } from "@/lib/day";
import { buildHabitStrategy } from "@/lib/habits";
import { getUserId } from "@/lib/session";
import { todayKey } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const logs = await getLastNDayLogs(userId, 28, settings.timezone);
  return NextResponse.json({ strategy: buildHabitStrategy(logs, settings), date: todayKey(settings.timezone), timezone: settings.timezone });
}
