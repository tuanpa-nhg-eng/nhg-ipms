"use client";
/**
 * ④ Auto-Derivation Engine UI (Spec §13) — trái tim tailor-made:
 * thư viện KPI template + rule match/emit → RUN PREVIEW (bảng diff với cột "Vì sao"
 * explainable từ engine) → APPLY vào draft (KHÔNG publish — bước SoD riêng).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenText, ListTree, Play, Plus, Rocket } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { InlineAssist } from "@/components/ai/InlineAssist";
import { useStudio } from "@/lib/studio";
import { ConfigVersion, DerivationRule, DerivationRunOut, KpiTemplate } from "@/lib/api";

const ACTION_TONE: Record<string, string> = { add: "green", update: "amber", keep: "gray", error: "red" };

/** "a, b , c" → ["a","b","c"] (bỏ rỗng) — input csv thân thiện người dùng. */
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function DerivationPage() {
  const { call, versionId, setVersionId } = useStudio();
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [rules, setRules] = useState<DerivationRule[]>([]);
  const [preview, setPreview] = useState<DerivationRunOut | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [aiDesc, setAiDesc] = useState(""); // [AI inline] mô tả rule cần AI gợi ý
  const [tplForm, setTplForm] = useState({ code: "", nameVi: "", functionTags: "", roleFamilyCodes: "", taskCellRefs: "" });
  const [ruleForm, setRuleForm] = useState({
    priority: "100", functionCodes: "", roleFamilyCodes: "", orgLevel: "", grade: "",
    templateCodes: "", weight: "", groupLabel: "",
  });

  const drafts = useMemo(() => versions.filter((v) => v.status === "draft" || v.status === "preview"), [versions]);
  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  useEffect(() => {
    call<ConfigVersion[]>("/config-versions").then(setVersions).catch(fail);
    call<KpiTemplate[]>("/kpi-templates").then(setTemplates).catch(fail);
  }, [call]);

  const reloadRules = useCallback(() => {
    if (!versionId) { setRules([]); return; }
    call<DerivationRule[]>(`/derivation-rules?configVersionId=${versionId}`).then(setRules).catch(fail);
  }, [call, versionId]);
  useEffect(() => { reloadRules(); setPreview(null); }, [reloadRules]);

  const createTemplate = async () => {
    setBusy(true);
    try {
      await call("/kpi-templates", {
        method: "POST",
        json: {
          code: tplForm.code.toUpperCase(), nameVi: tplForm.nameVi,
          functionTags: csv(tplForm.functionTags),
          roleFamilyCodes: csv(tplForm.roleFamilyCodes),
          taskCellRefs: csv(tplForm.taskCellRefs),
        },
      });
      setTplForm({ code: "", nameVi: "", functionTags: "", roleFamilyCodes: "", taskCellRefs: "" });
      setTemplates(await call<KpiTemplate[]>("/kpi-templates"));
      setMsg({ kind: "ok", text: "Đã thêm KPI template vào thư viện" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const createRule = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      const match: Record<string, string[]> = {};
      if (ruleForm.functionCodes) match.function_codes = csv(ruleForm.functionCodes);
      if (ruleForm.roleFamilyCodes) match.role_family_codes = csv(ruleForm.roleFamilyCodes);
      if (ruleForm.orgLevel) match.org_level = csv(ruleForm.orgLevel);
      if (ruleForm.grade) match.grade = csv(ruleForm.grade);
      const emit: Record<string, unknown> = { kpi_template_codes: csv(ruleForm.templateCodes) };
      // [F84] chặn NaN tại chỗ nhập (không đợi lỗi ở preview); "" = không set
      if (ruleForm.weight.trim() !== "") {
        const w = Number(ruleForm.weight);
        if (!Number.isFinite(w) || w < 0) {
          setMsg({ kind: "err", text: "Weight phải là số ≥ 0" });
          setBusy(false);
          return;
        }
        emit.weight = w;
      }
      if (ruleForm.groupLabel) emit.group_label = ruleForm.groupLabel;
      await call("/derivation-rules", {
        method: "POST",
        json: { configVersionId: versionId, priority: Number(ruleForm.priority) || 100, match, emit },
      });
      setRuleForm({ priority: "100", functionCodes: "", roleFamilyCodes: "", orgLevel: "", grade: "", templateCodes: "", weight: "", groupLabel: "" });
      reloadRules();
      setMsg({ kind: "ok", text: "Đã thêm rule — chạy lại preview để xem hiệu ứng" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const runPreview = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      const out = await call<DerivationRunOut>("/derivation/run", {
        method: "POST", json: { configVersionId: versionId, trigger: "manual" },
      });
      setPreview(out);
      setMsg({ kind: "ok", text: `Preview xong: +${out.summary.add} add · ${out.summary.keep} keep · ${out.summary.error} lỗi` });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await call(`/derivation/runs/${preview.run.id}/apply`, { method: "POST" });
      setMsg({ kind: "ok", text: "Đã apply vào DRAFT (KPI sinh ra vẫn chờ duyệt; publish là bước SoD riêng)" });
      setPreview(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const matchLabel = (r: DerivationRule) =>
    [
      r.match.function_codes?.length ? `fn:${r.match.function_codes.join("|")}` : null,
      r.match.role_family_codes?.length ? `role:${r.match.role_family_codes.join("|")}` : null,
      r.match.org_level?.length ? `level:${r.match.org_level.join("|")}` : null,
      r.match.grade?.length ? `grade:${r.match.grade.join("|")}` : null,
    ].filter(Boolean).join(" · ") || "wildcard (mọi vị trí)";

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Derivation Engine" }}>
      <div className="page-head">
        <div className="eyebrow">④ Auto-Derivation Engine</div>
        <h1>Kéo theo KPI &amp; Scorecard</h1>
        <p>Chọn function/role ⇒ rule match ⇒ preview diff <b>kèm lý do</b> ⇒ apply vào draft. Cần dữ liệu position + role_family + chức năng đã gán ở Sơ đồ tổ chức.</p>
      </div>

      <div className="studio-toolbar">
        <div className="studio-field">
          <label>Config version (draft)</label>
          <select className="studio-select" value={versionId ?? ""}
            onChange={(e) => setVersionId(e.target.value || null)}>
            <option value="">— chọn —</option>
            {drafts.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.status})</option>)}
          </select>
        </div>
        <button className="btn primary" disabled={busy || !versionId} onClick={() => void runPreview()}>
          <Play size={15} /> Chạy preview
        </button>
        {preview && (
          <button className="btn accent" disabled={busy || preview.summary.error > 0} onClick={() => void apply()}
            title={preview.summary.error > 0 ? "Còn lỗi — sửa rules trước" : "Ghi vào draft"}>
            <Rocket size={15} /> Apply vào draft
          </button>
        )}
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <div>
          {preview && (
            <>
              <Card title={<><ListTree size={15} /> Preview — diff explainable</>}
                sub={<>
                  <Badge tone="green">add {preview.summary.add}</Badge>{" "}
                  <Badge tone="gray">keep {preview.summary.keep}</Badge>{" "}
                  <Badge tone="red">error {preview.summary.error}</Badge>
                </>}>
                <table className="table">
                  <thead><tr><th>Đối tượng</th><th>Hành động</th><th>Vì sao (từ engine)</th></tr></thead>
                  <tbody>
                    {preview.results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.targetType}</td>
                        <td><Badge tone={ACTION_TONE[r.action] ?? "gray"}>{r.action}</Badge></td>
                        <td style={{ fontSize: 12 }}>{r.reason}</td>
                      </tr>
                    ))}
                    {preview.results.length === 0 && (
                      <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>
                        Không có gì để kéo — kiểm tra: đơn vị đã gán chức năng? có position/role_family? rule có match?
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </Card>
              <div style={{ height: 12 }} />
            </>
          )}

          <Card title="Rules (version-scoped)" sub={`${rules.length} rule — priority cao thắng khi trùng template`}>
            <table className="table">
              <thead><tr><th className="rt">Ưu tiên</th><th>Match</th><th>Emit</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="rt">{r.priority}</td>
                    <td style={{ fontSize: 11.5 }}>{matchLabel(r)}</td>
                    <td style={{ fontSize: 11.5 }}>
                      {(r.emit.kpi_template_codes ?? []).join(", ")}
                      {r.emit.weight != null && <Badge tone="gray">w={r.emit.weight}</Badge>}
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>Chưa có rule cho version này.</td></tr>
                )}
              </tbody>
            </table>

            {/* [AI inline] derivation.rule — AI gợi ý match/emit từ mô tả, kèm "vì sao" */}
            <div className="studio-toolbar" style={{ marginTop: 12 }}>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>Mô tả rule cần tạo (AI gợi ý)</label>
                <input className="studio-input" placeholder="vd: KPI doanh thu cho các phòng tuyển sinh"
                  value={aiDesc} onChange={(e) => setAiDesc(e.target.value)} />
              </div>
              <div style={{ alignSelf: "flex-end" }}>
                <InlineAssist task="derivation.rule" label="AI gợi ý rule"
                  configVersionId={versionId}
                  buildInput={() => (aiDesc.trim() ? { description: aiDesc.trim() } : null)}
                  onAccept={(p) => {
                    const rule = (p.rule ?? {}) as { match?: Record<string, unknown>; emit?: Record<string, unknown> };
                    const j = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
                    setRuleForm((f) => ({
                      ...f,
                      functionCodes: j(rule.match?.function_codes),
                      roleFamilyCodes: j(rule.match?.role_family_codes),
                      orgLevel: j(rule.match?.org_level),
                      grade: j(rule.match?.grade),
                      templateCodes: j(rule.emit?.kpi_template_codes),
                      weight: rule.emit?.weight != null ? String(rule.emit.weight) : f.weight,
                      groupLabel: typeof rule.emit?.group_label === "string" ? rule.emit.group_label : f.groupLabel,
                    }));
                    setMsg({ kind: "ok", text: "Đã áp gợi ý rule vào form — kiểm tra rồi bấm Thêm rule (AI có thể sai)" });
                  }}
                  disabled={busy || !versionId || !aiDesc.trim()} />
              </div>
            </div>

            <div className="studio-toolbar" style={{ marginTop: 12 }}>
              <div className="studio-field">
                <label>Ưu tiên</label>
                <input className="studio-input" style={{ width: 60 }} value={ruleForm.priority}
                  onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} />
              </div>
              <div className="studio-field">
                <label>Match: function (csv)</label>
                <input className="studio-input" placeholder="ADMISSION" value={ruleForm.functionCodes}
                  onChange={(e) => setRuleForm({ ...ruleForm, functionCodes: e.target.value })} />
              </div>
              <div className="studio-field">
                <label>Match: role family (csv)</label>
                <input className="studio-input" placeholder="TS" value={ruleForm.roleFamilyCodes}
                  onChange={(e) => setRuleForm({ ...ruleForm, roleFamilyCodes: e.target.value })} />
              </div>
              <div className="studio-field">
                <label>Emit: template codes (csv)</label>
                <input className="studio-input" placeholder="KPI-TS-001, KPI-TS-002" value={ruleForm.templateCodes}
                  onChange={(e) => setRuleForm({ ...ruleForm, templateCodes: e.target.value })} />
              </div>
              <div className="studio-field">
                <label>Weight</label>
                <input className="studio-input" style={{ width: 60 }} placeholder="50" value={ruleForm.weight}
                  onChange={(e) => setRuleForm({ ...ruleForm, weight: e.target.value })} />
              </div>
              <div className="studio-field">
                <label>Nhóm</label>
                <input className="studio-input" style={{ width: 110 }} placeholder="Chuyên môn" value={ruleForm.groupLabel}
                  onChange={(e) => setRuleForm({ ...ruleForm, groupLabel: e.target.value })} />
              </div>
              <button className="btn primary sm" disabled={busy || !versionId || !ruleForm.templateCodes}
                onClick={() => void createRule()}>
                <Plus size={14} /> Thêm rule
              </button>
            </div>
          </Card>
        </div>

        <Card title={<><BookOpenText size={15} /> Thư viện KPI template</>}
          sub={`${templates.length} template (global + tenant)`}>
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>Cells</th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                    {t.code}{!t.tenantId && <Badge tone="gray">global</Badge>}
                  </td>
                  <td style={{ fontSize: 12 }}>{t.nameVi}</td>
                  <td style={{ fontSize: 11 }}>{t.taskCellRefs.length}</td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>Thư viện trống.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="studio-field">
              <label>Mã / Tên template mới</label>
              <div className="row" style={{ gap: 6 }}>
                <input className="studio-input" style={{ width: 120 }} placeholder="KPI-TS-001"
                  value={tplForm.code} onChange={(e) => setTplForm({ ...tplForm, code: e.target.value })} />
                <input className="studio-input" style={{ flex: 1 }} placeholder="Tỷ lệ chuyển đổi lead"
                  value={tplForm.nameVi} onChange={(e) => setTplForm({ ...tplForm, nameVi: e.target.value })} />
              </div>
            </div>
            <div className="studio-field">
              <label>Function tags (csv)</label>
              <input className="studio-input" placeholder="ADMISSION" value={tplForm.functionTags}
                onChange={(e) => setTplForm({ ...tplForm, functionTags: e.target.value })} />
            </div>
            <div className="studio-field">
              <label>Task cell refs (csv — lineage)</label>
              <input className="studio-input" placeholder="TS-S01, TS-S02" value={tplForm.taskCellRefs}
                onChange={(e) => setTplForm({ ...tplForm, taskCellRefs: e.target.value })} />
            </div>
            <button className="btn ghost sm" disabled={busy || !tplForm.code || !tplForm.nameVi}
              onClick={() => void createTemplate()}>
              <Plus size={13} /> Thêm template
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
