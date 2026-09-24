export type OpenRouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenRouterChatRequest = {
  model: string;
  messages: OpenRouterMessage[];
  tools?: OpenRouterTool[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
};

export type OpenRouterChoice = {
  index: number;
  message: OpenRouterMessage;
  finish_reason: string | null;
};

export type OpenRouterChatResponse = {
  id?: string;
  choices: OpenRouterChoice[];
  model?: string;
  usage?: unknown;
  error?: { message?: string; code?: number };
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE = "https://openrouter.ai/api/v1";
/** Default LLM HTTP timeout (ms). Override with LLM_TIMEOUT_MS. */
const DEFAULT_TIMEOUT_MS = 90_000;

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}

export function getDefaultBaseUrl(): string {
  return DEFAULT_BASE;
}

export function getLlmTimeoutMs(): number {
  const raw = (process.env.LLM_TIMEOUT_MS || "").trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5_000) return Math.floor(n);
  }
  return DEFAULT_TIMEOUT_MS;
}

/** Site URL for User-Agent / OpenRouter HTTP-Referer — from PUBLIC_BASE_URL. */
function getAppPublicUrl(): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return "https://softnix.ai";
}

function completionsUrl(baseUrl?: string): string {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; cause?: { name?: string } };
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  if (e.cause?.name === "TimeoutError" || e.cause?.name === "AbortError") return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("aborted") || msg.includes("timed out");
}

export async function chatCompletion(
  apiKey: string,
  body: OpenRouterChatRequest,
  opts?: { baseUrl?: string; timeoutMs?: number }
): Promise<OpenRouterChatResponse> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("API key is required");
  }

  const endpoint = completionsUrl(opts?.baseUrl);
  const isOpenRouter = /openrouter\.ai/i.test(endpoint);
  const publicUrl = getAppPublicUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    // Cloudflare / Softnix GenAI often block bare fetch without UA (error 1010)
    "User-Agent": `Softnix-LineDev/1.0 (+${publicUrl})`,
  };
  if (isOpenRouter) {
    headers["HTTP-Referer"] = publicUrl;
    headers["X-Title"] = "FMM by Softnix";
  }

  const payload = { ...body, stream: false };
  const timeoutMs = opts?.timeoutMs ?? getLlmTimeoutMs();

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      const e = new Error(
        `LLM request timed out after ${timeoutMs}ms — GenAI connection failure`
      ) as Error & { status?: number; code?: string };
      e.code = "LLM_TIMEOUT";
      throw e;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM fetch failed: ${msg}`);
  }

  const text = await res.text();
  let data: OpenRouterChatResponse;
  try {
    data = text ? (JSON.parse(text) as OpenRouterChatResponse) : { choices: [] };
  } catch {
    throw new Error(
      `LLM returned non-JSON (${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    const softnixDetail = (data as { detail?: unknown }).detail;
    const detailStr =
      typeof softnixDetail === "string"
        ? softnixDetail
        : softnixDetail
          ? JSON.stringify(softnixDetail).slice(0, 400)
          : null;
    const msg =
      data.error?.message ||
      detailStr ||
      (typeof (data as { message?: string }).message === "string"
        ? (data as { message?: string }).message
        : null) ||
      text.slice(0, 300) ||
      `LLM HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}
