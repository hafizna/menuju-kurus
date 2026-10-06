import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, makeSessionToken } from "@/lib/auth";
import { getUsers } from "@/lib/users";
import { isValidPinFormat, isPinRateLimited, recordPinAttempt, verifyPin } from "@/lib/pin";

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const { pin } = await req.json().catch(() => ({ pin: "" }));
  const ip = clientIp(req);

  if (await isPinRateLimited(ip)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
      { status: 429 },
    );
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ error: "PIN salah" }, { status: 401 });
  }

  const matches = [];
  for (const user of getUsers()) {
    if (await verifyPin(user.id, pin)) matches.push(user);
  }
  // Distinct per-user salts make a cross-user hash collision practically
  // impossible, but fail closed on ambiguity rather than guess anyway.
  const user = matches.length === 1 ? matches[0] : null;

  if (!user) {
    await recordPinAttempt(ip);
    return NextResponse.json({ error: "PIN salah" }, { status: 401 });
  }

  const token = await makeSessionToken(user.id);
  const res = NextResponse.json({ ok: true, name: user.name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
