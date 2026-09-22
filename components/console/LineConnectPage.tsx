"use client";

import { useEffect, useState } from "react";
import type { LineConfig, LocationActionConfig, LocationActionMode } from "@/lib/types";
import { defaultLocationAction } from "@/lib/types";
import type { Readiness } from "./readiness";

type WebhookUser = {
  userId: string;
  displayHint: string;
  at: string;
};

type Props = {
  line: LineConfig;
  readiness: Readiness;
  onSave: (line: LineConfig) => void | Promise<unknown>;
  needsServerSync?: boolean;
  serverRuntime?: { ok?: boolean; hasToken?: boolean; hasApiKey?: boolean } | null;
};

function formatAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function LineConnectPage({
  line,
  readiness,
  onSave,
  needsServerSync,
}: Props) {
  const [draft, setDraft] = useState(line);
  const [showToken, setShowToken] = useState(false);
  const [users, setUsers] = useState<WebhookUser[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("/api/line/webhook");
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedSection, setSavedSection] = useState<
    'token' | 'secret' | 'liff' | 'longdo' | 'location' | 'webhook' | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(line);
  }, [line]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/line/webhook`);
    }
    void refreshUsers();
    const id = window.setInterval(() => void refreshUsers(), 8000);
    return () => window.clearInterval(id);
  }, []);

  async function refreshUsers() {
    try {
      const res = await fetch("/api/line/webhook/users");
      const data = (await res.json()) as {
        ok?: boolean;
        users?: WebhookUser[];
      };
      if (data.users) setUsers(data.users);
    } catch {
      /* ignore */
    }
  }

  async function persist(
    next: LineConfig,
    section: 'token' | 'secret' | 'liff' | 'longdo' | 'location' | 'webhook'
  ) {
    setDraft(next);
    setSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    setSavedSection(null);
    try {
      await onSave(next);
      setSavedSection(section);
      setSavedFlash(true);
      window.setTimeout(() => {
        setSavedFlash(false);
        setSavedSection(null);
      }, 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }


  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr .9fr",
        gap: 16,
      }}
    >
      <div className="stack" style={{ gap: 14 }}>
        {needsServerSync ? (
          <div
            className="card"
            style={{
              padding: "12px 16px",
              background: "var(--warn-soft)",
              borderColor: "#F5C84C",
            }}
          >
            <div className="text-sm" style={{ color: "#92400E", lineHeight: 1.5 }}>
              กดบันทึกอีกครั้งเพื่อซิงก์ขึ้นเซิร์ฟเวอร์สำหรับ webhook
            </div>
          </div>
        ) : null}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Channel Access Token</div>
          <div className="text-sm text-muted mb-12">
            จาก LINE Developers → Messaging API → Channel access token
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">โทเคน</label>
            <div className="row gap-8">
              <input
                className="input mono"
                style={{ flex: 1 }}
                type={showToken ? "text" : "password"}
                autoComplete="off"
                value={draft.channelAccessToken}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    channelAccessToken: e.target.value,
                  });
                }}
                placeholder="ใส่ Channel Access Token"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? "ซ่อน" : "แสดง"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void persist(draft, "token")}
              >
                บันทึก
              </button>
            </div>
            <div className="row gap-8 mt-8">
              {readiness.hasToken ? (
                <span className="badge ok dot">โทเคนพร้อมใช้</span>
              ) : (
                <span className="badge warn dot">ยังไม่มีโทเคน</span>
              )}
              {savedFlash && savedSection === "token" ? (
                <span className="text-xs text-muted">บันทึกแล้ว</span>
              ) : null}
              {saveError ? (
                <span className="text-xs" style={{ color: "#B91C1C" }}>
                  {saveError}
                </span>
              ) : null}
            </div>
            <div className="hint">
              เก็บในเบราว์เซอร์ · กดบันทึกจะซิงก์ขึ้นเซิร์ฟเวอร์ให้ webhook ใช้ตอบกลับ
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Channel Secret (ถ้ามี)</div>
          <div className="field" style={{ margin: 0 }}>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              value={draft.channelSecret}
              onChange={(e) =>
                setDraft({ ...draft, channelSecret: e.target.value })
              }
              placeholder="ทางเลือก — สำหรับตรวจลายเซ็น webhook"
            />
            <div className="hint mt-8">
              ซิงก์ขึ้นเซิร์ฟเวอร์เมื่อกดบันทึก · หรือตั้ง LINE_CHANNEL_SECRET ใน env
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-8"
              disabled={saving}
              onClick={() => void persist(draft, "secret")}
            >
              บันทึก Secret
            </button>
            {savedFlash && savedSection === "secret" ? (
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                บันทึกแล้ว
              </span>
            ) : null}
          </div>
        </div>


        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">LIFF ID (แชร์พิกัดค้นหาใกล้เคียง)</div>
          <div className="text-sm text-muted mb-12">
            สร้าง LIFF App ใน LINE Developers · Endpoint URL =
            https://line.rujirapong.us/liff/checkin · Size: Full
            · ใส่ LIFF ID ที่นี่ หรือตั้ง <code>LIFF_ID</code> ใน .env (env มีลำดับสูงกว่า)
          </div>
          <div className="field" style={{ margin: 0 }}>
            <input
              className="input mono"
              autoComplete="off"
              value={draft.liffId || ""}
              onChange={(e) =>
                setDraft({ ...draft, liffId: e.target.value.trim() })
              }
              placeholder="เช่น 1234567890-abcdefgh"
            />
            <div className="hint mt-8">
              หน้าสาธารณะ: /liff/checkin · เทมเพลต checkin_ask / nearby_results · API /api/location/action (poi/search ยังใช้ได้)
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-8"
              disabled={saving}
              onClick={() => void persist(draft, "liff")}
            >
              บันทึก LIFF ID
            </button>
            {savedFlash && savedSection === "liff" ? (
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                บันทึกแล้ว
              </span>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Longdo Map API Key</div>
          <div className="text-sm text-muted mb-12">
            ใช้ค้นหา POI ใกล้เคียงฝั่งเซิร์ฟเวอร์ · แนะนำตั้ง{" "}
            <code>LONGDO_API_KEY</code> ใน .env (env มีลำดับสูงกว่าค่าในฟอร์ม)
          </div>
          <div className="field" style={{ margin: 0 }}>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              value={draft.longdoApiKey || ""}
              onChange={(e) =>
                setDraft({ ...draft, longdoApiKey: e.target.value.trim() })
              }
              placeholder="Longdo API Key"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-8"
              disabled={saving}
              onClick={() => void persist(draft, "longdo")}
            >
              บันทึก Longdo Key
            </button>
            {savedFlash && savedSection === "longdo" ? (
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                บันทึกแล้ว
              </span>
            ) : null}
          </div>
        </div>


        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Location Action (หลังได้ GPS จาก LIFF)</div>
          <div className="text-sm text-muted mb-12">
            เลือกโหมด: Longdo POI (ค่าเริ่มต้น) · HTTP API ภายนอก · หรือ none แล้วให้ LLM
            ตอบบน LINE · Secrets ใส่ใน .env แล้วอ้าง{" "}
            <code>{"{{secret:ENV_NAME}}"}</code> ใน URL/headers · ไม่ส่งคีย์ออก
            /api/liff/config
          </div>
          {(() => {
            const loc: LocationActionConfig =
              draft.locationAction || defaultLocationAction();
            const setLoc = (next: LocationActionConfig) =>
              setDraft({ ...draft, locationAction: next });
            const mode = loc.mode || "longdo_poi";
            return (
              <div className="stack" style={{ gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">โหมด</label>
                  <select
                    className="input"
                    value={mode}
                    onChange={(e) =>
                      setLoc({
                        ...loc,
                        mode: e.target.value as LocationActionMode,
                      })
                    }
                  >
                    <option value="longdo_poi">longdo_poi — ค้นหา Longdo (ค่าเริ่มต้น)</option>
                    <option value="http">http — เรียก API ตาม URL template</option>
                    <option value="none">none — ไม่เรียกภายนอก แค่พิกัด + LLM</option>
                  </select>
                </div>

                {mode === "longdo_poi" ? (
                  <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                    <div className="field" style={{ margin: 0, flex: 1, minWidth: 140 }}>
                      <label className="label">defaultTags</label>
                      <input
                        className="input mono"
                        value={loc.longdo?.defaultTags || ""}
                        onChange={(e) =>
                          setLoc({
                            ...loc,
                            longdo: {
                              ...(loc.longdo || {}),
                              defaultTags: e.target.value,
                            },
                          })
                        }
                        placeholder="hospital,7-11,…"
                      />
                    </div>
                    <div className="field" style={{ margin: 0, width: 100 }}>
                      <label className="label">limit</label>
                      <input
                        className="input mono"
                        type="number"
                        min={1}
                        max={20}
                        value={loc.longdo?.limit ?? 10}
                        onChange={(e) =>
                          setLoc({
                            ...loc,
                            longdo: {
                              ...(loc.longdo || {}),
                              limit: Number(e.target.value) || 10,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="field" style={{ margin: 0, width: 100 }}>
                      <label className="label">span</label>
                      <input
                        className="input mono"
                        value={loc.longdo?.span || "300m"}
                        onChange={(e) =>
                          setLoc({
                            ...loc,
                            longdo: {
                              ...(loc.longdo || {}),
                              span: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                ) : null}

                {mode === "http" ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="row gap-8">
                      <div className="field" style={{ margin: 0, width: 120 }}>
                        <label className="label">method</label>
                        <select
                          className="input"
                          value={loc.http?.method || "GET"}
                          onChange={(e) =>
                            setLoc({
                              ...loc,
                              http: {
                                ...(loc.http || {
                                  method: "GET",
                                  urlTemplate: "",
                                }),
                                method: e.target.value as
                                  | "GET"
                                  | "POST"
                                  | "PUT"
                                  | "PATCH",
                              },
                            })
                          }
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                        </select>
                      </div>
                      <div className="field" style={{ margin: 0, flex: 1 }}>
                        <label className="label">urlTemplate</label>
                        <input
                          className="input mono"
                          value={loc.http?.urlTemplate || ""}
                          onChange={(e) =>
                            setLoc({
                              ...loc,
                              http: {
                                ...(loc.http || {
                                  method: "GET",
                                  urlTemplate: "",
                                }),
                                urlTemplate: e.target.value,
                              },
                            })
                          }
                          placeholder="https://api.example.com/near?lat={{lat}}&lon={{lon}}"
                        />
                      </div>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">headers (JSON)</label>
                      <textarea
                        className="input mono"
                        rows={3}
                        value={JSON.stringify(loc.http?.headers || {}, null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value || "{}") as Record<
                              string,
                              string
                            >;
                            setLoc({
                              ...loc,
                              http: {
                                ...(loc.http || {
                                  method: "GET",
                                  urlTemplate: "",
                                }),
                                headers: parsed,
                              },
                            });
                          } catch {
                            /* keep typing */
                          }
                        }}
                        placeholder='{"Authorization":"Bearer {{secret:MY_API_TOKEN}}"}'
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">bodyTemplate</label>
                      <textarea
                        className="input mono"
                        rows={3}
                        value={loc.http?.bodyTemplate || ""}
                        onChange={(e) =>
                          setLoc({
                            ...loc,
                            http: {
                              ...(loc.http || {
                                method: "GET",
                                urlTemplate: "",
                              }),
                              bodyTemplate: e.target.value,
                            },
                          })
                        }
                        placeholder='{"lat":{{lat}},"lon":{{lon}},"tag":"{{tag}}"}'
                      />
                    </div>
                    <div className="hint">
                      Placeholders: {"{{lat}}"} {"{{lon}}"} {"{{tag}}"}{" "}
                      {"{{userId}}"} {"{{query}}"} · SSRF บล็อก localhost/private IP
                    </div>
                  </div>
                ) : null}

                <div className="row gap-8" style={{ alignItems: "center" }}>
                  <label
                    className="row gap-8"
                    style={{ cursor: "pointer", fontSize: 13 }}
                  >
                    <input
                      type="checkbox"
                      checked={loc.reply?.useLlm !== false}
                      onChange={(e) =>
                        setLoc({
                          ...loc,
                          reply: {
                            ...(loc.reply || {
                              useLlm: true,
                              fallbackFlexKey: "nearby_results",
                            }),
                            useLlm: e.target.checked,
                          },
                        })
                      }
                    />
                    ใช้ LLM ตอบบน LINE หลัง Action
                  </label>
                  <div className="field" style={{ margin: 0, flex: 1 }}>
                    <label className="label">fallbackFlexKey</label>
                    <input
                      className="input mono"
                      value={loc.reply?.fallbackFlexKey || "nearby_results"}
                      onChange={(e) =>
                        setLoc({
                          ...loc,
                          reply: {
                            ...(loc.reply || { useLlm: true }),
                            fallbackFlexKey: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={saving}
                  onClick={() =>
                    void persist({ ...draft, locationAction: loc }, "location")
                  }
                >
                  บันทึก Location Action
                </button>
                {savedFlash && savedSection === "location" ? (
                  <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                    บันทึกแล้ว
                  </span>
                ) : null}
              </div>
            );
          })()}
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Webhook URL</div>
          <div className="text-sm text-muted mb-12">
            คัดลอกไปวางใน LINE Developers · ต้องเป็น HTTPS (เช่น Tailscale
            Funnel / ngrok)
          </div>
          <div className="row gap-8">
            <input
              className="input mono"
              style={{ flex: 1, background: "#F8FAFC" }}
              readOnly
              value={webhookUrl}
            />
            <button type="button" className="btn btn-primary" onClick={copyUrl}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
          <div className="mt-12" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {readiness.webhookConfirmed ? (
              <span className="badge ok dot">ยืนยัน Webhook แล้ว</span>
            ) : (
              <span className="badge warn dot">ยังไม่ได้ยืนยันจาก LINE</span>
            )}
            <span className="tag tag-gray">ต้อง HTTPS</span>
          </div>
          <div className="mt-12">
            <button
              type="button"
              className="btn btn-outline-accent"
              disabled={saving || draft.webhookConfirmed}
              onClick={() =>
                void persist({ ...draft, webhookConfirmed: true }, "webhook")
              }
            >
              ฉันลงทะเบียน Webhook แล้ว
            </button>
            {draft.webhookConfirmed ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8 }}
                disabled={saving}
                onClick={() =>
                  void persist({ ...draft, webhookConfirmed: false }, "webhook")
                }
              >
                ยกเลิกการยืนยัน
              </button>
            ) : null}
            {savedFlash && savedSection === "webhook" ? (
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                บันทึกแล้ว
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "14px 18px",
            background: "var(--accent-soft)",
            borderColor: "#B9D9EF",
          }}
        >
          <div
            className="text-sm"
            style={{ color: "var(--accent-dark)", lineHeight: 1.5 }}
          >
            <strong>ลำดับแนะนำ:</strong> 1) ใส่โทเคน → 2) คัดลอก Webhook URL
            ไปลงทะเบียน → 3) ให้ลูกค้าทัก Agent ครั้งหนึ่ง เพื่อให้ระบบจำ User ID
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <div
          className="space-between"
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="fw-600">User ID ที่เรียนรู้จาก Webhook</div>
            <div className="text-xs text-muted">อัปเดตเมื่อมีข้อความเข้า</div>
          </div>
          <span className="tag tag-blue">{users.length} คน</span>
        </div>
        {users.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>
            <div className="text-sm">
              ยังไม่มี User ID — ลงทะเบียน Webhook แล้วให้มีคนทักบอทครั้งหนึ่ง
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-12"
              onClick={() => void refreshUsers()}
            >
              รีเฟรช
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อที่แสดง</th>
                <th>User ID</th>
                <th>ล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>
                    <div className="row gap-8">
                      <div
                        className="avatar"
                        style={{ width: 26, height: 26, fontSize: 10 }}
                      >
                        {(u.displayHint || u.userId).slice(0, 1)}
                      </div>
                      {u.displayHint || "ผู้ใช้ LINE"}
                    </div>
                  </td>
                  <td>
                    <span className="code-pill">
                      {u.userId.length > 12
                        ? `${u.userId.slice(0, 5)}…${u.userId.slice(-4)}`
                        : u.userId}
                    </span>
                  </td>
                  <td className="text-xs text-muted">{formatAt(u.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
