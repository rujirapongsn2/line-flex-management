"use client";

import { buildFlex } from "@/lib/flexTemplates";
import type { FlexMessage, TemplateId } from "@/lib/types";

type Props = {
  kind?: TemplateId;
  fields?: Record<string, string>;
  flex?: FlexMessage | null;
  agentName?: string;
  conditionKey?: string;
  userBubble?: string;
  compact?: boolean;
};

function extractPreview(flex: FlexMessage | null | undefined) {
  if (!flex) return { title: "—", desc: "", buttons: [] as string[], hero: false };
  const contents = flex.contents as Record<string, unknown>;
  const type = contents?.type;

  if (type === "carousel") {
    const cards = (contents.contents as Record<string, unknown>[]) || [];
    const first = cards[0] || {};
    const body = first.body as { contents?: { text?: string }[] } | undefined;
    const title = body?.contents?.[0]?.text || flex.altText;
    return {
      title: String(title),
      desc: `คารูเซล ${cards.length} การ์ด`,
      buttons: ["ดูเพิ่ม"],
      hero: true,
    };
  }

  const body = contents.body as
    | { contents?: { type?: string; text?: string; contents?: unknown[] }[] }
    | undefined;
  const footer = contents.footer as
    | { contents?: { action?: { label?: string } }[] }
    | undefined;
  const texts =
    body?.contents
      ?.filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string) || [];
  const title = texts[0] || flex.altText;
  const desc = texts.slice(1).join("\n") || "";
  const buttons =
    footer?.contents
      ?.map((b) => b.action?.label || "")
      .filter(Boolean) || [];
  const hero = Boolean(contents.hero);
  return { title, desc, buttons, hero };
}

export default function FlexPreview({
  kind,
  fields,
  flex: flexProp,
  agentName = "Softnix Care",
  conditionKey,
  userBubble,
  compact,
}: Props) {
  const flex =
    flexProp ||
    (kind && fields ? buildFlex(kind, fields) : null);
  const preview = extractPreview(flex);

  if (compact) {
    return (
      <div className="flex-bubble">
        {preview.hero && (
          <div
            className="flex-hero"
            style={{
              display: "flex",
              alignItems: "flex-end",
              padding: "10px 12px",
              height: 90,
            }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(0,0,0,.25)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              Flex
            </span>
          </div>
        )}
        <div className="flex-body">
          <div className="flex-title">{preview.title}</div>
          {preview.desc ? <div className="flex-desc">{preview.desc}</div> : null}
        </div>
        {preview.buttons.length > 0 && (
          <div className="flex-footer">
            {preview.buttons.map((b, i) => (
              <div
                key={i}
                className="flex-btn"
                style={
                  i > 0
                    ? { background: "#EEF2F6", color: "#475569" }
                    : undefined
                }
              >
                {b}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="phone-header">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#06C755",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            S
          </div>
          {agentName}
        </div>
        <div className="phone-body">
          {userBubble ? <div className="chat-in">{userBubble}</div> : null}
          <div className="chat-out-wrap">
            {conditionKey ? (
              <span className="cond-badge">{conditionKey}</span>
            ) : null}
            <div className="flex-bubble">
              {preview.hero && (
                <div
                  className="flex-hero"
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "10px 12px",
                  }}
                >
                  <span
                    style={{
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(0,0,0,.25)",
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}
                  >
                    Flex
                  </span>
                </div>
              )}
              <div className="flex-body">
                <div className="flex-title">{preview.title}</div>
                {preview.desc ? (
                  <div className="flex-desc">{preview.desc}</div>
                ) : null}
              </div>
              {preview.buttons.length > 0 && (
                <div className="flex-footer">
                  {preview.buttons.map((b, i) => (
                    <div
                      key={i}
                      className="flex-btn"
                      style={
                        i > 0
                          ? { background: "#EEF2F6", color: "#475569" }
                          : undefined
                      }
                    >
                      {b}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
