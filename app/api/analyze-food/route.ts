import { NextRequest, NextResponse } from "next/server";
import { analyzeFoodPhoto } from "@/lib/gemini";

export const maxDuration = 30;

// The uploaded photo only ever lives in memory for this request — it is sent
// to Gemini for analysis and never written to Redis or disk.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "photo file is required" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Foto terlalu besar (maks 8MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/jpeg";

  try {
    const analysis = await analyzeFoodPhoto(base64, mimeType);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Gagal menganalisa foto";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
