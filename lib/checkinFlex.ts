/**
 * Compatibility layer — nearby/location-share Flex builders live in nearbyFlex.
 * Kept so existing imports (migrate, consoleStore, llmTools) keep working.
 */
export {
  buildCheckinAskFlex,
  buildLocationAskFlex,
  buildNearbyResultsFlex,
  locationAskTemplateFields as checkinAskTemplateFields,
  nearbyResultTemplateFields as checkinResultTemplateFields,
  locationAskTemplateFields,
  nearbyResultTemplateFields,
} from "./nearbyFlex";

import type { FlexMessage } from "./types";
import { ACCENT } from "./types";

/** Legacy simple check-in confirmation (still used if pushOnly on old rows). */
export type CheckinCoords = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  displayName?: string | null;
  checkedAt?: Date;
};

function mapsUri(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function formatThaiTime(d: Date): string {
  try {
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

export function buildCheckinResultFlex(data: CheckinCoords): FlexMessage {
  const at = data.checkedAt || new Date();
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const acc =
    data.accuracy != null && Number.isFinite(Number(data.accuracy))
      ? `±${Math.round(Number(data.accuracy))} ม.`
      : "—";
  const who = (data.displayName || "").trim() || "ผู้ใช้ LINE";
  const coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return {
    type: "flex",
    altText: `บันทึกพิกัดแล้ว · ${coordText}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "บันทึกพิกัดแล้ว",
            weight: "bold",
            size: "xl",
            color: ACCENT,
          },
          {
            type: "text",
            text: who,
            size: "sm",
            color: "#333333",
            wrap: true,
            margin: "md",
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "พิกัด", size: "sm", color: "#888888", flex: 2 },
                  {
                    type: "text",
                    text: coordText,
                    size: "sm",
                    color: "#222222",
                    flex: 5,
                    wrap: true,
                    weight: "bold",
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "ความแม่นยำ", size: "sm", color: "#888888", flex: 2 },
                  { type: "text", text: acc, size: "sm", color: "#222222", flex: 5 },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  { type: "text", text: "เวลา", size: "sm", color: "#888888", flex: 2 },
                  {
                    type: "text",
                    text: formatThaiTime(at),
                    size: "sm",
                    color: "#222222",
                    flex: 5,
                    wrap: true,
                  },
                ],
              },
            ],
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
            action: {
              type: "uri",
              label: "เปิดแผนที่",
              uri: mapsUri(lat, lng),
            },
          },
        ],
      },
    },
  };
}
