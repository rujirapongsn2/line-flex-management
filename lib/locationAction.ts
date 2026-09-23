/**
 * Location Action dispatcher: longdo_poi | http | none → LocationActionResult
 */

import type { LongdoPoi } from "./longdo";
import {
  defaultNearbyTags,
  getLongdoApiKey,
  resolveSearchTag,
  searchLongdoNearby,
} from "./longdo";
import {
  safeLocationFetch,
  type HttpMethod,
  type LocationHttpConfig,
} from "./locationHttp";
import { buildNearbyResultsFlex } from "./nearbyFlex";
import type { FlexMessage, LocationActionConfig, LocationActionMode } from "./types";
import { defaultLocationAction } from "./types";

export type LocationActionInput = {
  lat: number;
  lon: number;
  tag?: string;
  intent?: string;
  query?: string;
  userId?: string;
  displayName?: string;
  limit?: number;
  span?: string;
};

export type LocationActionItem = {
  id?: string;
  name: string;
  lat?: number;
  lon?: number;
  address?: string;
  tel?: string;
  distance?: string | number;
  tags?: string[];
  url?: string;
  raw?: unknown;
};

export type LocationActionResult = {
  ok: boolean;
  mode: LocationActionMode;
  lat: number;
  lon: number;
  tag?: string;
  items: LocationActionItem[];
  count: number;
  summaryText: string;
  /** Optional Flex for nearby_results fallback / longdo */
  flex?: FlexMessage;
  raw?: unknown;
  error?: string;
  needLongdoKey?: boolean;
};

function parseLocationAction(
  raw: unknown
): LocationActionConfig {
  const base = defaultLocationAction();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const modeRaw = String(o.mode || "").trim() as LocationActionMode;
  const mode: LocationActionMode =
    modeRaw === "http" || modeRaw === "none" || modeRaw === "longdo_poi"
      ? modeRaw
      : "longdo_poi";

  const longdo =
    o.longdo && typeof o.longdo === "object"
      ? {
          defaultTags:
            typeof (o.longdo as { defaultTags?: unknown }).defaultTags ===
            "string"
              ? (o.longdo as { defaultTags: string }).defaultTags
              : undefined,
          limit:
            typeof (o.longdo as { limit?: unknown }).limit === "number"
              ? (o.longdo as { limit: number }).limit
              : undefined,
          span:
            typeof (o.longdo as { span?: unknown }).span === "string"
              ? (o.longdo as { span: string }).span
              : undefined,
        }
      : base.longdo;

  let http: LocationActionConfig["http"] = base.http;
  if (o.http && typeof o.http === "object") {
    const h = o.http as Record<string, unknown>;
    const method = String(h.method || "GET").toUpperCase() as HttpMethod;
    http = {
      method: ["GET", "POST", "PUT", "PATCH"].includes(method)
        ? method
        : "GET",
      urlTemplate: typeof h.urlTemplate === "string" ? h.urlTemplate : "",
      headers:
        h.headers && typeof h.headers === "object" && !Array.isArray(h.headers)
          ? (h.headers as Record<string, string>)
          : undefined,
      bodyTemplate:
        typeof h.bodyTemplate === "string" ? h.bodyTemplate : undefined,
      timeoutMs:
        typeof h.timeoutMs === "number" ? h.timeoutMs : undefined,
    };
  }

  const replyIn =
    o.reply && typeof o.reply === "object"
      ? (o.reply as Record<string, unknown>)
      : {};
  const reply = {
    useLlm: replyIn.useLlm !== false,
    fallbackFlexKey:
      typeof replyIn.fallbackFlexKey === "string" && replyIn.fallbackFlexKey
        ? replyIn.fallbackFlexKey
        : "nearby_results",
  };

  return { mode, longdo, http, reply };
}

export function parseLocationActionJson(
  jsonStr: string | null | undefined
): LocationActionConfig {
  if (!jsonStr || !String(jsonStr).trim()) return defaultLocationAction();
  try {
    return parseLocationAction(JSON.parse(String(jsonStr)));
  } catch {
    return defaultLocationAction();
  }
}

export function serializeLocationAction(
  cfg: LocationActionConfig
): string {
  return JSON.stringify(cfg);
}

/** Strip secrets from config for admin UI / public APIs. */
export function publicLocationActionView(
  cfg: LocationActionConfig
): LocationActionConfig {
  const copy: LocationActionConfig = JSON.parse(JSON.stringify(cfg));
  // Do not expose secret values — templates may contain {{secret:X}} refs which are OK
  // Never include resolved secrets. urlTemplate stays as template string.
  return copy;
}

function poisToItems(pois: LongdoPoi[]): LocationActionItem[] {
  return pois.map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    address: p.address,
    tel: p.tel,
    distance: p.distance,
    tags: p.tags,
    url: p.url,
  }));
}

function summarizeItems(
  mode: LocationActionMode,
  items: LocationActionItem[],
  lat: number,
  lon: number,
  tag?: string
): string {
  if (mode === "none") {
    return `ผู้ใช้แชร์พิกัด lat=${lat.toFixed(6)}, lon=${lon.toFixed(6)} (ไม่มี action ภายนอก)`;
  }
  if (!items.length) {
    return tag
      ? `ไม่พบสถานที่ใกล้เคียง (tag=${tag}) ที่ lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}`
      : `ไม่พบรายการใกล้เคียงที่ lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}`;
  }
  const lines = items.slice(0, 12).map((it, i) => {
    const dist =
      it.distance != null ? ` · ${String(it.distance)}` : "";
    const addr = it.address ? ` — ${it.address}` : "";
    return `${i + 1}. ${it.name}${dist}${addr}`;
  });
  const head = tag
    ? `พบ ${items.length} แห่งใกล้เคียง (tag=${tag}):`
    : `พบ ${items.length} รายการ:`;
  return `${head}\n${lines.join("\n")}`;
}

function normalizeHttpPayload(json: unknown, bodyText: string): LocationActionItem[] {
  if (json == null) {
    if (!bodyText.trim()) return [];
    return [{ name: bodyText.slice(0, 200), raw: bodyText.slice(0, 500) }];
  }
  if (Array.isArray(json)) {
    return json.map((item, i) => normalizeOne(item, i)).filter(Boolean) as LocationActionItem[];
  }
  if (typeof json === "object") {
    const root = json as Record<string, unknown>;
    const list =
      (Array.isArray(root.items) && root.items) ||
      (Array.isArray(root.data) && root.data) ||
      (Array.isArray(root.results) && root.results) ||
      (Array.isArray(root.pois) && root.pois) ||
      null;
    if (list) {
      return list
        .map((item, i) => normalizeOne(item, i))
        .filter(Boolean) as LocationActionItem[];
    }
    if (typeof root.name === "string" || typeof root.title === "string") {
      const one = normalizeOne(root, 0);
      return one ? [one] : [];
    }
    if (typeof root.message === "string" || typeof root.summary === "string") {
      return [
        {
          name: String(root.message || root.summary),
          raw: root,
        },
      ];
    }
  }
  if (typeof json === "string") {
    return [{ name: json.slice(0, 200), raw: json.slice(0, 500) }];
  }
  return [{ name: "HTTP result", raw: json }];
}

function normalizeOne(item: unknown, index: number): LocationActionItem | null {
  if (item == null) return null;
  if (typeof item === "string") {
    return { name: item.slice(0, 200) };
  }
  if (typeof item !== "object") {
    return { name: String(item) };
  }
  const o = item as Record<string, unknown>;
  const name = String(o.name || o.title || o.label || `item-${index + 1}`).trim();
  if (!name) return null;
  const lat = Number(o.lat ?? o.latitude);
  const lon = Number(o.lon ?? o.lng ?? o.longitude);
  return {
    id: o.id != null ? String(o.id) : undefined,
    name,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    address: o.address != null ? String(o.address) : undefined,
    tel: o.tel != null ? String(o.tel) : o.phone != null ? String(o.phone) : undefined,
    distance: (o.distance as string | number | undefined) ?? undefined,
    tags: Array.isArray(o.tags) ? o.tags.map(String) : undefined,
    url: o.url != null ? String(o.url) : undefined,
    raw: item,
  };
}

export async function runLocationAction(opts: {
  config: LocationActionConfig;
  input: LocationActionInput;
  /** Runtime / env Longdo key */
  longdoApiKey?: string | null;
}): Promise<LocationActionResult> {
  const cfg = parseLocationAction(opts.config);
  const { lat, lon } = opts.input;
  const mode = cfg.mode;

  if (mode === "none") {
    const summaryText = summarizeItems(mode, [], lat, lon);
    return {
      ok: true,
      mode,
      lat,
      lon,
      items: [],
      count: 0,
      summaryText,
      raw: { coords: { lat, lon } },
    };
  }

  if (mode === "http") {
    const httpCfg = cfg.http;
    if (!httpCfg?.urlTemplate?.trim()) {
      return {
        ok: false,
        mode,
        lat,
        lon,
        items: [],
        count: 0,
        summaryText: "",
        error: "mode=http แต่ยังไม่ได้ตั้ง urlTemplate",
      };
    }
    const fetchCfg: LocationHttpConfig = {
      method: httpCfg.method,
      urlTemplate: httpCfg.urlTemplate,
      headers: httpCfg.headers,
      bodyTemplate: httpCfg.bodyTemplate,
      timeoutMs: httpCfg.timeoutMs,
    };
    const tag =
      (opts.input.tag || "").trim() ||
      resolveSearchTag({
        tag: opts.input.tag,
        intent: opts.input.intent || opts.input.query,
        useDefaultIfEmpty: false,
      });
    const fetched = await safeLocationFetch(fetchCfg, {
      lat,
      lon,
      tag,
      userId: opts.input.userId,
      query: opts.input.query || opts.input.intent || tag,
    });
    if (!fetched.ok) {
      return {
        ok: false,
        mode,
        lat,
        lon,
        tag: tag || undefined,
        items: [],
        count: 0,
        summaryText: "",
        error: fetched.error,
        raw: { status: fetched.status },
      };
    }
    const items = normalizeHttpPayload(fetched.json, fetched.bodyText);
    const summaryText = summarizeItems(mode, items, lat, lon, tag || undefined);
    let flex: FlexMessage | undefined;
    // Build flex only when items look like POIs with coords
    const poiLike = items.filter(
      (it) =>
        it.name &&
        typeof it.lat === "number" &&
        typeof it.lon === "number" &&
        Number.isFinite(it.lat) &&
        Number.isFinite(it.lon)
    );
    if (poiLike.length > 0) {
      flex = buildNearbyResultsFlex({
        pois: poiLike.map((it) => ({
          id: it.id,
          name: it.name,
          lat: it.lat!,
          lon: it.lon!,
          address: it.address,
          tel: it.tel,
          distance: it.distance,
          tags: it.tags,
          url: it.url,
        })),
        tag: tag || "http",
        lat,
        lon,
      });
    }
    return {
      ok: true,
      mode,
      lat,
      lon,
      tag: tag || undefined,
      items,
      count: items.length,
      summaryText,
      flex,
      raw: fetched.json ?? fetched.bodyText.slice(0, 2000),
    };
  }

  // longdo_poi (default)
  const apiKey = getLongdoApiKey(opts.longdoApiKey);
  if (!apiKey) {
    return {
      ok: false,
      mode: "longdo_poi",
      lat,
      lon,
      items: [],
      count: 0,
      summaryText: "",
      error:
        "ยังไม่ได้ตั้ง LONGDO_API_KEY — ให้แอดมินใส่ใน .env (หรือหน้าเชื่อม LINE) แล้ว restart container softnix-linedev",
      needLongdoKey: true,
    };
  }

  const defaultTags =
    (cfg.longdo?.defaultTags || "").trim() || defaultNearbyTags();
  const tag = resolveSearchTag({
    tag: opts.input.tag,
    intent: opts.input.intent || opts.input.query,
    useDefaultIfEmpty: true,
  });
  // If resolve fell back to env defaults, prefer config.longdo.defaultTags when no intent
  const effectiveTag =
    (opts.input.tag || "").trim() ||
    resolveSearchTag({
      tag: opts.input.tag,
      intent: opts.input.intent || opts.input.query,
      useDefaultIfEmpty: false,
    }) ||
    defaultTags;

  const limit = Math.min(
    20,
    Math.max(1, opts.input.limit ?? cfg.longdo?.limit ?? 10)
  );
  const span =
    (opts.input.span || cfg.longdo?.span || "1000m").trim() || "1000m";

  void tag; // kept for clarity; effectiveTag used
  const search = await searchLongdoNearby(
    { lat, lon, tag: effectiveTag, limit, span },
    apiKey
  );
  if (!search.ok) {
    return {
      ok: false,
      mode: "longdo_poi",
      lat,
      lon,
      tag: effectiveTag,
      items: [],
      count: 0,
      summaryText: "",
      error: search.error,
    };
  }

  const items = poisToItems(search.pois);
  const flex = buildNearbyResultsFlex({
    pois: search.pois,
    tag: effectiveTag,
    lat,
    lon,
  });
  const summaryText = summarizeItems(
    "longdo_poi",
    items,
    lat,
    lon,
    effectiveTag
  );

  return {
    ok: true,
    mode: "longdo_poi",
    lat,
    lon,
    tag: effectiveTag,
    items,
    count: items.length,
    summaryText,
    flex,
    raw: search.rawMeta,
  };
}

export { parseLocationAction };
