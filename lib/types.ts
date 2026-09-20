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

export type LineConfig = {
  channelAccessToken: string;
  channelSecret: string;
  webhookConfirmed: boolean;
  /** Optional last-used destination user id for sandbox send */
  lastUserId?: string;
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
