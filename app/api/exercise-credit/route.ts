import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/day";
import { suggestExerciseForCalories } from "@/lib/exercise";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const extraKcal = Number(searchParams.get("extraKcal") || 0);
  if (!Number.isFinite(extraKcal) || extraKcal <= 0) {
    return NextResponse.json({ suggestions: [] });
  }
  const settings = await getSettings();
  const suggestions = suggestExerciseForCalories(extraKcal, settings.weightKg);
  return NextResponse.json({ suggestions, extraKcal });
}
