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

const DEFAULT_LDD_CHOICES: LocationChooserEndpoint[] = [
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
