import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import {
  loadCalibration,
  saveCalibrationDecision,
} from "@/lib/calibrationStore";
import { addCalendarDays, CALIBRATION_POLICY } from "@/lib/calibration";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { calibration, fingerprint, settings } = await loadCalibration(userId);
  return NextResponse.json(
    { calibration, fingerprint, review: settings.calibrationReview ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (
    !body ||
    !["apply", "keep"].includes(body.action) ||
    typeof body.fingerprint !== "string" ||
    (body.action === "apply" && body.contextConfirmed !== true)
  )
    return NextResponse.json(
      {
        error:
          "Pilih keputusan dan konfirmasi konteks sebelum menerapkan usulan.",
      },
      { status: 400 },
    );
  const { stored, settings, today, calibration, fingerprint } =
    await loadCalibration(userId);
  if (calibration.status !== "proposal" || fingerprint !== body.fingerprint)
    return NextResponse.json(
      {
        error:
          "Data atau target berubah, atau usulan belum siap. Muat ulang sebelum memutuskan.",
      },
      { status: 409 },
    );
  const selectedTarget =
    body.action === "apply"
      ? calibration.proposedTarget!
      : settings.dailyTargetKcal;
  const review = {
    decision:
      body.action === "apply" ? ("applied" as const) : ("kept" as const),
    reviewedAt: new Date().toISOString(),
    reviewAfter: addCalendarDays(today, CALIBRATION_POLICY.reevaluateDays),
    periodStart: calibration.periodStart,
    periodEnd: calibration.periodEnd,
    previousTarget: settings.dailyTargetKcal,
    selectedTarget,
    estimatedTdee: calibration.estimatedTdee!,
    tdeeRange: calibration.tdeeRange!,
  };
  const next = {
    ...settings,
    dailyTargetKcal: selectedTarget,
    calibrationReview: review,
  };
  if (!(await saveCalibrationDecision(userId, stored, next)))
    return NextResponse.json(
      {
        error:
          "Profil berubah saat keputusan disimpan. Muat ulang dan tinjau kembali.",
      },
      { status: 409 },
    );
  return NextResponse.json({ settings: next, review });
}
