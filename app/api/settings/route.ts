import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/day";
import { DEFAULT_SETTINGS, type FitnessGoal } from "@/lib/types";
import { getUserId } from "@/lib/session";

const GOALS: FitnessGoal[] = ["weight_loss", "very_lean", "athletic", "muscle_gain"];

function nullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getSettings(userId) });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const weightKg = Math.max(30, Number(body.weightKg) || DEFAULT_SETTINGS.weightKg);
  const rawGoal = String(body.fitnessGoal ?? DEFAULT_SETTINGS.fitnessGoal) as FitnessGoal;
  const fitnessGoal = GOALS.includes(rawGoal) ? rawGoal : DEFAULT_SETTINGS.fitnessGoal;

  const settings = {
    dailyTargetKcal: Math.max(800, Math.round(Number(body.dailyTargetKcal) || DEFAULT_SETTINGS.dailyTargetKcal)),
    weightKg,
    goalWeightKg: Math.max(30, Number(body.goalWeightKg) || DEFAULT_SETTINGS.goalWeightKg),
    ifWindowHours: Math.min(16, Math.max(4, Number(body.ifWindowHours) || DEFAULT_SETTINGS.ifWindowHours)),
    timezone: typeof body.timezone === "string" && body.timezone ? body.timezone : DEFAULT_SETTINGS.timezone,
    proteinTargetG: Math.max(20, Math.round(Number(body.proteinTargetG) || DEFAULT_SETTINGS.proteinTargetG)),
    fitnessGoal,
    targetBodyFatPercent: nullableNumber(body.targetBodyFatPercent, 5, 60),
    vo2Max: nullableNumber(body.vo2Max, 10, 90),
    restingHeartRate: nullableNumber(body.restingHeartRate, 30, 140),
    cardioMinutesWeekly: Math.min(1000, Math.max(0, Math.round(Number(body.cardioMinutesWeekly) || 0))),
    strengthDaysWeekly: Math.min(7, Math.max(0, Math.round(Number(body.strengthDaysWeekly) || 0))),
  };

  await saveSettings(userId, settings);
  return NextResponse.json({ settings });
}
