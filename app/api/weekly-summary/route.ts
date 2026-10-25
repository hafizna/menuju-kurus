import { NextRequest, NextResponse } from "next/server";
import { getSettings, getLastNDayLogs } from "@/lib/day";
import { getWeightEntries, computeWeightTrend } from "@/lib/weight";
import { generateWeeklySummary } from "@/lib/weeklySummaryAi";
import { weeklySummaryContext, weeklySummaryIsStale, type StoredWeeklySummary } from "@/lib/weeklySummary";
import { getUserId } from "@/lib/session";
import { redis, keys } from "@/lib/redis";

export const maxDuration = 30;
const summaryKey = (userId: string) => keys.weeklySummary(userId) + ":intake-v3";

async function currentContext(userId: string) {
  const settings = await getSettings(userId);
  const [logs, weights] = await Promise.all([
    getLastNDayLogs(userId, 7, settings.timezone), getWeightEntries(userId),
  ]);
  return weeklySummaryContext(logs, weights, settings, computeWeightTrend(weights, settings.timezone));
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [summary, context] = await Promise.all([
    redis.get<StoredWeeklySummary>(summaryKey(userId)), currentContext(userId),
  ]);
  return NextResponse.json({
    summary: summary ?? null,
    stale: summary ? weeklySummaryIsStale(summary, context) : false,
    periodStart: context.periodStart, periodEnd: context.periodEnd,
  });
}

// Only called when the user explicitly taps "Buat Ringkasan AI" — never on
// page load — so a DeepSeek call happens once per user action, not per visit.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await currentContext(userId);

  try {
    const result = await generateWeeklySummary(context.input);
    const summary: StoredWeeklySummary = {
      ...result, generatedAt: new Date().toISOString(),
      periodStart: context.periodStart, periodEnd: context.periodEnd,
      fingerprint: context.fingerprint,
    };
    await redis.set(summaryKey(userId), summary);
    // Edits can arrive while generation is in flight; retain the true basis.
    const latest = await currentContext(userId);
    return NextResponse.json({ summary, input: context.input, stale: weeklySummaryIsStale(summary, latest) });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Ringkasan AI sedang tidak tersedia. Coba lagi nanti." },
      { status: 502 },
    );
  }
}
