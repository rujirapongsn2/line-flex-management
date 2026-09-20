import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  ensureAuthStore,
  verifySession,
} from "./auth";

export async function requireAuth(
  req: NextRequest
): Promise<{ username: string } | NextResponse> {
  await ensureAuthStore();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  return session;
}

export function isAuthError(
  v: { username: string } | NextResponse
): v is NextResponse {
  return v instanceof NextResponse;
}
