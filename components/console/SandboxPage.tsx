"use client";

import { useEffect, useState } from "react";
import { buildFlex } from "@/lib/flexTemplates";
import { matchConditionKey } from "@/lib/consoleStore";
import type { ConsoleState, FlexMessage } from "@/lib/types";
import type { Readiness } from "./readiness";
import FlexPreview from "./FlexPreview";

type WebhookUser = {
  userId: string;
  displayHint: string;
  at: string;
};

type SimResult = {
  conditionKey: string | null;
  displayNameTh?: string;
  flex: FlexMessage | null;
  assistantText?: string;
  source: "llm" | "local";
  toolTrace?: unknown;
  httpDetail?: string;
  lineSend?: unknown;
  error?: string;
};

type Props = {
  state: ConsoleState;
  readiness: Readiness;
};

export default function SandboxPage({ state, readiness }: Props) {
  const [tab, setTab] = useState<"simulate" | "token">("simulate");
  const [users, setUsers] = useState<WebhookUser[]>([]);
  const [userId, setUserId] = useState(state.line.lastUserId || "");
  const [message, setMessage] = useState(
    "มีโน้ตบุ๊กตัวไหนแนะนำบ้าง ราคาประมาณเท่าไหร่"
  );
  const [sendToLine, setSendToLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);

  const [plainText, setPlainText] = useState("ทดสอบโทเคนจาก FMM by Softnix");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenResult, setTokenResult] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/line/webhook/users");
        const data = (await res.json()) as { users?: WebhookUser[] };
        if (data.users) {
          setUsers(data.users);
          if (!userId && data.users[0]) setUserId(data.users[0].userId);
        }
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function localSimulate(): SimResult {
    const matched = matchConditionKey(
      message,
      state.templates,
      state.agent.prompt
    );
    if (!matched) {
      return {
        conditionKey: null,
        flex: null,
        assistantText: "ไม่พบเงื่อนไขที่ตรง — ลองปรับ Prompt หรือตัวอย่างกระตุ้น",
        source: "local",
        httpDetail: "จำลองในเครื่อง · ไม่เรียก LLM",
      };
    }
    const flex = buildFlex(matched.kind, matched.fields);
    return {
      conditionKey: matched.conditionKey,
      displayNameTh: matched.displayNameTh,
      flex,
      assistantText: `เลือกเงื่อนไข ${matched.conditionKey}`,
      source: "local",
      httpDetail: "จำลองในเครื่อง (local matcher) · ยังไม่เรียก LINE",
    };
  }

  async function runSimulate() {
    setBusy(true);
    setResult(null);
    const canLlm = Boolean(state.agent.apiKey.trim());

    if (!canLlm) {
      setResult(localSimulate());
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: state.agent.apiKey,
          openRouterApiKey: state.agent.apiKey,
          baseUrl: state.agent.baseUrl,
          model: state.agent.model,
          message,
          systemPrompt: state.agent.prompt,
          templates: state.templates.filter((t) => t.enabled),
          sendToLine: sendToLine && readiness.hasToken && Boolean(userId.trim()),
          channelAccessToken: state.line.channelAccessToken,
          userId,
          sendMode: "push",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        flex?: FlexMessage | null;
        conditionKey?: string | null;
        assistantText?: string;
        toolTrace?: unknown;
        lineSend?: unknown;
        openRouterStatus?: number;
      };

      if (!data.ok) {
        // fallback local
        const local = localSimulate();
        setResult({
          ...local,
          error: data.error,
          httpDetail: `LLM ล้มเหลว (${res.status}) · ใช้ local matcher แทน`,
        });
        setBusy(false);
        return;
      }

      let conditionKey = data.conditionKey || null;
      let flex = data.flex || null;
      let displayNameTh: string | undefined;

      if (!conditionKey || !flex) {
        const local = localSimulate();
        conditionKey = conditionKey || local.conditionKey;
        flex = flex || local.flex;
        displayNameTh = local.displayNameTh;
      } else {
        const t = state.templates.find((x) => x.conditionKey === conditionKey);
        displayNameTh = t?.displayNameTh;
      }

      setResult({
        conditionKey,
        displayNameTh,
        flex,
        assistantText: data.assistantText,
        source: "llm",
        toolTrace: data.toolTrace,
        lineSend: data.lineSend,
        httpDetail: sendToLine
          ? `เรียก LLM แล้ว · LINE: ${JSON.stringify(data.lineSend ?? "—")}`
          : `เรียก LLM สำเร็จ · HTTP ${res.status} · ยังไม่ส่ง LINE`,
      });
    } catch (e) {
      const local = localSimulate();
      setResult({
        ...local,
        error: e instanceof Error ? e.message : String(e),
        httpDetail: "เครือข่ายล้มเหลว · ใช้ local matcher",
      });
    } finally {
      setBusy(false);
    }
  }

  async function runTokenCheck() {
    if (!readiness.hasToken) {
      setTokenResult("ยังไม่มี Channel Access Token — ไปหน้าการเชื่อม LINE");
      return;
    }
    if (!userId.trim()) {
      setTokenResult("ต้องมี User ID เพื่อส่งข้อความทดสอบ");
      return;
    }
    setTokenBusy(true);
    setTokenResult(null);
    try {
      // Build a minimal text via send API — use flex bubble-simple as carrier? 
      // Prefer /api/line/send with a simple flex, or we need text support.
      // Use llm chat with sendToLine and plain message instructing text only,
      // OR push via line send with bubble-simple containing the plain text.
      const { buildFlex: bf, defaultFields } = await import("@/lib/flexTemplates");
      const fields = defaultFields("bubble-simple");
      fields.title = "ทดสอบโทเคน";
      fields.body = plainText;
      fields.buttonLabel = "Softnix";
      fields.altText = plainText.slice(0, 100);
      const messageFlex = bf("bubble-simple", fields);

      const res = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelAccessToken: state.line.channelAccessToken,
          sendMode: "push",
          userId,
          message: messageFlex,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        lineStatus?: number;
      };
      if (data.ok) {
        setTokenResult(
          `สำเร็จ · LINE HTTP ${data.lineStatus ?? 200} — โทเคนใช้งานได้`
        );
      } else {
        setTokenResult(
          `ล้มเหลว · ${data.error || "unknown"} (HTTP ${data.lineStatus ?? res.status})`
        );
      }
    } catch (e) {
      setTokenResult(e instanceof Error ? e.message : String(e));
    } finally {
      setTokenBusy(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {!readiness.webhookConfirmed && (
        <div className="warn-banner">
          Webhook ยังไม่ยืนยัน — จำลองข้อความในคอนโซลได้ตามปกติ แต่การรับข้อความจริงจาก
          LINE ต้องลงทะเบียน Webhook ก่อน (หน้าการเชื่อม LINE)
        </div>
      )}

      <div className="space-between" style={{ flexShrink: 0 }}>
        <div className="row gap-8">
          <button
            type="button"
            className={`btn btn-sm ${tab === "simulate" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab("simulate")}
          >
            จำลองข้อความลูกค้า
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "token" ? "btn-primary" : "btn-secondary"}`}
            style={tab !== "token" ? { opacity: 0.75 } : undefined}
            onClick={() => setTab("token")}
          >
            ตรวจโทเคน (ข้อความธรรมดา)
          </button>
        </div>
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          <span
            className={`tag ${readiness.agentConfigured ? "tag-green" : "tag-amber"}`}
          >
            {readiness.agentConfigured ? "✓" : "!"} Agent
          </span>
          <span
            className={`tag ${readiness.hasEnabledTemplate ? "tag-green" : "tag-amber"}`}
          >
            {readiness.hasEnabledTemplate ? "✓" : "!"} Flex
          </span>
          <span
            className={`tag ${readiness.hasToken ? "tag-green" : "tag-amber"}`}
          >
            {readiness.hasToken ? "✓" : "!"} Token
          </span>
          <span
            className={`tag ${readiness.webhookConfirmed ? "tag-green" : "tag-amber"}`}
          >
            {readiness.webhookConfirmed ? "✓" : "!"} Webhook
          </span>
        </div>
      </div>

      {tab === "simulate" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.05fr",
            gap: 16,
          }}
        >
          <div
            className="card"
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="fw-600 mb-4">ข้อความลูกค้าตัวอย่าง</div>
            <div className="text-sm text-muted mb-12">
              พิมพ์เหมือนลูกค้าทักบน LINE — ระบบจะเลือกเงื่อนไขและแสดงการ์ดที่จะส่ง
            </div>
            <div className="field">
              <label className="label">ผู้รับ (สำหรับส่งจริงภายหลัง)</label>
              <select
                className="select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {(u.displayHint || "User")} · {u.userId.slice(0, 6)}…
                  </option>
                ))}
              </select>
              {users.length === 0 && (
                <input
                  className="input mono mt-8"
                  placeholder="วาง User ID ด้วยตนเอง"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              )}
            </div>
            <div
              className="field"
              style={{ flex: 1, display: "flex", flexDirection: "column", margin: 0 }}
            >
              <label className="label">ข้อความลูกค้าตัวอย่าง</label>
              <textarea
                className="textarea"
                style={{ flex: 1, minHeight: 140 }}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <label
              className="row gap-8 mt-12"
              style={{ fontSize: 13, opacity: readiness.hasToken ? 1 : 0.55 }}
            >
              <input
                type="checkbox"
                checked={sendToLine}
                disabled={!readiness.hasToken || !userId.trim()}
                onChange={(e) => setSendToLine(e.target.checked)}
              />
              ส่งไป LINE จริง (ต้องมี Token + User ID)
            </label>
            <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setMessage("");
                  setResult(null);
                }}
              >
                ล้าง
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !message.trim()}
                onClick={() => void runSimulate()}
              >
                {busy ? "กำลังจำลอง…" : "จำลองผลลัพธ์"}
              </button>
            </div>
            <div
              className="mt-12 text-xs text-muted"
              style={{
                lineHeight: 1.45,
                paddingTop: 10,
                borderTop: "1px dashed var(--border)",
              }}
            >
              โหมดรอง «ตรวจโทเคน» ใช้ส่งข้อความเพื่อเช็ก Channel Access Token
              เท่านั้น — ไม่ใช่โหมดหลัก
              {!state.agent.apiKey.trim() && (
                <> · ไม่มี API Key จะใช้ตัวจับคู่เงื่อนไขในเครื่อง</>
              )}
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: "18px 20px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="space-between mb-12">
              <div className="fw-600">ผลลัพธ์หลัก</div>
              <span className="text-xs text-muted">
                {result
                  ? result.source === "llm"
                    ? "จาก Agent / LLM"
                    : "จาก local matcher"
                  : "ยังไม่จำลอง · ดูเงื่อนไข + พรีวิวการ์ด"}
              </span>
            </div>

            {!result ? (
              <div className="empty" style={{ flex: 1 }}>
                กด «จำลองผลลัพธ์» เพื่อดู condition_key และการ์ด Flex
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid #B9D9EF",
                    borderRadius: 10,
                    padding: "14px 16px",
                    marginBottom: 14,
                  }}
                >
                  <div className="text-xs text-muted mb-4">
                    ระบบเลือกเงื่อนไข (condition_key)
                  </div>
                  <div className="row gap-8" style={{ alignItems: "center" }}>
                    <span
                      className="code-pill"
                      style={{
                        fontSize: 14,
                        padding: "4px 12px",
                        background: "#fff",
                        border: "1px solid #B9D9EF",
                        color: "var(--accent-dark)",
                        fontWeight: 600,
                      }}
                    >
                      {result.conditionKey || "—"}
                    </span>
                    {result.displayNameTh ? (
                      <span className="tag tag-blue">
                        {result.displayNameTh}
                      </span>
                    ) : null}
                  </div>
                  {result.assistantText ? (
                    <div
                      className="text-sm mt-8"
                      style={{ color: "var(--accent-dark)", lineHeight: 1.45 }}
                    >
                      {result.assistantText}
                    </div>
                  ) : null}
                  {result.error ? (
                    <div className="text-xs mt-8" style={{ color: "var(--danger)" }}>
                      {result.error}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-muted mb-8">การ์ด Flex ที่จะส่ง</div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    flex: 1,
                    alignItems: "flex-start",
                    background: "#8EACBF",
                    borderRadius: 12,
                    padding: 16,
                    minHeight: 200,
                  }}
                >
                  {result.flex ? (
                    <FlexPreview flex={result.flex} compact />
                  ) : (
                    <div className="text-sm" style={{ color: "#fff" }}>
                      ไม่มีการ์ด Flex
                    </div>
                  )}
                </div>

                <div
                  className="mt-12"
                  style={{
                    padding: "10px 12px",
                    background: "#F8FAFC",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="space-between">
                    <span className="text-xs text-muted">รายละเอียดรอง · API</span>
                    <span className="text-xs mono text-muted">
                      {result.httpDetail || "—"}
                    </span>
                  </div>
                  {result.toolTrace ? (
                    <pre
                      className="text-xs mono text-muted mt-4"
                      style={{
                        whiteSpace: "pre-wrap",
                        maxHeight: 80,
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(result.toolTrace, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "18px 20px", maxWidth: 560 }}>
          <div className="fw-600 mb-4">ตรวจโทเคนด้วยข้อความธรรมดา</div>
          <div className="text-sm text-muted mb-12">
            ส่งการ์ดข้อความสั้นไปยัง User ID เพื่อยืนยันว่า Channel Access Token
            ใช้งานได้ — ไม่ใช่โหมดจำลองเงื่อนไข
          </div>
          {!readiness.hasToken && (
            <div className="warn-banner mb-12">
              ยังไม่มี Token — ไม่สามารถส่งไป LINE ได้
            </div>
          )}
          <div className="field">
            <label className="label">User ID</label>
            <input
              className="input mono"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="U…"
            />
          </div>
          <div className="field">
            <label className="label">ข้อความทดสอบ</label>
            <textarea
              className="textarea"
              value={plainText}
              onChange={(e) => setPlainText(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={tokenBusy || !readiness.hasToken}
            onClick={() => void runTokenCheck()}
          >
            {tokenBusy ? "กำลังส่ง…" : "ส่งตรวจโทเคน"}
          </button>
          {tokenResult && (
            <div className="mt-12 text-sm" style={{ lineHeight: 1.45 }}>
              {tokenResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
