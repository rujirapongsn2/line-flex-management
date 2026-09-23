import type {
  ConsoleState,
  ConsoleTemplate,
  LocationActionConfig,
} from "./types";

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
    locationAction?: LocationActionConfig;
  };
  templates: ConsoleTemplate[];
};

export type RuntimeSyncStatus = {
  ok: boolean;
  hasApiKey?: boolean;
  hasToken?: boolean;
  hasSecret?: boolean;
  hasLiffId?: boolean;
  hasLongdoKey?: boolean;
  locationActionMode?: string;
  templateCount?: number;
  model?: string;
  agentName?: string;
  apiKeyLast4?: string | null;
  tokenLast4?: string | null;
  hydrate?: RuntimeHydratePayload;
  error?: string;
};

/** Push console agent/line/templates to server for webhook use. */
export async function syncRuntimeConfig(
  state: ConsoleState
): Promise<RuntimeSyncStatus> {
  try {
    if (!state || !state.agent || !state.line) {
      return {
        ok: false,
        error: "Console state incomplete (missing agent/line) — refresh and retry",
      };
    }
    const agent: Record<string, unknown> = { ...state.agent };
    const line: Record<string, unknown> = { ...state.line };
    // Never send empty secrets — avoids wiping non-empty SQLite values.
    if (!(state.agent.apiKey || "").trim()) delete agent.apiKey;
    if (!(state.line.channelAccessToken || "").trim())
      delete line.channelAccessToken;
    if (!(state.line.channelSecret || "").trim()) delete line.channelSecret;
    if (!(state.line.longdoApiKey || "").trim()) delete line.longdoApiKey;

    const res = await fetch("/api/runtime-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        line,
        templates: state.templates,
      }),
    });
    const data = (await res.json()) as RuntimeSyncStatus & { error?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return { ...data, ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchRuntimeStatus(): Promise<RuntimeSyncStatus> {
  try {
    const res = await fetch("/api/runtime-config");
    const data = (await res.json()) as RuntimeSyncStatus & { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ...data, ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Convenience: GET status and return hydrate payload (or null). */
export async function fetchRuntimeHydrate(): Promise<RuntimeHydratePayload | null> {
  const status = await fetchRuntimeStatus();
  if (!status.ok || !status.hydrate) return null;
  return status.hydrate;
}
