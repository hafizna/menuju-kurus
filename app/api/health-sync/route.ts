import { NextRequest, NextResponse } from "next/server";
import { getBodyCheckIns, upsertBodyCheckInResult } from "@/lib/bodyStore";
import { validMeasurementDate, BODY_LABELS } from "@/lib/body";
import { getDayLog, saveDayLog, getSettings, saveSettings } from "@/lib/day";
import { dateKeyFor, todayKey } from "@/lib/dates";
import { findHealthSyncUser, recordHealthSync, recordHealthTest } from "@/lib/healthConnection";
import { getWeightEntries, upsertWeightEntryResult } from "@/lib/weight";
import { upsertFitnessMeasurement } from "@/lib/fitnessMeasurements";
import { recordFitnessHistory } from "@/lib/fitnessHistory";

const METRICS = ["calories", "weightKg", "bodyFatPercent", "vo2Max", "restingHeartRate", "cardioMinutesWeekly"] as const;
type Metric = (typeof METRICS)[number];
type Sample = { metric: Metric; value: number; date: string; measuredAt: string };
const ranges: Record<Metric, [number, number]> = {
  calories: [0, 20000], weightKg: [1, 400],
  bodyFatPercent: [BODY_LABELS.bodyFatPercent.min, BODY_LABELS.bodyFatPercent.max],
  vo2Max: [10, 90], restingHeartRate: [30, 140], cardioMinutesWeekly: [0, 1000],
};
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const failures = {
  connection_invalid: { status: 401, error: "Koneksi belum valid. Sambungkan ulang dari Slothly." },
  request_invalid: { status: 400, error: "Format permintaan belum sesuai. Perbarui Shortcut dari Slothly lalu coba lagi." },
  storage_unavailable: { status: 503, error: "Data belum dapat disimpan. Coba lagi sebentar." },
} as const;
function failure(code: keyof typeof failures) {
  const { status, error } = failures[code];
  return json({ status: "error", code, error }, status);
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const instant = Date.parse(value);
  const calendar = value.slice(0, 10);
  return Number.isFinite(instant) && instant <= Date.now() &&
    validMeasurementDate(calendar, "9999-12-31");
}

// The browser never reads HealthKit. A user-authorized Shortcut sends samples
// with original measurement timestamps to this bearer-authenticated endpoint.
export async function POST(req: NextRequest) {
  try {
    return await receive(req);
  } catch {
    // Storage failures must stay readable by Shortcuts without exposing tokens,
    // measurement values, Redis details, or an upstream exception message.
    return failure("storage_unavailable");
  }
}

async function receive(req: NextRequest) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  const user = token ? await findHealthSyncUser(token) : null;
  if (!user) return failure("connection_invalid");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("request_invalid");
  if (body.provider !== undefined && body.provider !== "apple_health") return failure("request_invalid");
  if (body.test !== undefined) {
    if (body.test !== true || body.samples !== undefined || METRICS.some((metric) => body[metric] !== undefined)) return failure("request_invalid");
    await recordHealthTest(user.id);
    return json({ ok: true, status: "tested", tested: true });
  }

  const settings = await getSettings(user.id);
  const today = todayKey(settings.timezone);
  const samples: Sample[] = [];
  // A provider marks the body as Apple Health data, whether it arrives as a
  // samples array or as flat fields. Without one, the older profile-update
  // behavior below applies.
  const fromHealth = body.samples !== undefined || body.provider === "apple_health";
  if (body.samples !== undefined) {
    if (body.provider !== "apple_health" || !Array.isArray(body.samples) || !body.samples.length || body.samples.length > 200) return failure("request_invalid");
    for (const sample of body.samples) {
      if (!sample || typeof sample !== "object" || Array.isArray(sample) ||
        !["weightKg", "bodyFatPercent", "vo2Max", "restingHeartRate"].includes(sample.metric) ||
        typeof sample.value !== "number" || !Number.isFinite(sample.value) || !validTimestamp(sample.measuredAt)) return failure("request_invalid");
      const metric = sample.metric as Metric;
      const [min, max] = ranges[metric];
      if (sample.value < min || sample.value > max) return failure("request_invalid");
      const measuredAt = new Date(sample.measuredAt).toISOString();
      const date = dateKeyFor(new Date(measuredAt), settings.timezone);
      if (!validMeasurementDate(date, today)) return failure("request_invalid");
      samples.push({ metric, value: sample.value, measuredAt, date });
    }
  } else {
    // A timestamp without a provider would be ignored silently and the data
    // dated "today"; reject it so a Shortcut missing the provider field is caught.
    if (!fromHealth && body.measuredAt !== undefined) return failure("request_invalid");
    let date: unknown = body.date === undefined ? today : body.date;
    let measuredAt = new Date().toISOString();
    if (fromHealth) {
      // Flat form for hand-built Shortcuts: typed fields plus an optional
      // original timestamp, treated like Apple Health samples. The date is
      // derived from the timestamp, so a separate date field is not accepted.
      if (body.date !== undefined) return failure("request_invalid");
      if (body.measuredAt !== undefined) {
        if (!validTimestamp(body.measuredAt)) return failure("request_invalid");
        measuredAt = new Date(body.measuredAt).toISOString();
      }
      date = dateKeyFor(new Date(measuredAt), settings.timezone);
    }
    // Without a provider this keeps installed, environment-token Shortcuts working.
    if (!validMeasurementDate(date, today)) return failure("request_invalid");
    for (const metric of METRICS) {
      if (body[metric] === undefined || body[metric] === null || body[metric] === "") continue;
      const value = parseNumber(body[metric]);
      const [min, max] = ranges[metric];
      if (value === null || value < min || value > max) return failure("request_invalid");
      samples.push({ metric, value, date, measuredAt });
    }
    if (!samples.length) return failure("request_invalid");
  }

  // One reading per metric/day. Collapse a batch to its latest sample before
  // touching storage, so an older sample cannot replace a newer sample in it.
  const latest = new Map<string, Sample>();
  for (const sample of samples) {
    const key = `${sample.date}:${sample.metric}`;
    if (!latest.has(key) || sample.measuredAt >= latest.get(key)!.measuredAt) latest.set(key, sample);
  }
  const accepted: Sample[] = [];
  let ignored = samples.length - latest.size;
  for (const sample of latest.values()) {
    const heightCm = sample.date === today ? settings.heightCm : undefined;
    if (sample.metric === "weightKg") {
      const result = await upsertWeightEntryResult(user.id, { date: sample.date, weightKg: sample.value, source: "shortcuts", heightCm: heightCm ?? undefined, recordedAt: sample.measuredAt });
      if (!result.applied) { ignored++; continue; }
    } else if (sample.metric === "bodyFatPercent") {
      const [checkIns, weights] = await Promise.all([getBodyCheckIns(user.id), getWeightEntries(user.id)]);
      const current = checkIns.find((entry) => entry.date === sample.date)?.bodyFatPercent;
      const legacy = weights.find((entry) => entry.date === sample.date);
      const previousTime = current?.recordedAt ?? (legacy?.bodyFat !== undefined ? legacy.bodyFatRecordedAt ?? legacy.createdAt : undefined);
      if (previousTime && Date.parse(previousTime) > Date.parse(sample.measuredAt)) { ignored++; continue; }
      const result = await upsertBodyCheckInResult(user.id, sample.date, { bodyFatPercent: sample.value }, "shortcuts", heightCm, sample.measuredAt);
      if (!result.appliedFields.includes("bodyFatPercent")) { ignored++; continue; }
    } else if (fromHealth && (sample.metric === "vo2Max" || sample.metric === "restingHeartRate")) {
      const applied = await upsertFitnessMeasurement(user.id, sample.metric, {
        value: sample.value, date: sample.date, recordedAt: sample.measuredAt, source: "apple_health",
      });
      // The daily point is kept even when a newer reading already exists, so
      // trends can use every date; the latest-reading guard stays separate.
      await recordFitnessHistory(user.id, sample.metric, {
        date: sample.date, value: sample.value, recordedAt: sample.measuredAt,
      });
      if (!applied) { ignored++; continue; }
    } else if (sample.metric === "calories") {
      const log = await getDayLog(user.id, sample.date);
      const existing = log.burns.find((burn) => burn.source === "shortcuts");
      if (existing) { existing.calories = Math.round(sample.value); existing.time = sample.measuredAt; }
      else log.burns.push({ id: crypto.randomUUID(), time: sample.measuredAt, calories: Math.round(sample.value), label: "Active Energy (Apple Health)", source: "shortcuts" });
      await saveDayLog(user.id, log);
    } else {
      // Legacy settings fields remain partial updates, preserving other fields.
      const current = await getSettings(user.id);
      await saveSettings(user.id, { ...current, [sample.metric]: sample.metric === "cardioMinutesWeekly" ? Math.round(sample.value) : sample.value });
    }
    accepted.push(sample);
  }
  if (accepted.length) await recordHealthSync(user.id, {
    receivedAt: new Date().toISOString(), provider: "apple_health",
    dates: [...new Set(accepted.map((sample) => sample.date))].sort(),
    fields: [...new Set(accepted.map((sample) => sample.metric))].sort(),
  });
  return json({
    ok: true, status: "ok", received: accepted.length, ignored,
    synced: Object.fromEntries(METRICS.map((metric) => [metric, accepted.some((sample) => sample.metric === metric)])),
  });
}
