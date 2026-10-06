import { NextRequest, NextResponse } from "next/server";
import { resolveGoogleIdentity } from "@/lib/googleAuth";
import { SESSION_COOKIE, OAUTH_STATE_COOKIE, OAUTH_NEXT_COOKIE, makeSessionToken, constantTimeEqual } from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";
import { hasPin } from "@/lib/pin";

function redirectToLogin(req: NextRequest, error: string) {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("error", error);
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const next = req.cookies.get(OAUTH_NEXT_COOKIE)?.value || "/";

  if (!code || !state || !expectedState || !constantTimeEqual(state, expectedState)) {
    return redirectToLogin(req, "state_mismatch");
  }

  let email: string;
  try {
    const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
    const identity = await resolveGoogleIdentity(code, redirectUri);
    email = identity.email;
  } catch {
    return redirectToLogin(req, "google_failed");
  }

  // Google verifies the person; this allowlist (USERn_EMAIL) decides who's
  // actually let in, so a stranger with any Google account still can't enter.
  const user = findUserByEmail(email);
  if (!user) {
    return redirectToLogin(req, "not_allowed");
  }

  const token = await makeSessionToken(user.id);
  const needsPin = !(await hasPin(user.id));
  const destination = needsPin ? "/account/set-pin" : next;

  const res = NextResponse.redirect(new URL(destination, req.url));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}
