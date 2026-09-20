import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isSecureRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
