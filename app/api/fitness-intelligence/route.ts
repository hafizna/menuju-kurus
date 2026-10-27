import { getBodyCheckIns } from "@/lib/bodyStore";
import { mergeBodySnapshots, latestReading } from "@/lib/body";
import { NextRequest, NextResponse } from "next/server";
import { getDayLog, getSettings } from "@/lib/day";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { computeFitnessIntelligence } from "@/lib/fitnessIntelligence";
import { generateFitnessSummary } from "@/lib/fitnessSummaryAi";
import { getUserId } from "@/lib/session";
import { getFitnessMeasurements } from "@/lib/fitnessMeasurements";
import { getFitnessHistory } from "@/lib/fitnessHistory";
import { buildFitnessTrends } from "@/lib/fitnessTrends";
import { lastNDateKeys, todayKey } from "@/lib/dates";
import { summarizeLoggedActivity } from "@/lib/activity";

export const maxDuration = 30;

async function buildIntelligence(userId: string) {
  const settings = await getSettings(userId);
  const [entries, checkIns, fitnessMeasurements, history] = await Promise.all([
    getWeightEntries(userId),
    getBodyCheckIns(userId),
    getFitnessMeasurements(userId),
    getFitnessHistory(userId),
  ]);
  const snapshots = mergeBodySnapshots(entries, checkIns);
  const bodyFat = latestReading(snapshots, "bodyFatPercent");
  const trends = buildFitnessTrends({ snapshots, history, today: todayKey(settings.timezone) });
  const trend = computeWeightTrend(entries, settings.timezone);
  // Logged "Gerak hari ini" sessions for the last 7 days, shown next to the
  // routine from Profil; the score itself still reads the Profil routine.
  const logs = await Promise.all(lastNDateKeys(7, settings.timezone).map((date) => getDayLog(userId, date)));
  return {
    settings,
    loggedActivity: summarizeLoggedActivity(logs),
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
      fitnessMeasurements,
      trends,
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
  const { intelligence, loggedActivity } = await buildIntelligence(userId);
  try {
    const ai = await generateFitnessSummary(intelligence);
    return NextResponse.json({ ai, intelligence, loggedActivity });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Recap AI sedang tidak tersedia. Coba lagi nanti." },
      { status: 502 },
    );
  }
}
