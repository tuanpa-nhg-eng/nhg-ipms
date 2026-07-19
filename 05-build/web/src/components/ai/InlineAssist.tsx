"use client";
/**
 * [Lát AI inline] <InlineAssist> — nút "✦ AI gợi ý" dùng chung cho 4 bề mặt Studio
 * (Task Cell form, KPI Linker, Derivation, Curation). Luồng HITL:
 * bấm ✦ → POST /ai/inline/:task (permission ai:assist, mock tất định) → thẻ gợi ý
 * dạng DIFF (cũ→mới) + lý do explainable → Chấp nhận / Sửa rồi chấp nhận / Bỏ.
 * "Chấp nhận" chỉ áp giá trị vào FORM của người dùng (onAccept) + chốt suggestion
 * qua /ai/inline/suggestions/:id/apply — KHÔNG ghi thẳng hệ thống (mọi thay đổi
 * thật vẫn đi qua endpoint nghiệp vụ có gate riêng).
 */
import { useState } from "react";
import { Sparkles, Check, PencilLine, X } from "lucide-react";
import { useStudio } from "@/lib/studio";
import { useI18n } from "@/lib/i18n";
import { ApiError } from "@/lib/api";

export type InlineTask = "taskcell.draft" | "taskcell.kpi_link" | "derivation.rule" | "curation.dedup";

export interface InlineDiffEntry { field: string; old: unknown; new: unknown }

export interface InlineAssistResult {
  suggestion: { id: string; status: string; type: string };
  proposal: Record<string, unknown>;
  reason: string;
  diff: InlineDiffEntry[] | null;
  model: string;
}

const STR = {
  vi: {
    button: "AI gợi ý",
    loading: "AI đang phân tích…",
    accept: "Chấp nhận",
    acceptEdit: "Sửa rồi chấp nhận",
    confirmEdit: "Chấp nhận bản đã sửa",
    cancelEdit: "Quay lại",
    editHint: "Sửa trực tiếp cột \"AI đề xuất\" rồi xác nhận — hệ thống học từ chỗ bạn sửa.",
    dismiss: "Bỏ",
    reasonLabel: "Vì sao",
    diffField: "Trường",
    diffOld: "Hiện tại",
    diffNew: "AI đề xuất",
    footer: "AI có thể sai, hãy kiểm tra lại trước khi lưu.",
    noPerm: "Tài khoản không có quyền ai:assist — dùng author@/curator@/dept@/designer@.",
  },
  en: {
    button: "AI suggest",
    loading: "AI is analyzing…",
    accept: "Accept",
    acceptEdit: "Edit then accept",
    confirmEdit: "Accept edited version",
    cancelEdit: "Back",
    editHint: "Edit the \"AI proposed\" column directly, then confirm — the system learns from your edits.",
    dismiss: "Dismiss",
    reasonLabel: "Why",
    diffField: "Field",
    diffOld: "Current",
    diffNew: "AI proposed",
    footer: "AI can make mistakes — please double-check before saving.",
    noPerm: "Your account lacks ai:assist — use author@/curator@/dept@/designer@.",
  },
};

const fmt = (v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name ?? JSON.stringify(x))).join(", ");
  }
  return JSON.stringify(v);
};

/** [Learning L0] Giá trị đề xuất → text sửa được (string giữ nguyên, còn lại JSON chính xác). */
const toEditable = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** Parse ngược theo KIỂU giá trị gốc — parse hỏng thì giữ nguyên đề xuất (fail-safe, không chặn form). */
const fromEditable = (s: string, original: unknown): unknown => {
  if (typeof original === "string") return s;
  try { return JSON.parse(s); } catch { return original; }
};

const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function InlineAssist({
  task, buildInput, configVersionId, onAccept, disabled, label,
}: {
  task: InlineTask;
  /** Dựng input gửi BE từ trạng thái form hiện tại; trả null nếu chưa đủ để gợi ý. */
  buildInput: () => Record<string, unknown> | null;
  configVersionId?: string | null;
  /** Người dùng chấp nhận → áp proposal vào form (KHÔNG tự ghi hệ thống). */
  onAccept: (proposal: Record<string, unknown>, diff: InlineDiffEntry[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const { call } = useStudio();
  const { lang } = useI18n();
  const t = STR[lang] ?? STR.vi;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InlineAssistResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // [Learning L0] chế độ "Sửa rồi chấp nhận" — sửa trực tiếp cột "AI đề xuất"
  const [editing, setEditing] = useState(false);
  const [draftVals, setDraftVals] = useState<Record<string, string>>({});

  const run = async () => {
    const input = buildInput();
    if (!input) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    setEditing(false);
    try {
      const out = await call<InlineAssistResult>(`/ai/inline/${task}`, {
        method: "POST",
        json: { input, ...(configVersionId ? { configVersionId } : {}) },
      });
      setResult(out);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.status === 403 ? t.noPerm : ae.message);
    } finally {
      setBusy(false);
    }
  };

  /** Field sửa được = nằm trong proposal (top-level hoặc trong proposal.fill). */
  const editableLoc = (field: string): "top" | "fill" | null => {
    if (!result) return null;
    if (Object.prototype.hasOwnProperty.call(result.proposal, field)) return "top";
    const fill = result.proposal.fill;
    if (isPlainObj(fill) && Object.prototype.hasOwnProperty.call(fill, field)) return "fill";
    return null;
  };

  /** Chốt suggestion phía BE — best-effort, không chặn UX form.
   *  [Learning L0] apply gửi kèm edited + finalPayload → BE diff proposed↔final. */
  const decide = async (
    decision: "apply" | "dismiss",
    extra?: { note?: string; edited?: boolean; finalPayload?: Record<string, unknown> },
  ) => {
    if (!result) return;
    try {
      await call(`/ai/inline/suggestions/${result.suggestion.id}/${decision}`, {
        method: "POST", json: { ...(extra ?? {}) },
      });
    } catch { /* suggestion đã được quyết nơi khác — không chặn form */ }
  };

  const accept = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await decide("apply", { edited: false });
      onAccept(result.proposal, result.diff ?? []);
      setResult(null);
    } finally { setBusy(false); }
  };

  const enterEdit = () => {
    if (!result) return;
    const seed: Record<string, string> = {};
    for (const d of result.diff ?? []) {
      if (editableLoc(d.field)) seed[d.field] = toEditable(d.new);
    }
    setDraftVals(seed);
    setEditing(true);
  };

  /** Xác nhận bản đã sửa: dựng finalPayload từ input người dùng → gửi BE học + áp vào form. */
  const confirmEdit = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const final: Record<string, unknown> = { ...result.proposal };
      if (isPlainObj(final.fill)) final.fill = { ...final.fill };
      const newDiff: InlineDiffEntry[] = (result.diff ?? []).map((d) => {
        const loc = editableLoc(d.field);
        if (!loc || !(d.field in draftVals)) return d;
        const parsed = fromEditable(draftVals[d.field], d.new);
        if (loc === "top") final[d.field] = parsed;
        else (final.fill as Record<string, unknown>)[d.field] = parsed;
        return { ...d, new: parsed };
      });
      await decide("apply", { note: "sửa rồi chấp nhận", edited: true, finalPayload: final });
      onAccept(final, newDiff);
      setResult(null);
      setEditing(false);
    } finally { setBusy(false); }
  };

  const dismiss = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await decide("dismiss");
      setResult(null);
      setEditing(false);
    } finally { setBusy(false); }
  };

  return (
    <div className="inline-assist">
      <button type="button" className="btn ghost sm inline-assist-btn" disabled={disabled || busy}
        onClick={() => void run()} title={t.footer}>
        <Sparkles size={13} /> {busy && !result ? t.loading : (label ?? t.button)}
      </button>

      {err && <div className="inline-assist-err">{err}</div>}

      {result && (
        <div className="inline-assist-card">
          <div className="inline-assist-head">
            <Sparkles size={13} /> {label ?? t.button}
            <span className="inline-assist-model">{result.model}</span>
          </div>
          {(result.diff?.length ?? 0) > 0 && (
            <table className="inline-assist-diff">
              <thead><tr><th>{t.diffField}</th><th>{t.diffOld}</th><th>{t.diffNew}</th></tr></thead>
              <tbody>
                {result.diff!.map((d) => (
                  <tr key={d.field}>
                    <td className="f">{d.field}</td>
                    <td className="old">{fmt(d.old)}</td>
                    <td className="new">
                      {editing && editableLoc(d.field) ? (
                        <input
                          className="inline-assist-edit"
                          value={draftVals[d.field] ?? ""}
                          onChange={(e) => setDraftVals((v) => ({ ...v, [d.field]: e.target.value }))}
                        />
                      ) : fmt(d.new)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="inline-assist-reason"><b>{t.reasonLabel}:</b> {result.reason}</div>
          {editing ? (
            <>
              <div className="inline-assist-reason">{t.editHint}</div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn primary sm" disabled={busy} onClick={() => void confirmEdit()}>
                  <Check size={13} /> {t.confirmEdit}
                </button>
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditing(false)}>
                  {t.cancelEdit}
                </button>
              </div>
            </>
          ) : (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn primary sm" disabled={busy} onClick={() => void accept()}>
                <Check size={13} /> {t.accept}
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={enterEdit}>
                <PencilLine size={13} /> {t.acceptEdit}
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void dismiss()}>
                <X size={13} /> {t.dismiss}
              </button>
            </div>
          )}
          <div className="inline-assist-footer">{t.footer}</div>
        </div>
      )}
    </div>
  );
}
