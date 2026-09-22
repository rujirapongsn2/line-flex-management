"use client";

import { useMemo, useRef, useState } from "react";
import { TEMPLATE_META, defaultFields, fieldDefs, buildFlex } from "@/lib/flexTemplates";
import {
  parseFlexSimulatorJson,
  prettyContents,
} from "@/lib/flexSimulatorImport";
import type { ConsoleTemplate, TemplateId, TemplateVariable } from "@/lib/types";
import FlexPreview from "./FlexPreview";

type EditorMode = "simulator" | "form";

type Props = {
  template: ConsoleTemplate;
  agentName: string;
  onBack: () => void;
  onSave: (tpl: ConsoleTemplate) => void | Promise<unknown>;
  onInsertHint: (conditionKey: string, displayNameTh: string) => void;
};

export default function FlexEditPage({
  template,
  agentName,
  onBack,
  onSave,
  onInsertHint,
}: Props) {
  const [draft, setDraft] = useState<ConsoleTemplate>(template);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [examplesText, setExamplesText] = useState(
    template.triggerExamples.join("\n")
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(
    template.kind === "raw-json" ? "simulator" : "form"
  );
  const [pasteText, setPasteText] = useState(
    template.kind === "raw-json" ? template.fields.rawContents || "" : ""
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const defs = useMemo(() => fieldDefs(draft.kind), [draft.kind]);

  const pasteValidation = useMemo(() => {
    if (editorMode !== "simulator") return null;
    return parseFlexSimulatorJson(pasteText);
  }, [editorMode, pasteText]);

  function setKind(kind: TemplateId) {
    const fields = defaultFields(kind);
    setDraft((d) => ({
      ...d,
      kind,
      fields,
    }));
    if (kind === "raw-json") {
      setPasteText(fields.rawContents || "");
    }
    setSaved(false);
    setSaveError(null);
  }

  function setField(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      fields: { ...d.fields, [key]: value },
    }));
    setSaved(false);
    setSaveError(null);
  }

  function switchMode(mode: EditorMode) {
    if (mode === editorMode) return;
    setEditorMode(mode);
    setImportMsg(null);
    setSaveError(null);
    if (mode === "simulator") {
      if (draft.kind === "raw-json") {
        setPasteText(draft.fields.rawContents || "");
      } else {
        const base = defaultFields("raw-json");
        const fields: Record<string, string> = {
          ...base,
          altText: draft.fields.altText || base.altText,
        };
        setPasteText(fields.rawContents || "");
        setDraft({ ...draft, kind: "raw-json", fields });
      }
    }
    setSaved(false);
  }

  function applyParsed(
    result: ReturnType<typeof parseFlexSimulatorJson>
  ): boolean {
    if (!result.ok) {
      setImportMsg(null);
      setSaveError(result.error);
      return false;
    }
    const pretty = prettyContents(result.contents);
    setPasteText(pretty);
    setDraft((d) => ({
      ...d,
      kind: "raw-json",
      fields: {
        ...d.fields,
        rawContents: pretty,
        ...(result.altText ? { altText: result.altText } : {}),
      },
    }));
    setSaved(false);
    setSaveError(null);
    const type =
      (result.contents as { type?: string }).type === "carousel"
        ? "carousel"
        : "bubble";
    setImportMsg(
      `นำเข้าแล้ว · ${type} · แหล่ง: ${
        result.source === "contents"
          ? "contents"
          : result.source === "flex-message"
            ? "flex message"
            : "messages[]"
      }`
    );
    return true;
  }

  function handleImport() {
    applyParsed(parseFlexSimulatorJson(pasteText));
  }

  function handleFormat() {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setSaveError("ว่างเปล่า — ไม่มีอะไรจัดรูปแบบ");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setPasteText(JSON.stringify(parsed, null, 2));
      setSaveError(null);
      setImportMsg("จัดรูปแบบ JSON แล้ว");
    } catch {
      setSaveError("JSON ไม่ถูกต้อง — จัดรูปแบบไม่ได้");
      setImportMsg(null);
    }
  }

  function handleClear() {
    setPasteText("");
    setImportMsg(null);
    setSaveError(null);
    setSaved(false);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setPasteText(text);
      setSaved(false);
      setSaveError(null);
      const result = parseFlexSimulatorJson(text);
      if (result.ok) {
        applyParsed(result);
      } else {
        setImportMsg(null);
      }
    } catch {
      setSaveError("อ่านไฟล์ไม่สำเร็จ");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateVar(i: number, patch: Partial<TemplateVariable>) {
    setDraft((d) => {
      const variables = d.variables.map((v, idx) =>
        idx === i ? { ...v, ...patch } : v
      );
      return { ...d, variables };
    });
    setSaved(false);
  }

  function addVar() {
    setDraft((d) => ({
      ...d,
      variables: [
        ...d.variables,
        { name: "new_var", example: "", required: false },
      ],
    }));
    setSaved(false);
  }

  function removeVar(i: number) {
    setDraft((d) => ({
      ...d,
      variables: d.variables.filter((_, idx) => idx !== i),
    }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      if (editorMode === "simulator") {
        const result = parseFlexSimulatorJson(pasteText);
        if (!result.ok) {
          setSaveError(
            result.error ||
              "JSON จาก Flex Simulator ไม่ถูกต้อง — แก้ก่อนบันทึก"
          );
          setSaved(false);
          return;
        }
        const pretty = prettyContents(result.contents);
        const next: ConsoleTemplate = {
          ...draft,
          kind: "raw-json",
          fields: {
            ...draft.fields,
            rawContents: pretty,
            ...(result.altText ? { altText: result.altText } : {}),
          },
          triggerExamples: examplesText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          conditionKey: draft.conditionKey.trim().replace(/\s+/g, "_"),
        };
        setDraft(next);
        setPasteText(pretty);
        await onSave(next);
        setSaved(true);
        return;
      }

      const next: ConsoleTemplate = {
        ...draft,
        triggerExamples: examplesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        conditionKey: draft.conditionKey.trim().replace(/\s+/g, "_"),
      };
      setDraft(next);
      await onSave(next);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  const previewFlex = useMemo(() => {
    if (editorMode === "simulator") {
      // Prefer applied fields; if paste is valid and differs, build from paste for live preview
      const live = parseFlexSimulatorJson(pasteText);
      if (live.ok) {
        return buildFlex("raw-json", {
          ...draft.fields,
          rawContents: prettyContents(live.contents),
          ...(live.altText ? { altText: live.altText } : {}),
        });
      }
    }
    return buildFlex(draft.kind, draft.fields);
  }, [editorMode, pasteText, draft.kind, draft.fields]);

  const jsonPreview = useMemo(() => {
    return JSON.stringify(
      {
        type: previewFlex.type,
        altText: previewFlex.altText,
        contents: previewFlex.contents,
      },
      null,
      2
    );
  }, [previewFlex]);

  return (
    <>
      <div className="space-between mb-12">
        <div className="row gap-8">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            ← กลับรายการ
          </button>
          <span className="text-sm text-muted">
            แก้ไขเทมเพลต ·{" "}
            <span className="code-pill">{draft.conditionKey || "—"}</span>
          </span>
        </div>
        <div className="row gap-8">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowJson((v) => !v)}
          >
            {showJson ? "ซ่อน JSON" : "ดูตัวอย่าง JSON"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={saving || saved}
            style={saved ? { opacity: 0.7 } : undefined}
          >
            {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "บันทึกเทมเพลต"}
          </button>
        </div>
      </div>

      {saveError && (
        <div
          className="card mb-12"
          style={{
            padding: "12px 16px",
            borderColor: "#FECACA",
            background: "#FEF2F2",
            color: "#B91C1C",
            fontSize: 13,
          }}
        >
          {saveError}
        </div>
      )}

      {saved && (
        <div className="success-banner">
          <div className="ok-ico">✓</div>
          <div style={{ flex: 1 }}>
            <div className="fw-600" style={{ color: "#15803D" }}>
              บันทึกเทมเพลตแล้ว · {draft.conditionKey}
            </div>
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>
              ขั้นตอนถัดไป: แทรกคำใบ้ลง Prompt ของ Agent เพื่อให้การ์ดนี้ถูกเรียกเมื่อลูกค้าพูดตรง
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onInsertHint(draft.conditionKey, draft.displayNameTh)
            }
          >
            แทรกคำใบ้ลง Prompt
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label className="label">ชื่อการ์ด</label>
              <input
                className="input"
                value={draft.displayNameTh}
                onChange={(e) => {
                  setDraft({ ...draft, displayNameTh: e.target.value });
                  setSaved(false);
                }}
              />
            </div>
            <div className="field">
              <label className="label">รหัสการ์ด</label>
              <input
                className="input mono"
                value={draft.conditionKey}
                onChange={(e) => {
                  setDraft({ ...draft, conditionKey: e.target.value });
                  setSaved(false);
                }}
              />
              <div className="hint">
                รหัสการ์ดใช้ใน Prompt เช่น ask_product · confirm_appointment
              </div>
            </div>
          </div>

          <div className="field">
            <label className="label">คำอธิบายกรณีการใช้งาน</label>
            <textarea
              className="textarea"
              style={{ minHeight: 64 }}
              value={draft.modelDescription}
              onChange={(e) => {
                setDraft({ ...draft, modelDescription: e.target.value });
                setSaved(false);
              }}
            />
          </div>

          <div className="field">
            <label className="label">ตัวอย่างข้อความกระตุ้น (บรรทัดละ 1)</label>
            <textarea
              className="textarea"
              style={{ minHeight: 72 }}
              value={examplesText}
              onChange={(e) => {
                setExamplesText(e.target.value);
                setSaved(false);
              }}
            />
            <div className="hint">
              ช่วยผู้ดูแลทดสอบว่าการ์ดนี้ถูกเรียกเมื่อไหร่
            </div>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <div className="space-between mb-8">
              <label className="label" style={{ margin: 0 }}>
                ตัวแปร
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addVar}
              >
                + เพิ่มตัวแปร
              </button>
            </div>
            <table
              className="table"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>ตัวอย่าง</th>
                  <th>จำเป็น</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.variables.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-sm text-muted">
                      ยังไม่มีตัวแปร
                    </td>
                  </tr>
                ) : (
                  draft.variables.map((v, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          className="input mono"
                          style={{ padding: "6px 8px" }}
                          value={v.name}
                          onChange={(e) =>
                            updateVar(i, { name: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ padding: "6px 8px" }}
                          value={v.example}
                          onChange={(e) =>
                            updateVar(i, { example: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={v.required}
                          onChange={(e) =>
                            updateVar(i, { required: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeVar(i)}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-16">
            <div className="space-between mb-8">
              <div className="fw-600">ตัวแก้ไขการ์ด Flex</div>
              <div className="row gap-8">
                <button
                  type="button"
                  className={`btn btn-sm ${
                    editorMode === "simulator" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => switchMode("simulator")}
                >
                  วาง JSON จาก Flex Simulator
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    editorMode === "form" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => switchMode("form")}
                >
                  ฟอร์มง่าย (built-in)
                </button>
              </div>
            </div>

            {editorMode === "simulator" ? (
              <div>
                <div className="field">
                  <label className="label">Alt text (ข้อความสำรอง)</label>
                  <input
                    className="input"
                    value={draft.fields.altText || ""}
                    onChange={(e) => setField("altText", e.target.value)}
                    placeholder="แสดงเมื่อ LINE แสดงข้อความสำรอง"
                  />
                </div>

                <div className="field">
                  <label className="label">วาง JSON จาก Flex Simulator</label>
                  <textarea
                    className="textarea mono"
                    style={{
                      minHeight: 220,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 12,
                    }}
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      setSaved(false);
                      setImportMsg(null);
                      setSaveError(null);
                    }}
                    placeholder={`{\n  "type": "bubble",\n  "body": { ... }\n}`}
                    spellCheck={false}
                  />
                  <div className="hint" style={{ marginTop: 6 }}>
                    ออกแบบใน{" "}
                    <a
                      href="https://developers.line.biz/flex-simulator/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", fontWeight: 600 }}
                    >
                      LINE Flex Message Simulator
                    </a>{" "}
                    แล้วคัดลอก JSON มาวางที่นี่ (รองรับ contents / flex message /
                    messages[])
                  </div>
                </div>

                <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleImport}
                  >
                    นำเข้า JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleFormat}
                  >
                    จัดรูปแบบ
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleClear}
                  >
                    ล้าง
                  </button>
                  <label
                    className="btn btn-secondary btn-sm"
                    style={{ cursor: "pointer", margin: 0 }}
                  >
                    เลือกไฟล์ .json
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: "none" }}
                      onChange={(e) =>
                        handleFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  {pasteValidation?.ok ? (
                    <span
                      className="tag tag-green"
                      style={{ fontWeight: 600 }}
                    >
                      JSON ใช้ได้ ·{" "}
                      {(pasteValidation.contents as { type?: string }).type ===
                      "carousel"
                        ? "carousel"
                        : "bubble"}
                    </span>
                  ) : pasteText.trim() ? (
                    <span
                      style={{ color: "#B91C1C", fontWeight: 500 }}
                    >
                      {pasteValidation && !pasteValidation.ok
                        ? pasteValidation.error
                        : "JSON ไม่ถูกต้อง"}
                    </span>
                  ) : (
                    <span className="text-muted text-sm">
                      ยังไม่มี JSON — วางจาก Simulator หรือเลือกไฟล์
                    </span>
                  )}
                </div>

                {importMsg && (
                  <div
                    className="text-sm mt-8"
                    style={{ color: "var(--accent-dark)" }}
                  >
                    {importMsg}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="field">
                  <label className="label">ชนิด Flex builder</label>
                  <select
                    className="select"
                    value={draft.kind}
                    onChange={(e) => setKind(e.target.value as TemplateId)}
                  >
                    {TEMPLATE_META.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.labelTh} ({m.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fw-600 mb-8">ฟิลด์การ์ด ({draft.kind})</div>
                {defs.map((def) => (
                  <div className="field" key={def.key}>
                    <label className="label">{def.label}</label>
                    {def.type === "textarea" ? (
                      <textarea
                        className="textarea"
                        value={draft.fields[def.key] || ""}
                        onChange={(e) => setField(def.key, e.target.value)}
                      />
                    ) : (
                      <input
                        className="input"
                        type={def.type === "url" ? "url" : "text"}
                        value={draft.fields[def.key] || ""}
                        onChange={(e) => setField(def.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="row gap-8 mt-8">
            <label className="row gap-8" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => {
                  setDraft({ ...draft, enabled: e.target.checked });
                  setSaved(false);
                }}
              />
              เปิดใช้งานเทมเพลตนี้
            </label>
          </div>

          {showJson && (
            <pre className="flex-preview-json mt-12">{jsonPreview}</pre>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            className="text-xs text-muted mb-8"
            style={{ alignSelf: "stretch", textAlign: "center" }}
          >
            พรีวิวบน LINE (สด)
          </div>
          <FlexPreview
            flex={previewFlex}
            agentName={agentName}
            conditionKey={draft.conditionKey}
            userBubble={
              examplesText.split("\n").map((s) => s.trim()).filter(Boolean)[0]
            }
          />
        </div>
      </div>
    </>
  );
}
