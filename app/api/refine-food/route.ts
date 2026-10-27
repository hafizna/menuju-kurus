import { NextRequest, NextResponse } from "next/server";
import { normalizeFoodAnalysis, refineFoodAnalysis } from "@/lib/gemini";
import { cleanNote } from "@/lib/mealNote";
import { getUserId } from "@/lib/session";

export const maxDuration = 30;

// Recalculates an estimate from the current ingredients plus a note such as
// "telur 3 butir". No photo is involved, so it also works for a meal that was
// saved yesterday, when the photo no longer exists anywhere.
export async function POST(req: NextRequest) {
  if (!getUserId(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const note = cleanNote(body?.note);
  const current = body?.analysis && typeof body.analysis === "object" && !Array.isArray(body.analysis)
    ? normalizeFoodAnalysis(body.analysis)
    : null;
  if (!note || !current || !current.components.length) {
    return NextResponse.json({ error: "Tulis keterangannya dulu, misalnya telur 3 butir." }, { status: 400 });
  }

  try {
    const analysis = await refineFoodAnalysis(current, note);
    if (!analysis.components.length) throw new Error("The revised estimate has no ingredients");
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error(err);
    // Upstream details stay in the server log; the person keeps the manual route.
    return NextResponse.json(
      { error: "Hitung ulang sedang tidak tersedia. Kamu masih bisa mengubah jumlahnya sendiri di bawah." },
      { status: 502 },
    );
  }
}
