import { promises as fs } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import type { ConsoleTemplate } from "./types";
import {
  checkinAskTemplateFields,
  checkinResultTemplateFields,
} from "./checkinFlex";
import { locationTypeChooserTemplateFields } from "./nearbyFlex";
import { getEnvLiffId } from "./liffConfig";

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

const NEARBY_PROMPT_MARKER = "checkin_ask";

const NEARBY_PROMPT_BLOCK = `เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล / คอนโด / ห้าง หรือขอแชร์พิกัด/เช็คอิน → ต้องเรียกเงื่อนไข checkin_ask ทันที (ส่ง Flex การ์ดเปิด LIFF ให้แชร์ GPS พร้อม fields.tag ถ้าทราบ เช่น 7-11 — ห้ามใช้ location picker ของ LINE เป็นหลัก; ผลค้นหา Longdo จะส่งหลังได้พิกัดจาก LIFF)

สำคัญมาก: ห้ามตอบข้อความธรรมดาว่า «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» เมื่อยังไม่ได้พิกัด — ต้องส่ง checkin_ask ก่อนเสมอ`;

/** Idempotent: ensure AgentConfig.prompt includes nearby → checkin_ask rules. */
export async function patchAgentNearbyPrompt(
  prisma: PrismaClient
): Promise<void> {
  const row = await prisma.agentConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    const { defaultAgentPrompt, defaultAgent } = await import("./consoleStore");
    const a = defaultAgent();
    await prisma.agentConfig.create({
      data: {
        id: 1,
        name: a.name,
        prompt: defaultAgentPrompt(),
        baseUrl: a.baseUrl,
        model: a.model,
        apiKey: "",
        enabled: true,
      },
    });
    console.info("[migrate] created AgentConfig with nearby prompt");
    return;
  }

  const prompt = (row.prompt || "").trim();
  if (prompt.includes(NEARBY_PROMPT_MARKER) && prompt.includes("ไม่มีข้อมูล")) {
    return;
  }

  let next: string;
  if (!prompt) {
    const { defaultAgentPrompt } = await import("./consoleStore");
    next = defaultAgentPrompt();
  } else if (!prompt.includes(NEARBY_PROMPT_MARKER)) {
    next = `${prompt}\n\n${NEARBY_PROMPT_BLOCK}`;
  } else {
    next =
      prompt +
      "\n\nสำคัญมาก: ห้ามตอบข้อความธรรมดาว่า «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» เมื่อยังไม่ได้พิกัด — ต้องส่ง checkin_ask ก่อนเสมอ";
  }

  await prisma.agentConfig.update({
    where: { id: 1 },
    data: { prompt: next },
  });
  console.info("[migrate] patched AgentConfig.prompt with nearby/checkin_ask rules");
}

export async function seedCheckinTemplates(prisma: PrismaClient): Promise<void> {
  const liffId = getEnvLiffId();
  const askFields = checkinAskTemplateFields(liffId);
  const resultFields = checkinResultTemplateFields();

  const ask = {
    id: "checkin_ask",
    displayNameTh: "แชร์พิกัดค้นหาใกล้เคียง",
    conditionKey: "checkin_ask",
    modelDescription:
      "เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล หรือขอแชร์พิกัด — ส่งการ์ด CTA เปิด LIFF (ใส่ tag ใน fields ถ้าทราบ; ไม่ใช้ LINE location picker เป็นหลัก). ห้ามตอบ «ไม่มีข้อมูล» โดยไม่มีพิกัด",
    triggerExamples: JSON.stringify([
      "แถวนี้มีร้าน 7-11 ที่ไหนบ้าง",
      "มีโรงพยาบาลใกล้ฉันไหม",
      "ค้นหาคอนโดใกล้เคียง",
      "แชร์พิกัด",
      "เช็คอิน",
    ]),
    variables: JSON.stringify([]),
    kind: "bubble-simple",
    fields: JSON.stringify(askFields),
    enabled: true,
    sortOrder: 100,
  };
  const result = {
    id: "nearby_results",
    displayNameTh: "ผลค้นหาใกล้เคียง",
    conditionKey: "nearby_results",
    modelDescription:
      "การ์ดรายการ POI จาก Longdo หลังได้พิกัด (สร้างจาก /api/poi/search)",
    triggerExamples: JSON.stringify([]),
    variables: JSON.stringify([
      { name: "lat", example: "13.7563", required: true },
      { name: "lng", example: "100.5018", required: true },
      { name: "time", example: "21 ก.ย. 2569 11:00", required: false },
    ]),
    kind: "bubble-simple",
    fields: JSON.stringify(resultFields),
    enabled: true,
    sortOrder: 101,
  };
  const chooserFields = locationTypeChooserTemplateFields(liffId);
  const chooser = {
    id: "location_type_chooser",
    displayNameTh: "เลือกประเภท Location Action",
    conditionKey: "location_type_chooser",
    modelDescription:
      "เมื่อลูกค้าขอเช็คอิน/ใกล้เคียงโดยไม่ระบุประเภท และ Location Action มีหลาย HTTP endpoint — ส่งการ์ดนี้ให้เลือกประเภท (ปุ่มเปิด LIFF ด้วย tag=endpoint id)",
    triggerExamples: JSON.stringify([
      "เช็คอิน",
      "checkin",
      "หาข้อมูลจากพิกัด",
      "ข้อมูลดิน",
      "แหล่งน้ำใกล้ฉัน",
    ]),
    variables: JSON.stringify([]),
    kind: "raw-json",
    fields: JSON.stringify(chooserFields),
    enabled: true,
    sortOrder: 102,
  };

  // Create-only: never overwrite admin edits from Flex console.
  // writeRuntimeConfig calls ensureNearbySeeds after every save; upsert-update
  // previously wiped checkin_ask / nearby_results back to seed defaults.
  for (const row of [ask, result, chooser]) {
    const existing = await prisma.flexTemplate.findUnique({
      where: { id: row.id },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.flexTemplate.create({ data: row });
  }
}

/** Seed checkin templates + patch agent prompt (safe to call after console sync). */
export async function ensureNearbySeeds(prisma: PrismaClient): Promise<void> {
  await seedCheckinTemplates(prisma);
  await patchAgentNearbyPrompt(prisma);
}

export async function ensureMigrated(prisma: PrismaClient): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  await importSessionSecret(prisma);
  await importAuth(prisma);
  await importRuntime(prisma);
  await ensureNearbySeeds(prisma);

  const flag = await prisma.appMeta.findUnique({ where: { key: MIGRATED_FLAG } });
  if (!flag) {
    await prisma.appMeta.create({
      data: { key: MIGRATED_FLAG, value: new Date().toISOString() },
    });
  }
}
