"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptyTemplate,
  loadConsoleState,
  saveConsoleState,
} from "@/lib/consoleStore";
import {
  fetchRuntimeStatus,
  syncRuntimeConfig,
  type RuntimeSyncStatus,
} from "@/lib/syncRuntime";
import type {
  AgentConfig,
  ConsoleState,
  ConsoleTemplate,
  LineConfig,
  PageId,
} from "@/lib/types";
import AgentPage from "./console/AgentPage";
import FlexEditPage from "./console/FlexEditPage";
import FlexListPage from "./console/FlexListPage";
import LineConnectPage from "./console/LineConnectPage";
import OverviewPage from "./console/OverviewPage";
import SandboxPage from "./console/SandboxPage";
import Sidebar from "./console/Sidebar";
import UserMenu from "./console/UserMenu";
import ProfilePage from "./console/ProfilePage";
import {
  buildHintParagraph,
  computeReadiness,
} from "./console/readiness";

function readPageFromUrl(): { page: PageId; editId: string | null } {
  if (typeof window === "undefined") {
    return { page: "overview", editId: null };
  }
  const sp = new URLSearchParams(window.location.search);
  const p = (sp.get("page") || "overview") as PageId;
  const allowed: PageId[] = [
    "overview",
    "agent",
    "flex",
    "flex-edit",
    "line",
    "sandbox",
    "profile",
  ];
  const page = allowed.includes(p) ? p : "overview";
  return { page, editId: sp.get("id") };
}

function writeUrl(page: PageId, editId?: string | null) {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams();
  sp.set("page", page);
  if (page === "flex-edit" && editId) sp.set("id", editId);
  const url = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState(null, "", url);
}

const TITLES: Record<PageId, { h1: string; crumb: string }> = {
  overview: { h1: "ภาพรวม", crumb: "Softnix LineDev Console · สถานะความพร้อม" },
  agent: { h1: "Agent", crumb: "ตั้งค่าบุคลิก Prompt และโมเดล" },
  flex: { h1: "เทมเพลต Flex", crumb: "จัดการการ์ดตามเงื่อนไขใน Prompt" },
  "flex-edit": { h1: "เทมเพลต Flex — แก้ไข", crumb: "ฟอร์ม + พรีวิว LINE" },
  line: { h1: "การเชื่อม LINE", crumb: "โทเคน · Webhook · User ID" },
  sandbox: {
    h1: "ทดสอบส่งข้อความ",
    crumb: "จำลองเงื่อนไข + พรีวิว Flex · ขั้นตอนรอง",
  },
  profile: {
    h1: "โปรไฟล์",
    crumb: "บัญชีผู้ดูแล · เปลี่ยนรหัสผ่าน · ออกจากระบบ",
  },
};


function MenuToggleBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="menu-toggle"
      aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )}
    </button>
  );
}

export default function LineDevApp() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<ConsoleState>(() => ({
    agent: {
      name: "Softnix Care",
      prompt: "",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      apiKey: "",
      enabled: true,
    },
    line: {
      channelAccessToken: "",
      channelSecret: "",
      webhookConfirmed: false,
    },
    templates: [],
  }));
  const [page, setPage] = useState<PageId>("overview");
  const [editId, setEditId] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [webhookUserCount, setWebhookUserCount] = useState(0);
  const [serverRuntime, setServerRuntime] = useState<RuntimeSyncStatus | null>(
    null
  );
  const [authUsername, setAuthUsername] = useState("admin");
  const [navOpen, setNavOpen] = useState(false);

  const refreshServerRuntime = useCallback(async () => {
    const status = await fetchRuntimeStatus();
    setServerRuntime(status);
    return status;
  }, []);

  const pushRuntime = useCallback(
    async (next: ConsoleState) => {
      const result = await syncRuntimeConfig(next);
      setServerRuntime(result);
      return result;
    },
    []
  );

  useEffect(() => {
    const loaded = loadConsoleState();
    setState(loaded);
    const { page: p, editId: id } = readPageFromUrl();
    setPage(p);
    setEditId(id);
    setHydrated(true);

    void fetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = (await res.json()) as { username?: string };
        if (data.username) setAuthUsername(data.username);
      })
      .catch(() => {
        /* ignore — middleware should gate */
      });

    // Hydrate from SQLite (source of truth), then optionally push local-only secrets.
    void (async () => {
      const status = await fetchRuntimeStatus();
      setServerRuntime(status);
      let merged = loaded;
      if (status.ok && status.hydrate) {
        const h = status.hydrate;
        merged = {
          ...loaded,
          templates:
            h.templates && h.templates.length > 0
              ? h.templates
              : loaded.templates,
          agent: {
            ...loaded.agent,
            name: h.agent.name,
            prompt: h.agent.prompt,
            baseUrl: h.agent.baseUrl,
            model: h.agent.model,
            enabled: h.agent.enabled,
            // Keep non-empty local apiKey (hydrate never includes it)
            apiKey: (loaded.agent.apiKey || "").trim()
              ? loaded.agent.apiKey
              : loaded.agent.apiKey,
          },
          line: {
            ...loaded.line,
            webhookConfirmed: h.line.webhookConfirmed,
            lastUserId: h.line.lastUserId,
            liffId: h.line.liffId,
            locationAction:
              h.line.locationAction || loaded.line.locationAction,
            // Keep non-empty local secrets (hydrate never includes them)
            channelAccessToken: (loaded.line.channelAccessToken || "").trim()
              ? loaded.line.channelAccessToken
              : loaded.line.channelAccessToken,
            channelSecret: (loaded.line.channelSecret || "").trim()
              ? loaded.line.channelSecret
              : loaded.line.channelSecret,
            longdoApiKey: (loaded.line.longdoApiKey || "").trim()
              ? loaded.line.longdoApiKey
              : loaded.line.longdoApiKey,
          },
        };
        setState(merged);
      }
      if (!status.ok) return;
      const localToken = (merged.line.channelAccessToken || "").trim();
      const localSecret = (merged.line.channelSecret || "").trim();
      const localApiKey = (merged.agent.apiKey || "").trim();
      const localLongdo = (merged.line.longdoApiKey || "").trim();
      const needsPush =
        (Boolean(localToken) && !status.hasToken) ||
        (Boolean(localSecret) && !status.hasSecret) ||
        (Boolean(localApiKey) && !status.hasApiKey) ||
        (Boolean(localLongdo) && status.hasLongdoKey === false);
      if (!needsPush) return;
      const r = await syncRuntimeConfig(merged);
      setServerRuntime(r);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConsoleState(state);
  }, [state, hydrated]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/line/webhook/users");
        const data = (await res.json()) as { users?: unknown[] };
        setWebhookUserCount(data.users?.length || 0);
      } catch {
        /* ignore */
      }
    })();
    void refreshServerRuntime();
  }, [page, refreshServerRuntime]);

  const readiness = useMemo(() => computeReadiness(state), [state]);

  const needsServerSync = Boolean(
    ((state.line.channelAccessToken || "").trim() &&
      serverRuntime &&
      serverRuntime.ok &&
      !serverRuntime.hasToken) ||
      ((state.agent.apiKey || "").trim() &&
        serverRuntime &&
        serverRuntime.ok &&
        !serverRuntime.hasApiKey)
  );

  const navigate = useCallback((next: PageId, id?: string | null) => {
    setNavOpen(false);
    setPage(next);
    setEditId(id ?? null);
    writeUrl(next, id);
  }, []);

  const editingTemplate: ConsoleTemplate | null = useMemo(() => {
    if (page !== "flex-edit" || !editId) return null;
    return state.templates.find((t) => t.id === editId) || null;
  }, [page, editId, state.templates]);

  function patchState(patch: Partial<ConsoleState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  async function saveAgent(agent: AgentConfig) {
    const next = { ...state, agent };
    setState(next);
    const r = await pushRuntime(next);
    if (!r.ok) throw new Error(r.error || "บันทึก Agent ไม่สำเร็จ");
    return r;
  }

  async function saveLine(line: LineConfig) {
    const next = { ...state, line };
    setState(next);
    const r = await pushRuntime(next);
    if (!r.ok) throw new Error(r.error || "บันทึก LINE ไม่สำเร็จ");
    return r;
  }

  async function saveTemplate(tpl: ConsoleTemplate) {
    let next: ConsoleState | null = null;
    setState((s) => {
      const idx = s.templates.findIndex((t) => t.id === tpl.id);
      const templates =
        idx >= 0
          ? s.templates.map((t) => (t.id === tpl.id ? tpl : t))
          : [...s.templates, tpl];
      next = { ...s, templates };
      return next;
    });
    const r = await pushRuntime(next!);
    if (!r.ok) throw new Error(r.error || "บันทึกเทมเพลตไม่สำเร็จ");
    return r;
  }

  async function createTemplate() {
    const tpl = createEmptyTemplate();
    let next: ConsoleState | null = null;
    setState((s) => {
      next = { ...s, templates: [...s.templates, tpl] };
      return next;
    });
    const r = await pushRuntime(next!);
    if (!r.ok) throw new Error(r.error || "สร้างเทมเพลตไม่สำเร็จ");
    navigate("flex-edit", tpl.id);
    return r;
  }

  function onInsertHintFromFlex(conditionKey: string, displayNameTh: string) {
    const hint = buildHintParagraph(conditionKey, displayNameTh);
    setPendingHint(hint);
    navigate("agent");
  }

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="content" style={{ padding: 40 }}>
          กำลังโหลด Softnix LineDev Console…
        </div>
      </div>
    );
  }

  const title = TITLES[page];
  const showShellTopbar = page !== "agent";

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      {navOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="ปิดเมนู"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <Sidebar page={page} onNavigate={(p) => navigate(p)} />
      <div className="main">
        {showShellTopbar && (
          <header className="topbar">
            <div className="topbar-left">
              <MenuToggleBtn open={navOpen} onClick={() => setNavOpen((v) => !v)} />
              <div>
                <h1>{title.h1}</h1>
                <div className="crumb">{title.crumb}</div>
              </div>
            </div>
            <div className="topbar-right">
              {(page === "overview" ||
                page === "sandbox" ||
                page === "line") && (
                <span className={`badge ${readiness.badgeKind} dot`}>
                  {readiness.badgeLabel}
                </span>
              )}
              <UserMenu onProfile={() => navigate("profile")} />
            </div>
          </header>
        )}

        {page === "agent" ? (
          <AgentPage
            agent={state.agent}
            templates={state.templates}
            pendingHint={pendingHint}
            onClearPendingHint={() => setPendingHint(null)}
            onSave={saveAgent}
            onProfile={() => navigate("profile")}
            menuOpen={navOpen}
            onMenuToggle={() => setNavOpen((v) => !v)}
          />
        ) : (
          <div className="content">
            {page === "overview" && (
              <OverviewPage
                state={state}
                readiness={readiness}
                onNavigate={(p) => navigate(p)}
                webhookUserCount={webhookUserCount}
                needsServerSync={needsServerSync}
                serverRuntime={serverRuntime}
              />
            )}
            {page === "flex" && (
              <FlexListPage
                templates={state.templates}
                onCreate={createTemplate}
                onEdit={(id) => navigate("flex-edit", id)}
                onToggle={(id, enabled) => {
                  void (async () => {
                    let next: ConsoleState | null = null;
                    setState((s) => {
                      next = {
                        ...s,
                        templates: s.templates.map((t) =>
                          t.id === id ? { ...t, enabled } : t
                        ),
                      };
                      return next;
                    });
                    const r = await pushRuntime(next!);
                    if (!r.ok) {
                      console.error("[flex-toggle]", r.error);
                    }
                  })();
                }}
              />
            )}
            {page === "flex-edit" && editingTemplate && (
              <FlexEditPage
                key={editingTemplate.id}
                template={editingTemplate}
                agentName={state.agent.name}
                onBack={() => navigate("flex")}
                onSave={saveTemplate}
                onInsertHint={onInsertHintFromFlex}
              />
            )}
            {page === "flex-edit" && !editingTemplate && (
              <div className="card empty">
                <div className="text-sm text-muted mb-12">
                  ไม่พบเทมเพลตที่ต้องการแก้ไข
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate("flex")}
                >
                  กลับรายการ
                </button>
              </div>
            )}
            {page === "line" && (
              <LineConnectPage
                line={state.line}
                readiness={readiness}
                onSave={saveLine}
                needsServerSync={needsServerSync}
                serverRuntime={serverRuntime}
              />
            )}
            {page === "sandbox" && (
              <SandboxPage state={state} readiness={readiness} />
            )}
            {page === "profile" && (
              <ProfilePage username={authUsername} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
