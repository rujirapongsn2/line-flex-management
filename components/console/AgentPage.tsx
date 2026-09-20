"use client";

import { useEffect, useState } from "react";
import {
  mergeFlexConditionsIntoPrompt,
} from "@/lib/generateFlexPrompt";
import type { AgentConfig, ConsoleTemplate } from "@/lib/types";
import { buildHintParagraph } from "./readiness";
import UserMenu from "./UserMenu";

type Props = {
  agent: AgentConfig;
  templates: ConsoleTemplate[];
  pendingHint?: string | null;
  onClearPendingHint?: () => void;
  onSave: (agent: AgentConfig) => void;
  onProfile?: () => void;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
};

export default function AgentPage({
  agent,
  templates,
  pendingHint,
  onClearPendingHint,
  onSave,
  onProfile,
  menuOpen = false,
  onMenuToggle,
}: Props) {
  const [draft, setDraft] = useState<AgentConfig>(agent);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(agent);
  }, [agent]);

  useEffect(() => {
    if (!pendingHint) return;
    setDraft((d) => {
      if (d.prompt.includes(pendingHint)) return d;
      const next = {
        ...d,
        prompt: `${d.prompt.trim()}\n\n${pendingHint}`.trim(),
      };
      return next;
    });
    onClearPendingHint?.();
  }, [pendingHint, onClearPendingHint]);

  const enabled = templates.filter((t) => t.enabled);

  function insertHint(t: ConsoleTemplate) {
    const hint = buildHintParagraph(t.conditionKey, t.displayNameTh);
    setDraft((d) => {
      if (
        d.prompt.includes(`condition_key=${t.conditionKey}`) ||
        d.prompt.includes(t.conditionKey)
      ) {
        // still append if exact hint missing
        if (d.prompt.includes(hint)) return d;
      }
      return { ...d, prompt: `${d.prompt.trim()}\n\n${hint}`.trim() };
    });
  }

  function generateFlexPrompt() {
    setDraft((d) => ({
      ...d,
      prompt: mergeFlexConditionsIntoPrompt(d.prompt, templates),
    }));
  }

  function handleSave() {
    onSave(draft);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  }

  function resetPrompt() {
    setDraft((d) => ({ ...d, prompt: agent.prompt }));
  }

  return (
    <>
      <header className="topbar" style={{ position: "relative" }}>
        <div className="topbar-left">
          {onMenuToggle ? (
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"}
              aria-expanded={menuOpen}
              onClick={onMenuToggle}
            >
              {menuOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          ) : null}
          <div>
            <h1>Agent</h1>
            <div className="crumb">ตั้งค่าบุคลิก Prompt และโมเดล</div>
          </div>
        </div>
        <div className="topbar-right">
          {savedFlash ? (
            <span className="tag tag-green">บันทึกแล้ว</span>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
            บันทึกทั้งหมด
          </button>
          <UserMenu onProfile={() => onProfile?.()} />
        </div>
      </header>
      <div className="content">
        <div className="grid-2" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 14 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">ชื่อ Agent</label>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">สถานะ</label>
                  <div className="row gap-8" style={{ height: 38 }}>
                    <button
                      type="button"
                      className={`badge ${draft.enabled ? "ok" : "warn"} dot`}
                      style={{ border: "none", cursor: "pointer" }}
                      onClick={() =>
                        setDraft({ ...draft, enabled: !draft.enabled })
                      }
                    >
                      {draft.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="space-between mb-8" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <label className="label" style={{ margin: 0 }}>
                    System / Install Prompt
                  </label>
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                    บอก Agent ว่าเมื่อไหร่ควรใช้การ์ด Flex ใบไหน · ปุ่มขวาอัปเดตเฉพาะบล็อกเงื่อนไขการ์ด
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={generateFlexPrompt}
                  disabled={enabled.length === 0}
                  title={
                    enabled.length === 0
                      ? "ยังไม่มีเทมเพลตที่เปิดใช้งาน"
                      : "สร้าง/อัปเดตบล็อกเงื่อนไขการ์ด Flex ใน Prompt"
                  }
                  style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  สร้าง/อัปเดตเงื่อนไขการ์ด Flex ใน Prompt
                </button>
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 280, fontSize: 12.5, lineHeight: 1.55 }}
                value={draft.prompt}
                onChange={(e) =>
                  setDraft({ ...draft, prompt: e.target.value })
                }
              />
              <div
                className="row mt-12"
                style={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <span className="text-xs text-muted">
                  บันทึกชื่อ · Prompt · โมเดล ด้วยปุ่มเดียวด้านบน
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={resetPrompt}
                >
                  คืนค่าเดิม
                </button>
              </div>
            </div>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div className="fw-600 mb-12">
                การเชื่อมโมเดล (OpenAI-compatible)
              </div>
              <div className="field">
                <label className="label">Base URL</label>
                <input
                  className="input mono"
                  value={draft.baseUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, baseUrl: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label className="label">Model</label>
                <input
                  className="input mono"
                  value={draft.model}
                  onChange={(e) =>
                    setDraft({ ...draft, model: e.target.value })
                  }
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">API Key</label>
                <input
                  className="input mono"
                  type="password"
                  autoComplete="off"
                  value={draft.apiKey}
                  onChange={(e) =>
                    setDraft({ ...draft, apiKey: e.target.value })
                  }
                  placeholder="sk-…"
                />
                <div className="hint">
                  กด «บันทึกทั้งหมด» จะซิงก์ขึ้นเซิร์ฟเวอร์ให้ webhook ใช้
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className="space-between"
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div className="fw-600">การ์ด Flex ที่ Agent ใช้ได้</div>
                  <div className="text-xs text-muted">
                    กด «แทรกคำใบ้» เพื่อใส่รหัสการ์ดลง Prompt
                  </div>
                </div>
                <span className="tag tag-blue">{enabled.length} ใบ</span>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>ชื่อการ์ด</th>
                    <th>รหัสการ์ด</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {enabled.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-sm text-muted">
                        ยังไม่มีเทมเพลตที่เปิดใช้งาน
                      </td>
                    </tr>
                  ) : (
                    enabled.map((t) => (
                      <tr key={t.id}>
                        <td>{t.displayNameTh}</td>
                        <td>
                          <span className="code-pill">{t.conditionKey}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline-accent btn-sm"
                            onClick={() => insertHint(t)}
                          >
                            แทรกคำใบ้
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
