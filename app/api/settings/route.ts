import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/day";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const weightKg = Math.max(30, Number(body.weightKg) || DEFAULT_SETTINGS.weightKg);
  const goalWeightKg = Math.min(
    weightKg,
    Math.max(30, Number(body.goalWeightKg) || DEFAULT_SETTINGS.goalWeightKg)
  );
  const settings = {
    dailyTargetKcal: Math.max(800, Math.round(Number(body.dailyTargetKcal) || DEFAULT_SETTINGS.dailyTargetKcal)),
    weightKg,
    goalWeightKg,
    ifWindowHours: Math.min(16, Math.max(4, Number(body.ifWindowHours) || DEFAULT_SETTINGS.ifWindowHours)),
    timezone: typeof body.timezone === "string" && body.timezone ? body.timezone : DEFAULT_SETTINGS.timezone,
    proteinTargetG: Math.max(20, Math.round(Number(body.proteinTargetG) || DEFAULT_SETTINGS.proteinTargetG)),
  };
  await saveSettings(userId, settings);
  return NextResponse.json({ settings });
}
