export type SendMode = "push" | "reply";

export type TemplateId =
  | "bubble-simple"
  | "bubble-hero"
  | "carousel"
  | "product-card"
  | "news-list"
  | "raw-json";

export type FlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

export type TemplateField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "url";
  defaultValue: string;
};

export type TemplateVariable = {
  name: string;
  example: string;
  required: boolean;
};

export type ConsoleTemplate = {
  id: string;
  displayNameTh: string;
  conditionKey: string;
  modelDescription: string;
  triggerExamples: string[];
  variables: TemplateVariable[];
  kind: TemplateId;
  fields: Record<string, string>;
  enabled: boolean;
};

export type AgentConfig = {
  name: string;
  prompt: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
};

/** After LIFF GPS: Longdo POI | custom HTTP | none — then optional LLM LINE reply */
export type LocationActionMode = "longdo_poi" | "http" | "none";

export type LocationHttpMapper =
  | "generic"
  | "ldd_soil"
  | "ldd_plant"
  | "ldd_pool";

export type LocationHttpEndpoint = {
  id: string;
  label?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  urlTemplate: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  timeoutMs?: number;
  /** How to normalize HTTP JSON into LocationActionItem[] */
  mapper?: LocationHttpMapper;
  match?: { tags?: string[]; keywords?: string[] };
};

export type LocationActionConfig = {
  mode: LocationActionMode;
  longdo?: { defaultTags?: string; limit?: number; span?: string };
  http?: {
    /** Legacy single-endpoint fields (still supported). */
    method: "GET" | "POST" | "PUT" | "PATCH";
    urlTemplate: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    timeoutMs?: number;
    /** Shared auth/headers merged into every endpoint (endpoint headers win). */
    sharedHeaders?: Record<string, string>;
    /** Used when tag/intent does not match any endpoint. */
    defaultEndpointId?: string;
    /** Multi-endpoint catalog (preferred). */
    endpoints?: LocationHttpEndpoint[];
  };
  reply?: { useLlm: boolean; fallbackFlexKey?: string };
};

export function defaultLocationAction(): LocationActionConfig {
  return {
    mode: "longdo_poi",
    longdo: { defaultTags: "", limit: 10, span: "1000m" },
    http: {
      method: "GET",
      urlTemplate: "",
      headers: {},
      bodyTemplate: "",
      timeoutMs: 8000,
      sharedHeaders: {},
      defaultEndpointId: "",
      endpoints: [],
    },
    reply: { useLlm: true, fallbackFlexKey: "nearby_results" },
  };
}

export type LineConfig = {
  channelAccessToken: string;
  channelSecret: string;
  webhookConfirmed: boolean;
  /** Optional last-used destination user id for sandbox send */
  lastUserId?: string;
  /** LINE LIFF App ID (optional if LIFF_ID env is set) */
  liffId?: string;
  /** Longdo Map API key (optional if LONGDO_API_KEY env is set) */
  longdoApiKey?: string;
  /** Location Action after LIFF GPS (JSON-backed on server) */
  locationAction?: LocationActionConfig;
};

export type ConsoleState = {
  agent: AgentConfig;
  line: LineConfig;
  templates: ConsoleTemplate[];
};

export const ACCENT = "#2786C2";
export const CONSOLE_STORAGE_KEY = "linedev-console-v1";

/** Legacy keys (migrated once if present) */
export const STORAGE_KEY = "linedev-connection-v1";
export const LLM_STORAGE_KEY = "linedev-llm-v1";

export type PageId =
  | "overview"
  | "agent"
  | "flex"
  | "flex-edit"
  | "line"
  | "sandbox"
  | "profile";
