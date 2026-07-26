import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, makeSessionToken, findUserByPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));

  const user = typeof password === "string" ? findUserByPassword(password) : null;
  if (!user) {
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

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
