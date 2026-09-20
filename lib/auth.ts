import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { ensureDbReady, getPrisma } from "./db";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "linedev_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
export const FIXED_USERNAME = "admin";

const DATA_DIR = path.join(process.cwd(), "data");
const SECRET_PATH = path.join(DATA_DIR, "auth-secret.json");

export type AuthRecord = {
  username: string;
  passwordHash: string;
  salt: string;
  updatedAt: string;
};

type SecretFile = { secret: string; createdAt: string };

type SessionPayload = {
  u: string;
  exp: number;
};

let secretCache: string | null = null;
let authEnsurePromise: Promise<AuthRecord> | null = null;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/**
 * Sync bootstrap for next.config — prefer env, else auth-secret.json on volume,
 * else generate once into volume file (Docker should set LINEDEV_SESSION_SECRET).
 */
export function ensureAuthEnv(): string {
  if (process.env.LINEDEV_SESSION_SECRET?.trim()) {
    secretCache = process.env.LINEDEV_SESSION_SECRET.trim();
    return secretCache;
  }
  if (secretCache) {
    process.env.LINEDEV_SESSION_SECRET = secretCache;
    return secretCache;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync, writeFileSync, mkdirSync, existsSync } =
      require("fs") as typeof import("fs");
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(SECRET_PATH)) {
      const raw = readFileSync(SECRET_PATH, "utf8");
      const parsed = JSON.parse(raw) as SecretFile;
      if (parsed.secret?.trim()) {
        secretCache = parsed.secret.trim();
        process.env.LINEDEV_SESSION_SECRET = secretCache;
        return secretCache;
      }
    }
    const secret = b64url(randomBytes(32));
    const file: SecretFile = {
      secret,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(SECRET_PATH, JSON.stringify(file, null, 2), "utf8");
    secretCache = secret;
    process.env.LINEDEV_SESSION_SECRET = secret;
    return secret;
  } catch (err) {
    console.warn("[auth] ensureAuthEnv failed, generating ephemeral secret", err);
    secretCache = b64url(randomBytes(32));
    process.env.LINEDEV_SESSION_SECRET = secretCache;
    return secretCache;
  }
}

export async function getSessionSecret(): Promise<string> {
  if (process.env.LINEDEV_SESSION_SECRET?.trim()) {
    secretCache = process.env.LINEDEV_SESSION_SECRET.trim();
    return secretCache;
  }
  if (secretCache) return secretCache;

  try {
    const prisma = await ensureDbReady();
    const row = await prisma.appMeta.findUnique({
      where: { key: "sessionSecret" },
    });
    if (row?.value?.trim()) {
      secretCache = row.value.trim();
      process.env.LINEDEV_SESSION_SECRET = secretCache;
      return secretCache;
    }
  } catch (err) {
    console.warn("[auth] AppMeta session secret read failed", err);
  }

  // Fallback: file on volume
  try {
    const raw = await fs.readFile(SECRET_PATH, "utf8");
    const parsed = JSON.parse(raw) as SecretFile;
    if (parsed.secret?.trim()) {
      secretCache = parsed.secret.trim();
      process.env.LINEDEV_SESSION_SECRET = secretCache;
      return secretCache;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn("[auth] read secret file failed", err);
    }
  }

  const secret = b64url(randomBytes(32));
  secretCache = secret;
  process.env.LINEDEV_SESSION_SECRET = secret;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      SECRET_PATH,
      JSON.stringify(
        { secret, createdAt: new Date().toISOString() },
        null,
        2
      ),
      "utf8"
    );
    const prisma = getPrisma();
    await prisma.appMeta.upsert({
      where: { key: "sessionSecret" },
      create: { key: "sessionSecret", value: secret },
      update: { value: secret },
    });
  } catch (err) {
    console.warn("[auth] persist session secret failed", err);
  }
  return secret;
}

export async function hashPassword(
  password: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const saltBuf = salt ? fromB64url(salt) : randomBytes(16);
  const derived = (await scryptAsync(password, saltBuf, 64)) as Buffer;
  return { hash: b64url(derived), salt: b64url(saltBuf) };
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  salt: string
): Promise<boolean> {
  try {
    const { hash } = await hashPassword(password, salt);
    const a = fromB64url(hash);
    const b = fromB64url(passwordHash);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createSessionToken(username: string): Promise<string> {
  const secret = await getSessionSecret();
  const payload: SessionPayload = {
    u: username,
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined | null
): Promise<{ username: string } | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const secret = await getSessionSecret();
    const expected = createHmac("sha256", secret).update(body).digest();
    const got = fromB64url(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return null;
    }
    const payload = JSON.parse(
      fromB64url(body).toString("utf8")
    ) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    if (payload.u !== FIXED_USERNAME) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

/** Edge-safe sync verify when secret is already in env (middleware). */
export function verifySessionSync(
  token: string | undefined | null,
  secret: string
): { username: string } | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const expected = createHmac("sha256", secret).update(body).digest();
    const got = fromB64url(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return null;
    }
    const payload = JSON.parse(
      fromB64url(body).toString("utf8")
    ) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    if (payload.u !== FIXED_USERNAME) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

function toAuthRecord(row: {
  username: string;
  passwordHash: string;
  salt: string;
  updatedAt: Date;
}): AuthRecord {
  return {
    username: row.username,
    passwordHash: row.passwordHash,
    salt: row.salt,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readAuthRecord(): Promise<AuthRecord | null> {
  try {
    const prisma = await ensureDbReady();
    const row = await prisma.user.findUnique({
      where: { username: FIXED_USERNAME },
    });
    if (!row) return null;
    return toAuthRecord(row);
  } catch (err) {
    console.warn("[auth] read User failed", err);
    return null;
  }
}

export async function writeAuthRecord(record: AuthRecord): Promise<void> {
  const prisma = await ensureDbReady();
  await prisma.user.upsert({
    where: { username: record.username },
    create: {
      username: record.username,
      passwordHash: record.passwordHash,
      salt: record.salt,
    },
    update: {
      passwordHash: record.passwordHash,
      salt: record.salt,
    },
  });
  authEnsurePromise = Promise.resolve(record);
}

export async function getAuthRecord(): Promise<AuthRecord> {
  await ensureAuthStore();
  const fresh = await readAuthRecord();
  if (!fresh) {
    authEnsurePromise = null;
    return ensureAuthStore();
  }
  authEnsurePromise = Promise.resolve(fresh);
  return fresh;
}

export async function ensureAuthStore(): Promise<AuthRecord> {
  if (!authEnsurePromise) {
    authEnsurePromise = (async () => {
      await getSessionSecret();
      const existing = await readAuthRecord();
      if (existing) return existing;

      const initial = (
        process.env.INITIAL_ADMIN_PASSWORD ||
        process.env.LINEDEV_INITIAL_PASSWORD ||
        ""
      ).trim();

      if (!initial) {
        throw new Error(
          "No admin user in database. Set INITIAL_ADMIN_PASSWORD for first seed, " +
            "or place data/auth.json for migration."
        );
      }

      const { hash, salt } = await hashPassword(initial);
      const record: AuthRecord = {
        username: FIXED_USERNAME,
        passwordHash: hash,
        salt,
        updatedAt: new Date().toISOString(),
      };
      await writeAuthRecord(record);
      console.info("[auth] seeded admin from INITIAL_ADMIN_PASSWORD");
      return record;
    })().catch((err) => {
      authEnsurePromise = null;
      throw err;
    });
  }
  return authEnsurePromise;
}

export function sessionCookieOptions(secure: boolean): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function isSecureRequest(req: {
  headers: Headers;
  url: string;
}): boolean {
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (req.url.startsWith("https") ? "https" : "http");
  return proto === "https";
}
