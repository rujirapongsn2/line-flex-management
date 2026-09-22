import type {
  AgentConfig,
  ConsoleState,
  ConsoleTemplate,
  LineConfig,
  TemplateId,
  TemplateVariable,
} from "./types";
import { defaultLocationAction } from "./types";
import { defaultAgent, defaultLine } from "./consoleStore";
import {
  parseLocationActionJson,
  serializeLocationAction,
} from "./locationAction";
import { ensureDbReady } from "./db";

export type RuntimeConfig = {
  agent: AgentConfig;
  line: LineConfig;
  templates: ConsoleTemplate[];
};

function emptyConfig(): RuntimeConfig {
  return {
    agent: defaultAgent(),
    line: defaultLine(),
    templates: [],
  };
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function rowToTemplate(row: {
  id: string;
  displayNameTh: string;
  conditionKey: string;
  modelDescription: string;
  triggerExamples: string;
  variables: string;
  kind: string;
  fields: string;
  enabled: boolean;
}): ConsoleTemplate {
  return {
    id: row.id,
    displayNameTh: row.displayNameTh,
    conditionKey: row.conditionKey,
    modelDescription: row.modelDescription,
    triggerExamples: parseJsonArray<string>(row.triggerExamples, []),
    variables: parseJsonArray<TemplateVariable>(row.variables, []),
    kind: (row.kind || "raw-json") as TemplateId,
    fields: parseJsonObject(row.fields),
    enabled: row.enabled,
  };
}

export function runtimeConfigPath(): string {
  return "sqlite:AgentConfig+LineConfig+FlexTemplate";
}

export async function readRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const prisma = await ensureDbReady();
    const [agentRow, lineRow, templates] = await Promise.all([
      prisma.agentConfig.findUnique({ where: { id: 1 } }),
      prisma.lineConfig.findUnique({ where: { id: 1 } }),
      prisma.flexTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);

    const base = emptyConfig();
    return {
      agent: agentRow
        ? {
            name: agentRow.name,
            prompt: agentRow.prompt,
            baseUrl: agentRow.baseUrl,
            model: agentRow.model,
            apiKey: agentRow.apiKey,
            enabled: agentRow.enabled,
          }
        : base.agent,
      line: lineRow
        ? {
            channelAccessToken: lineRow.channelAccessToken,
            channelSecret: lineRow.channelSecret,
            webhookConfirmed: lineRow.webhookConfirmed,
            lastUserId: lineRow.lastUserId || "",
            liffId: (lineRow as { liffId?: string }).liffId || "",
            longdoApiKey: (lineRow as { longdoApiKey?: string }).longdoApiKey || "",
            locationAction: parseLocationActionJson(
              (lineRow as { locationAction?: string }).locationAction || ""
            ),
          }
        : base.line,
      templates: templates.map(rowToTemplate),
    };
  } catch (err) {
    console.warn("[runtime-config] read failed", err);
    return emptyConfig();
  }
}

export async function writeRuntimeConfig(
  partial: Partial<RuntimeConfig>
): Promise<RuntimeConfig> {
  const prisma = await ensureDbReady();
  const current = await readRuntimeConfig();

  // Preserve non-empty DB secrets when client sends "" / omits (wipe guard).
  const nextAgent = partial.agent
    ? {
        ...current.agent,
        ...partial.agent,
        apiKey:
          (partial.agent.apiKey || "").trim() || current.agent.apiKey,
      }
    : current.agent;
  const nextLine = partial.line
    ? {
        ...current.line,
        ...partial.line,
        channelAccessToken:
          (partial.line.channelAccessToken || "").trim() ||
          current.line.channelAccessToken,
        channelSecret:
          (partial.line.channelSecret || "").trim() ||
          current.line.channelSecret,
        longdoApiKey:
          (partial.line.longdoApiKey || "").trim() ||
          current.line.longdoApiKey,
      }
    : current.line;

  // Empty templates array must NOT wipe existing DB templates.
  let skipTemplateWrite = false;
  let nextTemplates = current.templates;
  if (Array.isArray(partial.templates)) {
    if (partial.templates.length === 0 && current.templates.length > 0) {
      console.warn(
        "[runtime-config] refusing empty templates wipe — keeping existing",
        current.templates.length
      );
      skipTemplateWrite = true;
      nextTemplates = current.templates;
    } else {
      nextTemplates = partial.templates;
    }
  }

  if (partial.agent) {
    await prisma.agentConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        name: nextAgent.name,
        prompt: nextAgent.prompt,
        baseUrl: nextAgent.baseUrl,
        model: nextAgent.model,
        apiKey: nextAgent.apiKey,
        enabled: nextAgent.enabled,
      },
      update: {
        name: nextAgent.name,
        prompt: nextAgent.prompt,
        baseUrl: nextAgent.baseUrl,
        model: nextAgent.model,
        apiKey: nextAgent.apiKey,
        enabled: nextAgent.enabled,
      },
    });
  }

  if (partial.line) {
    await prisma.lineConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        channelAccessToken: nextLine.channelAccessToken,
        channelSecret: nextLine.channelSecret,
        webhookConfirmed: nextLine.webhookConfirmed,
        lastUserId: nextLine.lastUserId || "",
        liffId: nextLine.liffId || "",
        longdoApiKey: nextLine.longdoApiKey || "",
        locationAction: serializeLocationAction(
          nextLine.locationAction || defaultLocationAction()
        ),
      },
      update: {
        channelAccessToken: nextLine.channelAccessToken,
        channelSecret: nextLine.channelSecret,
        webhookConfirmed: nextLine.webhookConfirmed,
        lastUserId: nextLine.lastUserId || "",
        liffId: nextLine.liffId || "",
        longdoApiKey: nextLine.longdoApiKey || "",
        locationAction: serializeLocationAction(
          nextLine.locationAction || defaultLocationAction()
        ),
      },
    });
  }

  if (Array.isArray(partial.templates) && !skipTemplateWrite) {
    await prisma.$transaction(async (tx) => {
      await tx.flexTemplate.deleteMany({});
      let order = 0;
      for (const t of nextTemplates) {
        if (!t?.id) continue;
        await tx.flexTemplate.create({
          data: {
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
        });
      }
    });
  }

  // Always re-seed checkin_ask / nearby_results + patch nearby prompt (idempotent)
  const { ensureNearbySeeds } = await import("./migrate");
  await ensureNearbySeeds(prisma);

  const refreshed = await readRuntimeConfig();
  return {
    agent: refreshed.agent,
    line: refreshed.line,
    templates: refreshed.templates,
  };
}

/** Safe status for GET — never returns secrets. */
export type RuntimeConfigStatus = {
  hasApiKey: boolean;
  hasToken: boolean;
  hasSecret: boolean;
  hasLiffId: boolean;
  hasLongdoKey: boolean;
  locationActionMode: string;
  templateCount: number;
  model: string;
  agentName: string;
  apiKeyLast4: string | null;
  tokenLast4: string | null;
};

function last4(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  return v.length <= 4 ? v : v.slice(-4);
}

export function toRuntimeStatus(cfg: RuntimeConfig): RuntimeConfigStatus {
  const apiKey = (cfg.agent.apiKey || "").trim();
  const token = (cfg.line.channelAccessToken || "").trim();
  const secret = (cfg.line.channelSecret || "").trim();
  const liffId = (
    (process.env.LIFF_ID || "").trim() ||
    (cfg.line.liffId || "").trim()
  );
  const longdoKey = (
    (process.env.LONGDO_API_KEY || "").trim() ||
    (cfg.line.longdoApiKey || "").trim()
  );
  const locMode =
    (cfg.line.locationAction && cfg.line.locationAction.mode) || "longdo_poi";
  return {
    hasApiKey: Boolean(apiKey),
    hasToken: Boolean(token),
    hasSecret: Boolean(secret),
    hasLiffId: Boolean(liffId),
    hasLongdoKey: Boolean(longdoKey),
    locationActionMode: locMode,
    templateCount: Array.isArray(cfg.templates) ? cfg.templates.length : 0,
    model: cfg.agent.model || "",
    agentName: cfg.agent.name || "",
    apiKeyLast4: last4(apiKey),
    tokenLast4: last4(token),
  };
}


/** Secret-safe hydrate payload for console UI (SQLite is source of truth). */
export type RuntimeHydratePayload = {
  agent: {
    name: string;
    prompt: string;
    baseUrl: string;
    model: string;
    enabled: boolean;
  };
  line: {
    webhookConfirmed: boolean;
    lastUserId: string;
    liffId: string;
    locationAction: LineConfig["locationAction"];
  };
  templates: ConsoleTemplate[];
};

export function toHydratePayload(cfg: RuntimeConfig): RuntimeHydratePayload {
  return {
    agent: {
      name: cfg.agent.name || "",
      prompt: cfg.agent.prompt || "",
      baseUrl: cfg.agent.baseUrl || "",
      model: cfg.agent.model || "",
      enabled: cfg.agent.enabled !== false,
    },
    line: {
      webhookConfirmed: Boolean(cfg.line.webhookConfirmed),
      lastUserId: cfg.line.lastUserId || "",
      liffId: cfg.line.liffId || "",
      locationAction:
        cfg.line.locationAction || defaultLocationAction(),
    },
    templates: Array.isArray(cfg.templates) ? cfg.templates : [],
  };
}

/** Normalize POST body into console-shaped partial. */
export function parseRuntimeBody(body: unknown): Partial<RuntimeConfig> {
  if (!body || typeof body !== "object") return {};
  const b = body as Partial<ConsoleState> & {
    agent?: Partial<AgentConfig>;
    line?: Partial<LineConfig>;
    templates?: ConsoleTemplate[];
  };
  const out: Partial<RuntimeConfig> = {};
  if (b.agent && typeof b.agent === "object") {
    const agentIn = { ...defaultAgent(), ...b.agent } as AgentConfig;
    // Drop empty apiKey so writeRuntimeConfig will not clear DB.
    if (!(agentIn.apiKey || "").trim()) {
      delete (agentIn as { apiKey?: string }).apiKey;
    }
    out.agent = agentIn;
  }
  if (b.line && typeof b.line === "object") {
    const lineIn = { ...defaultLine(), ...b.line } as LineConfig;
    // Drop empty secrets so merge cannot wipe non-empty SQLite values.
    if (!(lineIn.channelAccessToken || "").trim()) {
      delete (lineIn as { channelAccessToken?: string }).channelAccessToken;
    }
    if (!(lineIn.channelSecret || "").trim()) {
      delete (lineIn as { channelSecret?: string }).channelSecret;
    }
    if (!(lineIn.longdoApiKey || "").trim()) {
      delete (lineIn as { longdoApiKey?: string }).longdoApiKey;
    }
    out.line = lineIn;
  }
  if (Array.isArray(b.templates)) {
    out.templates = b.templates;
  }
  return out;
}
