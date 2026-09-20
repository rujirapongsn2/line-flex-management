import type { ConsoleState } from "./types";

export type RuntimeSyncStatus = {
  ok: boolean;
  hasApiKey?: boolean;
  hasToken?: boolean;
  hasSecret?: boolean;
  templateCount?: number;
  model?: string;
  agentName?: string;
  apiKeyLast4?: string | null;
  tokenLast4?: string | null;
  error?: string;
};

export type RuntimeConfigPayload = {
  agent: ConsoleState["agent"];
  line: ConsoleState["line"];
  templates: ConsoleState["templates"];
};

export type RuntimeConfigResponse = RuntimeSyncStatus & {
  config?: RuntimeConfigPayload;
};

function serverHasData(cfg: RuntimeConfigPayload | undefined): boolean {
  if (!cfg) return false;
  const a = cfg.agent;
  const l = cfg.line;
  return Boolean(
    (a?.apiKey || "").trim() ||
      (a?.prompt || "").trim() ||
      (a?.name || "").trim() ||
      (l?.channelAccessToken || "").trim() ||
      (l?.channelSecret || "").trim() ||
      (Array.isArray(cfg.templates) && cfg.templates.length > 0)
  );
}

export { serverHasData };

/** Push console agent/line/templates to server for webhook use. */
export async function syncRuntimeConfig(
  state: ConsoleState
): Promise<RuntimeConfigResponse> {
  try {
    const res = await fetch("/api/runtime-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: state.agent,
        line: state.line,
        templates: state.templates,
      }),
    });
    const data = (await res.json()) as RuntimeConfigResponse & { error?: string };
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

/** Load full config + status from SQLite (server). */
export async function fetchRuntimeConfig(): Promise<RuntimeConfigResponse> {
  try {
    const res = await fetch("/api/runtime-config");
    const data = (await res.json()) as RuntimeConfigResponse & { error?: string };
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

/** Status-only helper (same GET; ignores config). */
export async function fetchRuntimeStatus(): Promise<RuntimeSyncStatus> {
  const full = await fetchRuntimeConfig();
  const { config: _c, ...rest } = full;
  return rest;
}
