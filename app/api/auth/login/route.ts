import { NextRequest, NextResponse } from "next/server";
import {
  FIXED_USERNAME,
  SESSION_COOKIE,
  createSessionToken,
  getAuthRecord,
  isSecureRequest,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const b = body as { username?: string; password?: string };
  const username = (b.username || "").trim();
  const password = b.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" },
      { status: 400 }
    );
  }

  const record = await getAuthRecord();

  if (username !== FIXED_USERNAME || username !== record.username) {
    return NextResponse.json(
      { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(
    password,
    record.passwordHash,
    record.salt
  );
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const token = await createSessionToken(record.username);
  const res = NextResponse.json({ ok: true, username: record.username });
  res.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(isSecureRequest(req))
  );
  return res;
}
