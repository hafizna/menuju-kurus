import { NextRequest } from "next/server";

// Middleware has already verified the session and attached this header;
// if it's missing here something bypassed middleware, so treat as unauthenticated.
export function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}
