/**
 * SSRF-safe HTTP client for Location Action mode=http.
 * Template placeholders: {{lat}} {{lon}} {{tag}} {{userId}} {{query}}
 * Secret refs: {{secret:ENV_NAME}} resolved server-side from process.env only.
 */

import { lookup } from "dns/promises";
import net from "net";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

export type LocationHttpConfig = {
  method: HttpMethod;
  urlTemplate: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  timeoutMs?: number;
};

export type TemplateVars = {
  lat: number;
  lon: number;
  tag?: string;
  userId?: string;
  query?: string;
};

export type SafeFetchResult =
  | { ok: true; status: number; bodyText: string; json: unknown }
  | { ok: false; error: string; status?: number };

const MAX_BODY_BYTES = 1_500_000; // ~1.5 MB after stripping heavy geo fields
/** Upstream may send multi-MB WKT polygons (e.g. LDD SearchPlant). Read up to this, then strip. */
const MAX_RAW_BODY_BYTES = 12_000_000;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 0; // no redirects (safer)

const SECRET_RE = /\{\{\s*secret:([A-Z][A-Z0-9_]*)\s*\}\}/gi;
const VAR_RE = /\{\{\s*(lat|lon|lng|tag|userId|query)\s*\}\}/gi;

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  let out = tpl || "";
  out = out.replace(SECRET_RE, (_m, envName: string) => {
    const v = process.env[envName];
    if (v == null || v === "") {
      throw new Error(`secret env ${envName} is not set`);
    }
    return v;
  });
  out = out.replace(VAR_RE, (_m, key: string) => {
    const k = key.toLowerCase();
    if (k === "lat") return String(vars.lat);
    if (k === "lon" || k === "lng") return String(vars.lon);
    if (k === "tag") return encodeURIComponent(vars.tag || "");
    if (k === "userid") return encodeURIComponent(vars.userId || "");
    if (k === "query") return encodeURIComponent(vars.query || "");
    return "";
  });
  return out;
}

/** Render without URL-encoding (for JSON body). */
export function renderTemplateRaw(tpl: string, vars: TemplateVars): string {
  let out = tpl || "";
  out = out.replace(SECRET_RE, (_m, envName: string) => {
    const v = process.env[envName];
    if (v == null || v === "") {
      throw new Error(`secret env ${envName} is not set`);
    }
    return v;
  });
  out = out.replace(VAR_RE, (_m, key: string) => {
    const k = key.toLowerCase();
    if (k === "lat") return String(vars.lat);
    if (k === "lon" || k === "lng") return String(vars.lon);
    if (k === "tag") return vars.tag || "";
    if (k === "userid") return vars.userId || "";
    if (k === "query") return vars.query || "";
    return "";
  });
  return out;
}

function isPrivateOrBlockedIp(ip: string): boolean {
  const v = (ip || "").trim().toLowerCase();
  if (!v) return true;

  // IPv4-mapped IPv6
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrBlockedIp(mapped[1]!);

  if (net.isIPv4(v)) {
    const parts = v.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b != null && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b != null && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    return false;
  }

  if (net.isIPv6(v)) {
    if (v === "::1" || v === "::") return true;
    // Unique local fc00::/7, link-local fe80::/10
    if (v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb"))
      return true;
    // IPv4-compatible / documentation
    if (v.startsWith("2001:db8:")) return true;
    return false;
  }

  return true; // unknown → block
}

function assertAllowedHostname(hostname: string): void {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) throw new Error("SSRF blocked: empty host");
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") {
    throw new Error("SSRF blocked: localhost");
  }
  if (h === "metadata.google.internal" || h === "metadata") {
    throw new Error("SSRF blocked: cloud metadata");
  }
  // Literal IP in hostname
  if (net.isIP(h) && isPrivateOrBlockedIp(h)) {
    throw new Error(`SSRF blocked: private IP ${h}`);
  }
}

async function resolveAndAssertPublic(hostname: string): Promise<string[]> {
  assertAllowedHostname(hostname);
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new Error(`SSRF blocked: private IP ${hostname}`);
    }
    return [hostname];
  }
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DNS lookup failed: ${msg}`);
  }
  if (!records.length) throw new Error("SSRF blocked: no DNS records");
  const ips = records.map((r) => r.address);
  for (const ip of ips) {
    if (isPrivateOrBlockedIp(ip)) {
      throw new Error(`SSRF blocked: resolves to private IP ${ip}`);
    }
  }
  return ips;
}


const HEAVY_GEO_KEYS = new Set([
  "geometrytext",
  "geometry",
  "geom",
  "wkt",
  "the_geom",
]);

/** Drop multi-MB WKT / geometry string fields from JSON text before parse. */
export function stripHeavyGeoJsonFields(bodyText: string): string {
  if (!bodyText || bodyText.length < 64) return bodyText;
  // "geometryText":"<possibly huge WKT>"
  return bodyText.replace(
    /"(geometryText|geometry|geom|wkt|the_geom)"\s*:\s*"(?:\\.|[^"\\])*"/gi,
    '"$1":""'
  );
}

export function stripHeavyGeoFromParsed(json: unknown): unknown {
  if (Array.isArray(json)) {
    return json.map((x) => stripHeavyGeoFromParsed(x));
  }
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (HEAVY_GEO_KEYS.has(k.toLowerCase())) continue;
      out[k] = stripHeavyGeoFromParsed(v);
    }
    return out;
  }
  return json;
}

export async function safeLocationFetch(
  cfg: LocationHttpConfig,
  vars: TemplateVars
): Promise<SafeFetchResult> {
  const method = (cfg.method || "GET").toUpperCase() as HttpMethod;
  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) {
    return { ok: false, error: `Unsupported method ${method}` };
  }
  if (!cfg.urlTemplate?.trim()) {
    return { ok: false, error: "http.urlTemplate is required" };
  }

  let urlStr: string;
  try {
    urlStr = renderTemplate(cfg.urlTemplate.trim(), vars);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, error: "Invalid URL after template render" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http/https allowed" };
  }
  // Prefer https in production; still allow http for private lab APIs that pass SSRF
  if (url.username || url.password) {
    return { ok: false, error: "SSRF blocked: URL credentials not allowed" };
  }

  try {
    await resolveAndAssertPublic(url.hostname);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "User-Agent": "Softnix-LineDev-LocationAction/1.0",
  };
  if (cfg.headers && typeof cfg.headers === "object") {
    for (const [k, v] of Object.entries(cfg.headers)) {
      if (!k || typeof v !== "string") continue;
      try {
        headers[k] = renderTemplateRaw(v, vars);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  let body: string | undefined;
  if (method !== "GET" && cfg.bodyTemplate != null && cfg.bodyTemplate !== "") {
    try {
      body = renderTemplateRaw(cfg.bodyTemplate, vars);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const timeoutMs = Math.min(
    30000,
    Math.max(1000, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Re-check DNS right before connect (TOCTOU)
    await resolveAndAssertPublic(url.hostname);

    const res = await fetch(url.toString(), {
      method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        error: `SSRF blocked: redirects not allowed (${res.status})`,
        status: res.status,
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_RAW_BODY_BYTES) {
      return {
        ok: false,
        error: `Response body too large (>${MAX_RAW_BODY_BYTES} bytes)`,
        status: res.status,
      };
    }
    // LDD SearchPlant embeds multi-MB POLYGON WKT — strip before size/parse.
    const bodyText = stripHeavyGeoJsonFields(buf.toString("utf8"));
    if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
      return {
        ok: false,
        error: `Response body too large after geo strip (>${MAX_BODY_BYTES} bytes)`,
        status: res.status,
      };
    }
    let json: unknown = null;
    try {
      json = bodyText ? stripHeavyGeoFromParsed(JSON.parse(bodyText)) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `Upstream HTTP ${res.status}`,
        status: res.status,
      };
    }

    void MAX_REDIRECTS; // documented policy
    return { ok: true, status: res.status, bodyText, json };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timeout after ${timeoutMs}ms`
          : err.message
        : String(err);
    return { ok: false, error: `HTTP fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Test helper / unit: expose IP check */
export function __testIsBlockedIp(ip: string): boolean {
  return isPrivateOrBlockedIp(ip);
}
