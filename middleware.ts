import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

// Runs on Edge runtime; keep this dependency-free (no Node crypto/redis here).
// Next.js 16 deprecated the middleware.ts convention in favor of proxy.ts
// (which is pinned to the Node.js runtime, not Edge) — middleware.ts still
// works today via a compatibility shim, just with a build-time warning.
// Not renamed yet since that would also force this off the Edge runtime;
// revisit before middleware.ts is actually removed in a future major version.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icon.svg).*)"],
};

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health-sync"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token);

  if (userId) {
    const headers = new Headers(req.headers);
    headers.set("x-user-id", userId);
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
