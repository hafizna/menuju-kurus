import { getBodyCheckIns } from "@/lib/bodyStore";
import { mergeBodySnapshots, latestReading } from "@/lib/body";
import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/day";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { computeFitnessIntelligence } from "@/lib/fitnessIntelligence";
import { generateFitnessSummary } from "@/lib/fitnessSummaryAi";
import { getUserId } from "@/lib/session";

export const maxDuration = 30;

async function buildIntelligence(userId: string) {
  const settings = await getSettings(userId);
  const [entries, checkIns] = await Promise.all([
    getWeightEntries(userId),
    getBodyCheckIns(userId),
  ]);
  const bodyFat = latestReading(
    mergeBodySnapshots(entries, checkIns),
    "bodyFatPercent",
  );
  const trend = computeWeightTrend(entries, settings.timezone);
  return {
    settings,
    intelligence: computeFitnessIntelligence(
      settings,
      trend,
      entries,
      bodyFat
        ? {
            value: bodyFat.reading.value,
            date: bodyFat.date,
            source: bodyFat.reading.source,
          }
        : null,
    ),
  };
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await buildIntelligence(userId));
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { intelligence } = await buildIntelligence(userId);
  try {
    const ai = await generateFitnessSummary(intelligence);
    return NextResponse.json({ ai, intelligence });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal membuat recap";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
