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

/** Push console agent/line/templates to server for webhook use. */
export async function syncRuntimeConfig(
  state: ConsoleState
): Promise<RuntimeSyncStatus> {
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
