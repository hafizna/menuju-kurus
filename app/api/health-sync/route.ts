import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";

// Called by an Apple Shortcuts personal automation (see README) that reads
// "Active Energy Burned" from the Health app and POSTs the day's running
// total here. We upsert a single "shortcuts" burn entry per day instead of
// appending, since Shortcuts may fire more than once a day with a new total.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const expected = process.env.HEALTH_SYNC_TOKEN;

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const calories = Math.max(0, Math.round(Number(body?.calories) || 0));
  if (!body || calories <= 0) {
    return NextResponse.json({ error: "calories (number > 0) required" }, { status: 400 });
  }

  const settings = await getSettings();
  const date: string = typeof body.date === "string" ? body.date : todayKey(settings.timezone);
  const log = await getDayLog(date);

  const existing = log.burns.find((b) => b.source === "shortcuts");
  if (existing) {
    existing.calories = calories;
    existing.time = new Date().toISOString();
  } else {
    log.burns.push({
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      calories,
      label: "Active Energy (Apple Health)",
      source: "shortcuts",
    });
  }

  await saveDayLog(log);
  return NextResponse.json({ ok: true, log });
}
