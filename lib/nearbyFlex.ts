import type { FlexMessage } from "./types";
import { ACCENT } from "./types";
import { getLiffOpenUrl } from "./liffConfig";
import type { LongdoPoi } from "./longdo";

export type LocationAskOpts = {
  liffId?: string | null;
  tag?: string | null;
  title?: string;
  body?: string;
  buttonLabel?: string;
};

/** CTA: open LIFF to share GPS for nearby POI search. */
export function buildLocationAskFlex(opts: LocationAskOpts = {}): FlexMessage {
  const tag = (opts.tag || "").trim();
  const uri = getLiffOpenUrl(opts.liffId, tag);
  const title = opts.title || "แชร์พิกัดเพื่อค้นหาใกล้เคียง";
  const body =
    opts.body ||
    (tag
      ? `กดปุ่มด้านล่างเพื่อแชร์ตำแหน่งปัจจุบัน แล้วระบบจะค้นหา «${tag}» ในรัศมีใกล้เคียงให้`
      : "กดปุ่มด้านล่างเพื่อแชร์ตำแหน่งปัจจุบัน แล้วระบบจะค้นหาสถานที่ใกล้เคียงให้");
  const buttonLabel = opts.buttonLabel || "แชร์พิกัดปัจจุบัน";

  return {
    type: "flex",
    altText: tag ? `แชร์พิกัดเพื่อค้นหา ${tag}` : "แชร์พิกัดเพื่อค้นหาใกล้เคียง",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "xl",
            color: ACCENT,
            wrap: true,
          },
          {
            type: "text",
            text: body,
            wrap: true,
            size: "sm",
            color: "#555555",
          },
          ...(tag
            ? [
                {
                  type: "box",
                  layout: "horizontal",
                  margin: "md",
                  contents: [
                    {
                      type: "text",
                      text: `หมวด: ${tag}`,
                      size: "xs",
                      color: ACCENT,
                      weight: "bold",
                    },
                  ],
                },
              ]
            : []),
          {
            type: "text",
            text: "Softnix FMM · Location Action",
            size: "xs",
            color: "#888888",
            margin: "lg",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: ACCENT,
            height: "md",
            action: { type: "uri", label: buttonLabel, uri },
          },
        ],
      },
    },
  };
}

function mapsUri(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

function formatDistance(d: string | number | undefined): string {
  if (d == null || d === "") return "";
  if (typeof d === "number" && Number.isFinite(d)) {
    if (d < 1) return `${Math.round(d * 1000)} ม.`;
    return `${d.toFixed(1)} กม.`;
  }
  const s = String(d);
  return s;
}

/** Flex carousel / bubble list of nearby POIs. */
export function buildNearbyResultsFlex(opts: {
  pois: LongdoPoi[];
  tag?: string;
  lat: number;
  lon: number;
}): FlexMessage {
  const tag = (opts.tag || "").trim();
  const pois = opts.pois.slice(0, 10);

  if (pois.length === 0) {
    return {
      type: "flex",
      altText: tag ? `ไม่พบ ${tag} ใกล้เคียง` : "ไม่พบสถานที่ใกล้เคียง",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "ไม่พบผลลัพธ์",
              weight: "bold",
              size: "lg",
              color: ACCENT,
            },
            {
              type: "text",
              text: tag
                ? `ไม่พบ «${tag}» ในรัศมีที่กำหนด ลองขยายคำค้นหรือระยะ`
                : "ไม่พบสถานที่ใกล้เคียงในรัศมีที่กำหนด",
              wrap: true,
              margin: "md",
              size: "sm",
              color: "#555555",
            },
          ],
        },
      },
    };
  }

  const bubbles = pois.map((p, i) => {
    const dist = formatDistance(p.distance);
    const addr = (p.address || "").trim();
    return {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: `${i + 1}. ${p.name}`.slice(0, 80),
            weight: "bold",
            size: "md",
            color: "#13202F",
            wrap: true,
          },
          ...(dist
            ? [
                {
                  type: "text",
                  text: `ระยะ ≈ ${dist}`,
                  size: "sm",
                  color: ACCENT,
                  weight: "bold",
                },
              ]
            : []),
          ...(addr
            ? [
                {
                  type: "text",
                  text: addr.slice(0, 120),
                  size: "xs",
                  color: "#666666",
                  wrap: true,
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: ACCENT,
            height: "sm",
            action: {
              type: "uri",
              label: "เปิดแผนที่",
              uri: mapsUri(p.lat, p.lon),
            },
          },
        ],
      },
    };
  });

  const alt =
    tag && pois[0]
      ? `${tag} ใกล้คุณ · ${pois[0].name}`
      : `สถานที่ใกล้เคียง ${pois.length} แห่ง`;

  if (bubbles.length === 1) {
    return { type: "flex", altText: alt, contents: bubbles[0]! };
  }

  return {
    type: "flex",
    altText: alt,
    contents: { type: "carousel", contents: bubbles.slice(0, 10) },
  };
}


export type LocationChooserEndpoint = {
  id: string;
  label?: string;
};

export const DEFAULT_LDD_CHOICES: LocationChooserEndpoint[] = [
  { id: "soil", label: "ข้อมูลดิน" },
  { id: "plant", label: "พืชที่เหมาะสม" },
  { id: "pool", label: "แหล่งน้ำ" },
];

/**
 * When Location Action has multiple HTTP endpoints and the user did not specify
 * a type, ask them to pick before opening LIFF (each button carries ?tag=).
 */
export function buildLocationTypeChooserFlex(opts: {
  liffId?: string | null;
  endpoints?: LocationChooserEndpoint[] | null;
  title?: string;
  body?: string;
}): FlexMessage {
  const raw =
    opts.endpoints && opts.endpoints.length > 0
      ? opts.endpoints
      : DEFAULT_LDD_CHOICES;
  const choices = raw
    .map((e) => ({
      id: String(e.id || "").trim(),
      label: (e.label || e.id || "").trim() || e.id,
    }))
    .filter((e) => e.id)
    .slice(0, 4);
  const title = opts.title || "เลือกประเภทข้อมูล";
  const body =
    opts.body ||
    "เลือกสิ่งที่ต้องการค้นหาจากพิกัดของคุณ แล้วแชร์ตำแหน่งในขั้นถัดไป";

  const buttons = choices.map((c, i) => {
    const btn: Record<string, unknown> = {
      type: "button",
      style: i === 0 ? "primary" : "secondary",
      height: "md",
      action: {
        type: "uri",
        label: c.label.slice(0, 20),
        uri: getLiffOpenUrl(opts.liffId, c.id),
      },
    };
    if (i === 0) btn.color = ACCENT;
    if (i > 0) btn.margin = "sm";
    return btn;
  });

  return {
    type: "flex",
    altText: "เลือกประเภทข้อมูลก่อนแชร์พิกัด",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: title,
            weight: "bold",
            size: "xl",
            color: ACCENT,
            wrap: true,
          },
          {
            type: "text",
            text: body,
            wrap: true,
            size: "sm",
            color: "#555555",
          },
          {
            type: "text",
            text: "Softnix FMM · Location Action",
            size: "xs",
            color: "#888888",
            margin: "lg",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: buttons,
      },
    },
  };
}


/** Seed fields for Flex console (raw-json bubble; runtime rewrites LIFF URIs). */
export function locationTypeChooserTemplateFields(
  liffId?: string | null
): Record<string, string> {
  const flex = buildLocationTypeChooserFlex({
    liffId,
    endpoints: DEFAULT_LDD_CHOICES,
  });
  return {
    altText: flex.altText,
    rawContents: JSON.stringify(flex.contents, null, 2),
  };
}

function normalizeChooserEndpoints(
  endpoints?: LocationChooserEndpoint[] | null
): LocationChooserEndpoint[] {
  const raw =
    endpoints && endpoints.length > 0 ? endpoints : DEFAULT_LDD_CHOICES;
  return raw
    .map((e) => ({
      id: String(e.id || "").trim(),
      label: (e.label || e.id || "").trim() || String(e.id || "").trim(),
    }))
    .filter((e) => e.id)
    .slice(0, 4);
}

function parseRawContents(raw: string | undefined): Record<string, unknown> | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const t = obj.type;
    if (t !== "bubble" && t !== "carousel") return null;
    return obj;
  } catch {
    return null;
  }
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function makeChooserButton(
  label: string,
  uri: string,
  index: number
): Record<string, unknown> {
  const btn: Record<string, unknown> = {
    type: "button",
    style: index === 0 ? "primary" : "secondary",
    height: "md",
    action: {
      type: "uri",
      label: label.slice(0, 20),
      uri,
    },
  };
  if (index === 0) btn.color = ACCENT;
  if (index > 0) btn.margin = "sm";
  return btn;
}

function applyTitleBodyOverrides(
  bubble: Record<string, unknown>,
  fields: Record<string, string>
): void {
  const title = (fields.title || "").trim();
  const body = (fields.body || "").trim();
  if (!title && !body) return;
  const bodyBox = bubble.body as Record<string, unknown> | undefined;
  if (!bodyBox || bodyBox.type !== "box" || !Array.isArray(bodyBox.contents)) return;
  let textIdx = 0;
  for (const node of bodyBox.contents as Record<string, unknown>[]) {
    if (!node || node.type !== "text") continue;
    if (textIdx === 0 && title) node.text = title;
    else if (textIdx === 1 && body) node.text = body;
    textIdx += 1;
    if (textIdx > 1) break;
  }
}

/**
 * Prefer Flex template `location_type_chooser` (raw-json) when present.
 * Runtime: rewrite button URIs by endpoint order; keep admin template labels;
 * append missing buttons with endpoint labels. Fallback to buildLocationTypeChooserFlex.
 */
export function resolveLocationTypeChooserFlex(opts: {
  liffId?: string | null;
  endpoints?: LocationChooserEndpoint[] | null;
  templateFields?: Record<string, string> | null;
}): FlexMessage {
  const choices = normalizeChooserEndpoints(opts.endpoints);
  const fields = opts.templateFields || null;
  const contents = fields ? parseRawContents(fields.rawContents) : null;

  if (contents && contents.type === "bubble") {
    try {
      const bubble = cloneJson(contents);
      if (fields) applyTitleBodyOverrides(bubble, fields);

      let footer = bubble.footer as Record<string, unknown> | undefined;
      if (!footer || footer.type !== "box") {
        footer = {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [],
        };
        bubble.footer = footer;
      }

      const existing = Array.isArray(footer.contents)
        ? (footer.contents as Record<string, unknown>[]).filter(
            (c) => c && c.type === "button"
          )
        : [];

      const nextButtons: Record<string, unknown>[] = [];
      for (let i = 0; i < choices.length; i++) {
        const ep = choices[i]!;
        const uri = getLiffOpenUrl(opts.liffId, ep.id);
        const tplBtn = existing[i];
        if (tplBtn) {
          const action =
            tplBtn.action && typeof tplBtn.action === "object"
              ? ({ ...(tplBtn.action as Record<string, unknown>) } as Record<
                  string,
                  unknown
                >)
              : {};
          const tplLabel = String(action.label || "").trim();
          const label = (tplLabel || ep.label || ep.id).slice(0, 20);
          // Keep template labels; always rewrite URI from endpoint id by order.
          action.type = "uri";
          action.label = label;
          action.uri = uri;
          nextButtons.push({ ...tplBtn, action });
        } else {
          nextButtons.push(
            makeChooserButton(ep.label || ep.id, uri, i)
          );
        }
      }

      if (nextButtons.length === 0) {
        return buildLocationTypeChooserFlex({
          liffId: opts.liffId,
          endpoints: choices,
          title: fields?.title,
          body: fields?.body,
        });
      }

      footer.contents = nextButtons;
      const altText =
        (fields?.altText || "").trim() ||
        "เลือกประเภทข้อมูลก่อนแชร์พิกัด";
      return { type: "flex", altText, contents: bubble };
    } catch {
      /* fall through to builder */
    }
  }

  return buildLocationTypeChooserFlex({
    liffId: opts.liffId,
    endpoints: choices,
    title: fields?.title,
    body: fields?.body,
  });
}

/** @deprecated alias — location ask used to be check-in CTA */
export function buildCheckinAskFlex(liffId?: string | null, tag?: string | null) {
  return buildLocationAskFlex({ liffId, tag });
}

export function locationAskTemplateFields(
  liffId?: string | null,
  tag?: string | null
): Record<string, string> {
  const flex = buildLocationAskFlex({ liffId, tag });
  const uri = getLiffOpenUrl(liffId, tag);
  return {
    altText: flex.altText,
    title: "แชร์พิกัดเพื่อค้นหาใกล้เคียง",
    body: tag
      ? `กดปุ่มเพื่อแชร์ตำแหน่ง แล้วค้นหา «${tag}» ใกล้เคียง`
      : "กดปุ่มเพื่อแชร์ตำแหน่งปัจจุบัน แล้วค้นหาสถานที่ใกล้เคียง",
    buttonLabel: "แชร์พิกัดปัจจุบัน",
    buttonUrl: uri,
    tag: tag || "",
  };
}

export function nearbyResultTemplateFields(): Record<string, string> {
  return {
    altText: "สถานที่ใกล้เคียง",
    title: "ผลค้นหาใกล้เคียง",
    body: "รายการจาก Longdo Map",
    buttonLabel: "เปิดแผนที่",
    buttonUrl: "https://map.longdo.com",
  };
}
