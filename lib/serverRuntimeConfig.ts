import type {
  AgentConfig,
  ConsoleState,
  ConsoleTemplate,
  LineConfig,
  TemplateId,
  TemplateVariable,
} from "./types";
import { defaultAgent, defaultLine } from "./consoleStore";
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

  const nextAgent = partial.agent
    ? { ...current.agent, ...partial.agent }
    : current.agent;
  const nextLine = partial.line
    ? { ...current.line, ...partial.line }
    : current.line;
  const nextTemplates = Array.isArray(partial.templates)
    ? partial.templates
    : current.templates;

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
      },
      update: {
        channelAccessToken: nextLine.channelAccessToken,
        channelSecret: nextLine.channelSecret,
        webhookConfirmed: nextLine.webhookConfirmed,
        lastUserId: nextLine.lastUserId || "",
      },
    });
  }

  if (Array.isArray(partial.templates)) {
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

  return {
    agent: nextAgent,
    line: nextLine,
    templates: nextTemplates,
  };
}

/** Safe status for GET — never returns secrets. */
export type RuntimeConfigStatus = {
  hasApiKey: boolean;
  hasToken: boolean;
  hasSecret: boolean;
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
  return {
    hasApiKey: Boolean(apiKey),
    hasToken: Boolean(token),
    hasSecret: Boolean(secret),
    templateCount: Array.isArray(cfg.templates) ? cfg.templates.length : 0,
    model: cfg.agent.model || "",
    agentName: cfg.agent.name || "",
    apiKeyLast4: last4(apiKey),
    tokenLast4: last4(token),
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
    out.agent = { ...defaultAgent(), ...b.agent } as AgentConfig;
  }
  if (b.line && typeof b.line === "object") {
    out.line = { ...defaultLine(), ...b.line } as LineConfig;
  }
  if (Array.isArray(b.templates)) {
    out.templates = b.templates;
  }
  return out;
}
