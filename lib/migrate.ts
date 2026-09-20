import { promises as fs } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import type { ConsoleTemplate } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const AUTH_JSON = path.join(DATA_DIR, "auth.json");
const SECRET_JSON = path.join(DATA_DIR, "auth-secret.json");
const RUNTIME_JSON = path.join(DATA_DIR, "runtime-config.json");
const MIGRATED_FLAG = "json_migrated_v1";

type AuthJson = {
  username?: string;
  passwordHash?: string;
  salt?: string;
  updatedAt?: string;
};

type SecretJson = { secret?: string; createdAt?: string };

type RuntimeJson = {
  agent?: {
    name?: string;
    prompt?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    enabled?: boolean;
  };
  line?: {
    channelAccessToken?: string;
    channelSecret?: string;
    webhookConfirmed?: boolean;
    lastUserId?: string;
  };
  templates?: ConsoleTemplate[];
};

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    console.warn("[migrate] failed to read", filePath, err);
    return null;
  }
}

async function importAuth(prisma: PrismaClient): Promise<void> {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const auth = await readJsonFile<AuthJson>(AUTH_JSON);
  if (auth?.username && auth.passwordHash && auth.salt) {
    await prisma.user.create({
      data: {
        username: auth.username,
        passwordHash: auth.passwordHash,
        salt: auth.salt,
        ...(auth.updatedAt ? { updatedAt: new Date(auth.updatedAt) } : {}),
      },
    });
    console.info("[migrate] imported User from auth.json (hash preserved)");
    return;
  }

  const initial = (process.env.INITIAL_ADMIN_PASSWORD || "").trim();
  if (initial) {
    // Lazy import to avoid circular deps at module load
    const { hashPassword, FIXED_USERNAME } = await import("./auth");
    const { hash, salt } = await hashPassword(initial);
    await prisma.user.create({
      data: {
        username: FIXED_USERNAME,
        passwordHash: hash,
        salt,
      },
    });
    console.info("[migrate] seeded admin from INITIAL_ADMIN_PASSWORD");
  }
}

async function importSessionSecret(prisma: PrismaClient): Promise<void> {
  const envSecret = (process.env.LINEDEV_SESSION_SECRET || "").trim();
  if (envSecret) {
    await prisma.appMeta.upsert({
      where: { key: "sessionSecret" },
      create: { key: "sessionSecret", value: envSecret },
      update: { value: envSecret },
    });
    return;
  }

  const existing = await prisma.appMeta.findUnique({
    where: { key: "sessionSecret" },
  });
  if (existing?.value?.trim()) {
    process.env.LINEDEV_SESSION_SECRET = existing.value.trim();
    return;
  }

  const file = await readJsonFile<SecretJson>(SECRET_JSON);
  if (file?.secret?.trim()) {
    const secret = file.secret.trim();
    await prisma.appMeta.create({
      data: { key: "sessionSecret", value: secret },
    });
    process.env.LINEDEV_SESSION_SECRET = secret;
    console.info("[migrate] imported session secret from auth-secret.json");
    return;
  }

  // Generate once into DB (+ optional file for next.config/middleware)
  const { randomBytes } = await import("crypto");
  const secret = randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await prisma.appMeta.create({
    data: { key: "sessionSecret", value: secret },
  });
  process.env.LINEDEV_SESSION_SECRET = secret;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      SECRET_JSON,
      JSON.stringify(
        { secret, createdAt: new Date().toISOString() },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    /* ignore */
  }
  console.info("[migrate] generated new session secret into AppMeta");
}

async function importRuntime(prisma: PrismaClient): Promise<void> {
  const agent = await prisma.agentConfig.findUnique({ where: { id: 1 } });
  const line = await prisma.lineConfig.findUnique({ where: { id: 1 } });
  const tplCount = await prisma.flexTemplate.count();

  const hasRuntime =
    Boolean(agent) || Boolean(line) || tplCount > 0;
  if (hasRuntime) return;

  const runtime = await readJsonFile<RuntimeJson>(RUNTIME_JSON);
  if (!runtime) {
    // Ensure singleton rows exist empty
    await prisma.agentConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    await prisma.lineConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return;
  }

  if (runtime.agent) {
    const a = runtime.agent;
    await prisma.agentConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        name: a.name || "",
        prompt: a.prompt || "",
        baseUrl: a.baseUrl || "",
        model: a.model || "",
        apiKey: a.apiKey || "",
        enabled: a.enabled !== false,
      },
      update: {
        name: a.name || "",
        prompt: a.prompt || "",
        baseUrl: a.baseUrl || "",
        model: a.model || "",
        apiKey: a.apiKey || "",
        enabled: a.enabled !== false,
      },
    });
  } else {
    await prisma.agentConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  if (runtime.line) {
    const l = runtime.line;
    await prisma.lineConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        channelAccessToken: l.channelAccessToken || "",
        channelSecret: l.channelSecret || "",
        webhookConfirmed: Boolean(l.webhookConfirmed),
        lastUserId: l.lastUserId || "",
      },
      update: {
        channelAccessToken: l.channelAccessToken || "",
        channelSecret: l.channelSecret || "",
        webhookConfirmed: Boolean(l.webhookConfirmed),
        lastUserId: l.lastUserId || "",
      },
    });
  } else {
    await prisma.lineConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  if (Array.isArray(runtime.templates) && runtime.templates.length > 0) {
    let order = 0;
    for (const t of runtime.templates) {
      if (!t?.id) continue;
      await prisma.flexTemplate.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          displayNameTh: t.displayNameTh || "",
          conditionKey: t.conditionKey || "",
          modelDescription: t.modelDescription || "",
          triggerExamples: JSON.stringify(t.triggerExamples || []),
          variables: JSON.stringify(t.variables || []),
          kind: t.kind || "raw-json",
          fields: JSON.stringify(t.fields || {}),
          enabled: t.enabled !== false,
          sortOrder: order++,
        },
        update: {
          displayNameTh: t.displayNameTh || "",
          conditionKey: t.conditionKey || "",
          modelDescription: t.modelDescription || "",
          triggerExamples: JSON.stringify(t.triggerExamples || []),
          variables: JSON.stringify(t.variables || []),
          kind: t.kind || "raw-json",
          fields: JSON.stringify(t.fields || {}),
          enabled: t.enabled !== false,
          sortOrder: order - 1,
        },
      });
    }
    console.info(
      `[migrate] imported ${runtime.templates.length} FlexTemplate(s) from runtime-config.json`
    );
  }

  console.info("[migrate] imported AgentConfig / LineConfig from runtime-config.json");
}

/**
 * Idempotent: push schema is done by entrypoint; this imports JSON once when DB is empty.
 */
export async function ensureMigrated(prisma: PrismaClient): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  await importSessionSecret(prisma);
  await importAuth(prisma);
  await importRuntime(prisma);

  const flag = await prisma.appMeta.findUnique({ where: { key: MIGRATED_FLAG } });
  if (!flag) {
    await prisma.appMeta.create({
      data: { key: MIGRATED_FLAG, value: new Date().toISOString() },
    });
  }
}
