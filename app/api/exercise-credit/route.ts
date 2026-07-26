import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/day";
import { suggestExerciseForCalories } from "@/lib/exercise";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const extraKcal = Number(searchParams.get("extraKcal") || 0);
  if (!Number.isFinite(extraKcal) || extraKcal <= 0) {
    return NextResponse.json({ suggestions: [] });
  }
  const settings = await getSettings(userId);
  const suggestions = suggestExerciseForCalories(extraKcal, settings.weightKg);
  return NextResponse.json({ suggestions, extraKcal });
}
