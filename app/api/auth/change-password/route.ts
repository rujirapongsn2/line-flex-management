import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  ensureAuthStore,
  getAuthRecord,
  hashPassword,
  verifyPassword,
  verifySession,
  writeAuthRecord,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  await ensureAuthStore();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const b = body as { currentPassword?: string; newPassword?: string };
  const currentPassword = b.currentPassword ?? "";
  const newPassword = b.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { ok: false, error: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่" },
      { status: 400 }
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" },
      { status: 400 }
    );
  }

  const record = await getAuthRecord();
  const ok = await verifyPassword(
    currentPassword,
    record.passwordHash,
    record.salt
  );
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const { hash, salt } = await hashPassword(newPassword);
  await writeAuthRecord({
    username: record.username,
    passwordHash: hash,
    salt,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
