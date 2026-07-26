import { NextRequest, NextResponse } from "next/server";
import { getSettings, getLastNDayLogs } from "@/lib/day";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { computeWeeklyReview, FLAG_LABELS } from "@/lib/weeklyReview";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const [last7Logs, weightEntries] = await Promise.all([
    getLastNDayLogs(userId, 7, settings.timezone),
    getWeightEntries(userId),
  ]);
  const weightTrend = computeWeightTrend(weightEntries, settings.timezone);
  const review = computeWeeklyReview(last7Logs, weightEntries, settings, weightTrend);
  const flags = review.recommendationFlags.map((id) => ({ id, label: FLAG_LABELS[id] ?? id }));

  return NextResponse.json({ review, weightTrend, flags });
}
