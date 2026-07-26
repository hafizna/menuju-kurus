import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/day";
import { DEFAULT_SETTINGS } from "@/lib/types";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = {
    dailyTargetKcal: Math.max(800, Math.round(Number(body.dailyTargetKcal) || DEFAULT_SETTINGS.dailyTargetKcal)),
    weightKg: Math.max(30, Number(body.weightKg) || DEFAULT_SETTINGS.weightKg),
    ifWindowHours: Math.min(16, Math.max(4, Number(body.ifWindowHours) || DEFAULT_SETTINGS.ifWindowHours)),
    timezone: typeof body.timezone === "string" && body.timezone ? body.timezone : DEFAULT_SETTINGS.timezone,
  };
  await saveSettings(settings);
  return NextResponse.json({ settings });
}
