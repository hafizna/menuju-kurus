import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/googleAuth";
import { OAUTH_STATE_COOKIE, OAUTH_NEXT_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") || "/";
  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const state = crypto.randomUUID();

  let authUrl: string;
  try {
    authUrl = buildGoogleAuthUrl(redirectUri, state);
  } catch {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  res.cookies.set(OAUTH_NEXT_COOKIE, next.startsWith("/") ? next : "/", cookieOpts);
  return res;
}
