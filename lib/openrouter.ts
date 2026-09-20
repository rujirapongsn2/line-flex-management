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

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}

export function getDefaultBaseUrl(): string {
  return DEFAULT_BASE;
}

function completionsUrl(baseUrl?: string): string {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

export async function chatCompletion(
  apiKey: string,
  body: OpenRouterChatRequest,
  opts?: { baseUrl?: string }
): Promise<OpenRouterChatResponse> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("API key is required");
  }

  const endpoint = completionsUrl(opts?.baseUrl);
  const isOpenRouter = /openrouter\.ai/i.test(endpoint);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    // Cloudflare / Softnix GenAI often block bare fetch without UA (error 1010)
    "User-Agent": "FMM-by-Softnix/1.0 (+https://line.rujirapong.us)",
  };
  if (isOpenRouter) {
    headers["HTTP-Referer"] = "https://line.rujirapong.us";
    headers["X-Title"] = "FMM by Softnix";
  }

  const payload = { ...body, stream: false };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

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
