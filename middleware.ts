import { NextRequest, NextResponse } from "next/server";

const COOKIE = "linedev_session";
const FIXED_USERNAME = "admin";

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function verifyToken(
  token: string,
  secret: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body)
    );
    const expected = new Uint8Array(sigBuf);
    const got = b64urlToBytes(sig);
    if (!timingSafeEqual(expected, got)) return false;

    const json = new TextDecoder().decode(b64urlToBytes(body));
    const payload = JSON.parse(json) as { u?: string; exp?: number };
    if (!payload?.u || typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    if (payload.u !== FIXED_USERNAME) return false;
    return true;
  } catch {
    return false;
  }
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/api/line/webhook") return true;
  if (pathname === "/api/checkin") return true;
  if (pathname === "/api/poi/search") return true;
  if (pathname === "/api/location/action") return true;
  if (pathname === "/api/liff/config") return true;
  if (pathname === "/liff/checkin" || pathname.startsWith("/liff/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  const secret = process.env.LINEDEV_SESSION_SECRET || "";
  const ok = token && secret ? await verifyToken(token, secret) : false;

  // Soft fallback: cookie present but secret not inlined yet — let Node routes verify
  const softOk = Boolean(token) && !secret;

  if (ok || softOk) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const login = new URL("/login", req.url);
  if (pathname !== "/") {
    login.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets we never gate.
     * Public API/login handled inside middleware.
     */
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map)$).*)",
  ],
};
