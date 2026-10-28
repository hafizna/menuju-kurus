import { NextRequest, NextResponse } from "next/server";
import { describeFoodMeal } from "@/lib/gemini";
import { cleanDescription } from "@/lib/mealNote";
import { getUserId } from "@/lib/session";

export const maxDuration = 30;

const MIN_LENGTH = 3;

// Estimates a meal from words alone: what was eaten and how much, in household
// measures. No photo and nothing about the person is sent, so the same text
// always means the same amounts; targets are applied elsewhere.
export async function POST(req: NextRequest) {
  if (!getUserId(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = cleanDescription(body?.text);
  if (text.length < MIN_LENGTH) {
    return NextResponse.json({ error: "Tulis dulu apa yang kamu makan, misalnya nasi 1 centong dan telur 2 butir." }, { status: 400 });
  }

  try {
    const analysis = await describeFoodMeal(text);
    if (!analysis.components.length) throw new Error("The estimate has no ingredients");
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error(err);
    // Upstream details stay in the server log; the person keeps the manual route.
    return NextResponse.json(
      { error: "Hitung dari tulisan sedang tidak tersedia. Kamu masih bisa mengisi manual." },
      { status: 502 },
    );
  }
}
