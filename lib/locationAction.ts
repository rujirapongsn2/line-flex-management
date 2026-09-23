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
import type {
  FlexMessage,
  LocationActionConfig,
  LocationActionMode,
  LocationHttpEndpoint,
  LocationHttpMapper,
} from "./types";
import { defaultLocationAction } from "./types";
import { mapIntentToLddTag } from "./nearbyIntent";

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
    const endpointsRaw = Array.isArray(h.endpoints) ? h.endpoints : [];
    const endpoints: LocationHttpEndpoint[] = [];
    for (const ep of endpointsRaw) {
      if (!ep || typeof ep !== "object") continue;
      const e = ep as Record<string, unknown>;
      const id = String(e.id || "").trim();
      const urlTemplate = typeof e.urlTemplate === "string" ? e.urlTemplate : "";
      if (!id || !urlTemplate.trim()) continue;
      const em = String(e.method || method || "GET").toUpperCase() as HttpMethod;
      const mapperRaw = String(e.mapper || "generic").trim() as LocationHttpMapper;
      const mapper: LocationHttpMapper =
        mapperRaw === "ldd_soil" ||
        mapperRaw === "ldd_plant" ||
        mapperRaw === "ldd_pool" ||
        mapperRaw === "generic"
          ? mapperRaw
          : "generic";
      const matchIn =
        e.match && typeof e.match === "object"
          ? (e.match as Record<string, unknown>)
          : {};
      endpoints.push({
        id,
        label: typeof e.label === "string" ? e.label : undefined,
        method: ["GET", "POST", "PUT", "PATCH"].includes(em) ? em : "GET",
        urlTemplate,
        headers:
          e.headers && typeof e.headers === "object" && !Array.isArray(e.headers)
            ? (e.headers as Record<string, string>)
            : undefined,
        bodyTemplate:
          typeof e.bodyTemplate === "string" ? e.bodyTemplate : undefined,
        timeoutMs: typeof e.timeoutMs === "number" ? e.timeoutMs : undefined,
        mapper,
        match: {
          tags: Array.isArray(matchIn.tags)
            ? matchIn.tags.map(String)
            : undefined,
          keywords: Array.isArray(matchIn.keywords)
            ? matchIn.keywords.map(String)
            : undefined,
        },
      });
    }
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
      sharedHeaders:
        h.sharedHeaders &&
        typeof h.sharedHeaders === "object" &&
        !Array.isArray(h.sharedHeaders)
          ? (h.sharedHeaders as Record<string, string>)
          : h.headers && typeof h.headers === "object" && !Array.isArray(h.headers)
            ? (h.headers as Record<string, string>)
            : undefined,
      defaultEndpointId:
        typeof h.defaultEndpointId === "string" ? h.defaultEndpointId : "",
      endpoints,
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


function placeBits(o: Record<string, unknown>): string[] {
  return [
    o.tamName != null && String(o.tamName).trim()
      ? `ต.${String(o.tamName).trim()}`
      : null,
    o.ampName != null && String(o.ampName).trim()
      ? `อ.${String(o.ampName).trim()}`
      : null,
    o.provName != null && String(o.provName).trim()
      ? `จ.${String(o.provName).trim()}`
      : null,
  ].filter(Boolean) as string[];
}

/** Pick HTTP endpoint: explicit tag → keyword match → default → first/legacy. */
export function resolveHttpEndpoint(
  http: NonNullable<LocationActionConfig["http"]>,
  opts: { tag?: string; intent?: string; query?: string }
): { endpoint: LocationHttpEndpoint; reason: string } | null {
  const endpoints = Array.isArray(http.endpoints) ? http.endpoints : [];
  const tag = (opts.tag || "").trim().toLowerCase();
  const blob = `${opts.tag || ""} ${opts.intent || ""} ${opts.query || ""}`
    .trim()
    .toLowerCase();

  if (endpoints.length) {
    if (tag) {
      const byId = endpoints.find((e) => e.id.toLowerCase() === tag);
      if (byId) return { endpoint: byId, reason: "tag:id" };
      const byMatchTag = endpoints.find((e) =>
        (e.match?.tags || []).some((t) => t.toLowerCase() === tag)
      );
      if (byMatchTag) return { endpoint: byMatchTag, reason: "tag:match.tags" };
    }
    if (blob) {
      for (const e of endpoints) {
        const kws = e.match?.keywords || [];
        if (kws.some((k) => k && blob.includes(String(k).toLowerCase()))) {
          return { endpoint: e, reason: "keyword" };
        }
      }
      const ldd = mapIntentToLddTag(blob);
      if (ldd) {
        const byLdd = endpoints.find((e) => e.id.toLowerCase() === ldd);
        if (byLdd) return { endpoint: byLdd, reason: "ldd-intent" };
      }
    }
    const defId = (http.defaultEndpointId || "").trim().toLowerCase();
    if (defId) {
      const byDef = endpoints.find((e) => e.id.toLowerCase() === defId);
      if (byDef) return { endpoint: byDef, reason: "defaultEndpointId" };
    }
    return { endpoint: endpoints[0], reason: "first-endpoint" };
  }

  // Legacy single urlTemplate
  if ((http.urlTemplate || "").trim()) {
    const legacy: LocationHttpEndpoint = {
      id: "legacy",
      label: "legacy",
      method: http.method,
      urlTemplate: http.urlTemplate,
      headers: http.headers,
      bodyTemplate: http.bodyTemplate,
      timeoutMs: http.timeoutMs,
      mapper: "generic",
    };
    return { endpoint: legacy, reason: "legacy-urlTemplate" };
  }
  return null;
}

function normalizeHttpPayload(json: unknown, bodyText: string, mapper: LocationHttpMapper = "generic"): LocationActionItem[] {
  if (json == null) {
    if (!bodyText.trim()) return [];
    return [{ name: bodyText.slice(0, 200), raw: bodyText.slice(0, 500) }];
  }
  if (Array.isArray(json)) {
    return json.map((item, i) => normalizeOne(item, i, mapper)).filter(Boolean) as LocationActionItem[];
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
        .map((item, i) => normalizeOne(item, i, mapper))
        .filter(Boolean) as LocationActionItem[];
    }
    if (typeof root.name === "string" || typeof root.title === "string") {
      const one = normalizeOne(root, 0, mapper);
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

function detectMapper(o: Record<string, unknown>, hint: LocationHttpMapper): LocationHttpMapper {
  if (hint && hint !== "generic") return hint;
  if (o.SOILSERIES != null || o.SOILGROUP != null || o.FERTILITY != null) return "ldd_soil";
  if (o.plantName != null || o.landSuitCF != null) return "ldd_plant";
  if (o.codeDig != null || o.levelDig != null || o.AreaWaterSupplyIN != null) return "ldd_pool";
  return "generic";
}

function soilParcelName(o: Record<string, unknown>, index: number): string {
  const series =
    o.SOILSERIES != null && String(o.SOILSERIES).trim()
      ? `ชุดดิน ${String(o.SOILSERIES).trim()}`
      : null;
  const parts = [series, ...placeBits(o)].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `แปลงดิน ${index + 1}`;
}

function soilParcelAddress(o: Record<string, unknown>): string | undefined {
  const bits = [
    o.SOILGROUP != null ? `กลุ่มดิน ${o.SOILGROUP}` : null,
    o.FERTILITY != null ? `ความอุดมสมบูรณ์ ${o.FERTILITY}` : null,
    o.DRAINAGE != null ? `การระบายน้ำ ${o.DRAINAGE}` : null,
    o.pH_TOP != null ? `pH บน ${o.pH_TOP}` : null,
    o.pH_LOW != null ? `pH ล่าง ${o.pH_LOW}` : null,
    o.DEPTH != null ? `ความลึก ${o.DEPTH}` : null,
    o.CEC_TOP != null ? `CEC บน ${o.CEC_TOP}` : null,
    o.EC != null ? `EC ${o.EC}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : undefined;
}

function plantParcelName(o: Record<string, unknown>, index: number): string {
  const plant =
    o.plantName != null && String(o.plantName).trim()
      ? String(o.plantName).trim()
      : null;
  const suit =
    o.landSuitCF != null && String(o.landSuitCF).trim()
      ? `ความเหมาะสม ${String(o.landSuitCF).trim()}`
      : null;
  const parts = [plant, suit, ...placeBits(o)].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `พืช ${index + 1}`;
}

function plantParcelAddress(o: Record<string, unknown>): string | undefined {
  const bits = [
    o.landSuitCF != null ? `ชั้นความเหมาะสม ${o.landSuitCF}` : null,
    ...placeBits(o),
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : undefined;
}

function poolParcelName(o: Record<string, unknown>, index: number): string {
  const level =
    o.levelDig != null && String(o.levelDig).trim()
      ? `ระดับน้ำ ${String(o.levelDig).trim()}`
      : null;
  const code =
    o.codeDig != null && String(o.codeDig).trim()
      ? `รหัส ${String(o.codeDig).trim()}`
      : null;
  const parts = [level || code, ...placeBits(o)].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `แหล่งน้ำ ${index + 1}`;
}

function poolParcelAddress(o: Record<string, unknown>): string | undefined {
  const bits = [
    o.codeDig != null ? `รหัส ${o.codeDig}` : null,
    o.levelDig != null ? `ระดับ ${o.levelDig}` : null,
    o.AreaWaterSupplyIN != null ? `พื้นที่ให้น้ำ ${o.AreaWaterSupplyIN}` : null,
    ...placeBits(o),
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : undefined;
}

function normalizeOne(
  item: unknown,
  index: number,
  mapperHint: LocationHttpMapper = "generic"
): LocationActionItem | null {
  if (item == null) return null;
  if (typeof item === "string") {
    return { name: item.slice(0, 200) };
  }
  if (typeof item !== "object") {
    return { name: String(item) };
  }
  const o = item as Record<string, unknown>;
  const mapper = detectMapper(o, mapperHint);
  let mappedName = "";
  let mappedAddress: string | undefined;
  if (mapper === "ldd_soil") {
    mappedName = soilParcelName(o, index);
    mappedAddress = soilParcelAddress(o);
  } else if (mapper === "ldd_plant") {
    mappedName = plantParcelName(o, index);
    mappedAddress = plantParcelAddress(o);
  } else if (mapper === "ldd_pool") {
    mappedName = poolParcelName(o, index);
    mappedAddress = poolParcelAddress(o);
  } else if (
    o.SOILSERIES != null ||
    o.plantName != null ||
    o.levelDig != null ||
    o.provName != null
  ) {
    // generic fallback for LDD-shaped rows without explicit mapper
    if (o.plantName != null) {
      mappedName = plantParcelName(o, index);
      mappedAddress = plantParcelAddress(o);
    } else if (o.SOILSERIES != null || o.SOILGROUP != null) {
      mappedName = soilParcelName(o, index);
      mappedAddress = soilParcelAddress(o);
    } else if (o.levelDig != null || o.codeDig != null) {
      mappedName = poolParcelName(o, index);
      mappedAddress = poolParcelAddress(o);
    } else if (placeBits(o).length) {
      mappedName = placeBits(o).join(" · ");
    }
  }
  const name = String(
    o.name || o.title || o.label || mappedName || `item-${index + 1}`
  ).trim();
  if (!name) return null;
  const lat = Number(o.lat ?? o.latitude);
  const lon = Number(o.lon ?? o.lng ?? o.longitude);
  const address =
    o.address != null ? String(o.address) : mappedAddress;
  return {
    id: o.id != null ? String(o.id) : undefined,
    name,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    address,
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
    const httpCfg = cfg.http || defaultLocationAction().http!;
    const tag =
      (opts.input.tag || "").trim() ||
      mapIntentToLddTag(
        `${opts.input.intent || ""} ${opts.input.query || ""}`
      ) ||
      resolveSearchTag({
        tag: opts.input.tag,
        intent: opts.input.intent || opts.input.query,
        useDefaultIfEmpty: false,
      });
    const resolved = resolveHttpEndpoint(httpCfg, {
      tag,
      intent: opts.input.intent,
      query: opts.input.query,
    });
    if (!resolved) {
      return {
        ok: false,
        mode,
        lat,
        lon,
        items: [],
        count: 0,
        summaryText: "",
        error:
          "mode=http แต่ยังไม่มี endpoint (ตั้ง endpoints[] หรือ urlTemplate)",
      };
    }
    const ep = resolved.endpoint;
    const mergedHeaders: Record<string, string> = {
      ...(httpCfg.sharedHeaders || {}),
      ...(httpCfg.headers || {}),
      ...(ep.headers || {}),
    };
    const fetchCfg: LocationHttpConfig = {
      method: ep.method || httpCfg.method || "GET",
      urlTemplate: ep.urlTemplate,
      headers: mergedHeaders,
      bodyTemplate:
        ep.bodyTemplate != null && ep.bodyTemplate !== ""
          ? ep.bodyTemplate
          : httpCfg.bodyTemplate,
      timeoutMs: ep.timeoutMs ?? httpCfg.timeoutMs,
    };
    const fetched = await safeLocationFetch(fetchCfg, {
      lat,
      lon,
      tag: tag || ep.id,
      userId: opts.input.userId,
      query: opts.input.query || opts.input.intent || tag || ep.id,
    });
    if (!fetched.ok) {
      return {
        ok: false,
        mode,
        lat,
        lon,
        tag: tag || ep.id,
        items: [],
        count: 0,
        summaryText: "",
        error: fetched.error,
        raw: { status: fetched.status, endpointId: ep.id, reason: resolved.reason },
      };
    }
    const mapper: LocationHttpMapper = ep.mapper || "generic";
    const items = normalizeHttpPayload(fetched.json, fetched.bodyText, mapper);
    const summaryText = summarizeItems(
      mode,
      items,
      lat,
      lon,
      tag || ep.id || undefined
    );
    let flex: FlexMessage | undefined;
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
        tag: tag || ep.id || "http",
        lat,
        lon,
      });
    }
    return {
      ok: true,
      mode,
      lat,
      lon,
      tag: tag || ep.id || undefined,
      items,
      count: items.length,
      summaryText,
      flex,
      raw: {
        endpointId: ep.id,
        reason: resolved.reason,
        mapper,
        payload: fetched.json ?? fetched.bodyText.slice(0, 2000),
      },
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
