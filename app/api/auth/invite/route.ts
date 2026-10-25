import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, makeSessionToken, constantTimeEqual } from "@/lib/auth";
import { getUsers } from "@/lib/users";
import { clientIp } from "@/lib/session";
import { hasPin, isPinRateLimited, recordPinAttempt } from "@/lib/pin";

// First-time entry with the invite code the admin handed out. Works only
// until that user has chosen a PIN, so a leaked or reused code is useless
// afterwards. Shares the PIN attempt throttle so codes can't be guessed.
export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  const ip = clientIp(req);

  if (await isPinRateLimited(ip)) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
      { status: 429 },
    );
  }

  const candidate = typeof code === "string" ? code.trim() : "";
  const matches = candidate
    ? getUsers().filter((u) => constantTimeEqual(candidate, u.inviteCode))
    : [];
  const user = matches.length === 1 ? matches[0] : null;

  if (!user) {
    await recordPinAttempt(ip);
    return NextResponse.json({ error: "Kode undangan salah" }, { status: 401 });
  }
  if (await hasPin(user.id)) {
    return NextResponse.json(
      { error: "Kode ini sudah dipakai. Masuk dengan PIN kamu." },
      { status: 409 },
    );
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
