"use client";
/**
 * Task Cell Studio (Spec_BU_Authoring_Gate §6) — cổng BU AUTHOR tự soạn Task Cell gắn KPI:
 * form tập bắt buộc 7 nhóm (A định danh · B RACI · C I/O · D đo lường · E mức AI) + KPI
 * Linker → lưu draft (quality report hiện ngay, explainable) → Gửi kiểm duyệt.
 * Đăng nhập bằng author@ (scope org_unit) để thấy đúng trải nghiệm BU.
 */
import { useCallback, useEffect, useState } from "react";
import { BookPlus, CircleCheck, CircleX, Send, SquarePen } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { InlineAssist } from "@/components/ai/InlineAssist";
import { useStudio } from "@/lib/studio";
import { CellPayload, LibraryContribution, OrgUnit } from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  draft: "gray", submitted: "amber", in_review: "amber", needs_changes: "red",
  approved: "green", published: "green", rejected: "red", deprecated: "gray",
};
const AI_LEVELS = ["manual", "assist", "augment", "auto_hitl"];
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const EMPTY_FORM = {
  code: "", nameVi: "", responsibleRole: "", accountableRole: "",
  inputs: "", outputs: "", measures: "", aiLevel: "assist", orgUnitId: "",
  kpiRef: "", // link KPI có sẵn trong Từ điển (phân biệt với kpi = đề xuất KPI mới)
  withKpi: false, kpiCode: "", kpiNameVi: "", kpiMethod: "manual", kpiDirection: "forward", kpiDataSource: "",
};

export default function TaskCellStudioPage() {
  const { call } = useStudio();
  const [mine, setMine] = useState<LibraryContribution[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [selected, setSelected] = useState<LibraryContribution | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null); // [F103] sửa contribution needs_changes
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });
  const set = (k: keyof typeof EMPTY_FORM) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const reload = useCallback(async () => {
    try {
      const list = await call<LibraryContribution[]>("/library/contributions");
      setMine(list);
      setSelected((prev) => list.find((c) => c.id === prev?.id) ?? null);
    } catch (e) { fail(e); }
  }, [call]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { call<OrgUnit[]>("/org-units").then(setUnits).catch(fail); }, [call]);

  const buildPayload = (): CellPayload => ({
    code: form.code.trim().toUpperCase(),
    nameVi: form.nameVi.trim(),
    responsibleRole: form.responsibleRole.trim() || undefined,
    accountableRole: form.accountableRole.trim() || undefined,
    inputs: csv(form.inputs), outputs: csv(form.outputs), measures: csv(form.measures),
    aiLevel: form.aiLevel,
    ...(form.kpiRef.trim() ? { kpiRef: form.kpiRef.trim().toUpperCase() } : {}),
    ...(form.withKpi ? {
      kpi: {
        code: form.kpiCode.trim() || undefined,
        nameVi: form.kpiNameVi.trim(),
        method: form.kpiMethod as "manual" | "system",
        direction: form.kpiDirection as "forward" | "reverse",
        ...(form.kpiMethod === "system" ? { dataSource: form.kpiDataSource.trim() } : {}),
      },
    } : {}),
  });

  const saveDraft = async () => {
    setBusy(true);
    try {
      // [F103] editingId = vòng needs_changes: PATCH (BE tự quay draft + re-gate),
      // không tạo bản mới trùng mã tự đấu với chính mình
      const c = editingId
        ? await call<LibraryContribution>(`/library/contributions/${editingId}`, {
            method: "PATCH", json: { payload: buildPayload() },
          })
        : await call<LibraryContribution>("/library/contributions", {
            method: "POST",
            json: {
              type: form.withKpi ? "task_cell_with_kpi" : "task_cell",
              payload: buildPayload(),
              ...(form.orgUnitId ? { orgUnitId: form.orgUnitId } : {}),
            },
          });
      setMsg({ kind: "ok", text: `Đã lưu draft — quality score ${c.qualityScore}` });
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      await reload();
      setSelected(c);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  /** [F103] nạp payload contribution vào form để sửa (needs_changes/draft). */
  const startEdit = (c: LibraryContribution) => {
    const p = c.payload;
    const m = (p.measures ?? []).map((x) => (typeof x === "string" ? x : x.name));
    setForm({
      code: p.code ?? "", nameVi: p.nameVi ?? "",
      responsibleRole: p.responsibleRole ?? "", accountableRole: p.accountableRole ?? "",
      inputs: (p.inputs ?? []).join(", "), outputs: (p.outputs ?? []).join(", "),
      measures: m.join(", "), aiLevel: p.aiLevel ?? "assist",
      orgUnitId: c.orgUnitId ?? "", kpiRef: p.kpiRef ?? "",
      withKpi: !!p.kpi,
      kpiCode: p.kpi?.code ?? "", kpiNameVi: p.kpi?.nameVi ?? "",
      kpiMethod: p.kpi?.method ?? "manual", kpiDirection: p.kpi?.direction ?? "forward",
      kpiDataSource: p.kpi?.dataSource ?? "",
    });
    setEditingId(c.id);
    setSelected(c);
    setMsg({ kind: "ok", text: `Đang sửa ${p.code ?? c.id} — Lưu sẽ quay về draft để gửi duyệt lại` });
  };

  /** [AI inline] Áp fill của taskcell.draft vào form (arrays → csv thân thiện). */
  const applyDraftFill = (proposal: Record<string, unknown>) => {
    const fill = (proposal.fill ?? {}) as Record<string, unknown>;
    const toCsv = (v: unknown) => Array.isArray(v)
      ? v.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name ?? "")).filter(Boolean).join(", ")
      : String(v ?? "");
    setForm((f) => ({
      ...f,
      ...(fill.code ? { code: String(fill.code) } : {}),
      ...(fill.nameVi ? { nameVi: String(fill.nameVi) } : {}),
      ...(fill.responsibleRole ? { responsibleRole: String(fill.responsibleRole) } : {}),
      ...(fill.accountableRole ? { accountableRole: String(fill.accountableRole) } : {}),
      ...(fill.inputs ? { inputs: toCsv(fill.inputs) } : {}),
      ...(fill.outputs ? { outputs: toCsv(fill.outputs) } : {}),
      ...(fill.measures ? { measures: toCsv(fill.measures) } : {}),
      ...(fill.aiLevel ? { aiLevel: String(fill.aiLevel) } : {}),
    }));
    setMsg({ kind: "ok", text: "Đã áp gợi ý AI vào form — kiểm tra lại rồi Lưu draft (AI có thể sai)" });
  };

  const submit = async (c: LibraryContribution) => {
    setBusy(true);
    try {
      await call(`/library/contributions/${c.id}/submit`, { method: "POST" });
      setMsg({ kind: "ok", text: "Đã gửi kiểm duyệt — curator sẽ nhận trong hàng đợi" });
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Task Cell Studio" }}>
      <div className="page-head">
        <div className="eyebrow">BU Authoring Gate — soạn thảo</div>
        <h1>Đóng góp Task Cell &amp; KPI</h1>
        <p>BU hiểu nghiệp vụ nhất → tự soạn (dùng ngay trong BU); vào thư viện dùng chung phải qua kiểm duyệt (SoD: soạn ⟂ duyệt).</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <div>
          <Card title={<><SquarePen size={15} /> Soạn Task Cell mới</>}
            sub="Tập bắt buộc của 7 nhóm thuộc tính — thiếu gì quality report chỉ ra ngay">
            <div className="studio-toolbar">
              <div className="studio-field">
                <label>A — Mã (hệ TS-G01-C02-T005)</label>
                <input className="studio-input" style={{ width: 160 }} placeholder="TS-G01-T010"
                  value={form.code} onChange={set("code")} />
              </div>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>A — Tên tác vụ (VI)</label>
                <input className="studio-input" value={form.nameVi} onChange={set("nameVi")} />
              </div>
              <div className="studio-field">
                <label>Đơn vị (scope)</label>
                <select className="studio-select" value={form.orgUnitId} onChange={set("orgUnitId")}>
                  <option value="">— chọn —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                </select>
              </div>
            </div>
            <div className="studio-toolbar">
              <div className="studio-field" style={{ flex: 1 }}>
                <label>B — Responsible</label>
                <input className="studio-input" placeholder="admissions_officer"
                  value={form.responsibleRole} onChange={set("responsibleRole")} />
              </div>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>B — Accountable</label>
                <input className="studio-input" placeholder="admissions_manager"
                  value={form.accountableRole} onChange={set("accountableRole")} />
              </div>
              <div className="studio-field">
                <label>E — Mức AI</label>
                <select className="studio-select" value={form.aiLevel} onChange={set("aiLevel")}>
                  {AI_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="studio-toolbar">
              <div className="studio-field" style={{ flex: 1 }}>
                <label>C — Inputs (csv)</label>
                <input className="studio-input" placeholder="danh sách lead, lịch hẹn"
                  value={form.inputs} onChange={set("inputs")} />
              </div>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>C — Outputs (csv)</label>
                <input className="studio-input" placeholder="log tư vấn"
                  value={form.outputs} onChange={set("outputs")} />
              </div>
              <div className="studio-field" style={{ flex: 1 }}>
                <label>D — Measures (csv)</label>
                <input className="studio-input" placeholder="SLA 24h, tỷ lệ chốt"
                  value={form.measures} onChange={set("measures")} />
              </div>
            </div>

            {/* [AI inline] taskcell.draft — điền nhóm A–G còn thiếu theo quality gate */}
            <div style={{ margin: "6px 0" }}>
              <InlineAssist task="taskcell.draft" label="AI điền nhóm A–G thiếu"
                buildInput={() => ({ payload: buildPayload() })}
                onAccept={(p) => applyDraftFill(p)} disabled={busy} />
            </div>

            <div className="studio-toolbar">
              <div className="studio-field">
                <label>KPI Ref — link Từ điển KPI (41 mã)</label>
                <input className="studio-input" style={{ width: 160 }} placeholder="FIN-01"
                  value={form.kpiRef} onChange={set("kpiRef")} />
              </div>
              {/* [AI inline] taskcell.kpi_link — gợi ý kpiRef từ Từ điển KPI + lý do */}
              <div style={{ alignSelf: "flex-end" }}>
                <InlineAssist task="taskcell.kpi_link" label="AI gợi ý KPI"
                  buildInput={() => ({ payload: buildPayload() })}
                  onAccept={(p) => {
                    if (p.kpiRef) setForm((f) => ({ ...f, kpiRef: String(p.kpiRef) }));
                    setMsg({ kind: "ok", text: `Đã gắn kpiRef ${p.kpiRef} — kiểm tra lại trước khi lưu` });
                  }}
                  disabled={busy || !form.nameVi} />
              </div>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, margin: "6px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={form.withKpi}
                onChange={(e) => setForm((f) => ({ ...f, withKpi: e.target.checked }))} />
              <b>KPI Linker</b> — gắn KPI đề xuất kèm cell (KPI Designer Agent gợi ý ở lát AI)
            </label>
            {form.withKpi && (
              <div className="studio-toolbar">
                <div className="studio-field">
                  <label>Mã KPI (trống = sinh từ cell)</label>
                  <input className="studio-input" style={{ width: 140 }} placeholder="KPI-TS-010"
                    value={form.kpiCode} onChange={set("kpiCode")} />
                </div>
                <div className="studio-field" style={{ flex: 1 }}>
                  <label>Tên KPI</label>
                  <input className="studio-input" value={form.kpiNameVi} onChange={set("kpiNameVi")} />
                </div>
                <div className="studio-field">
                  <label>Method</label>
                  <select className="studio-select" value={form.kpiMethod} onChange={set("kpiMethod")}>
                    <option value="manual">manual</option>
                    <option value="system">system</option>
                  </select>
                </div>
                <div className="studio-field">
                  <label>Direction</label>
                  <select className="studio-select" value={form.kpiDirection} onChange={set("kpiDirection")}>
                    <option value="forward">forward</option>
                    <option value="reverse">reverse</option>
                  </select>
                </div>
                {form.kpiMethod === "system" && (
                  <div className="studio-field">
                    <label>Data source (bắt buộc)</label>
                    <input className="studio-input" placeholder="crm" value={form.kpiDataSource}
                      onChange={set("kpiDataSource")} />
                  </div>
                )}
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary sm" disabled={busy || !form.code || !form.nameVi}
                onClick={() => void saveDraft()}>
                <BookPlus size={14} /> {editingId ? "Lưu bản sửa" : "Lưu draft"}
              </button>
              {editingId && (
                <button className="btn ghost sm" disabled={busy}
                  onClick={() => { setEditingId(null); setForm({ ...EMPTY_FORM }); }}>
                  Huỷ sửa
                </button>
              )}
            </div>
          </Card>

          <div style={{ height: 12 }} />
          <Card title="Đóng góp của tôi" sub="Draft dùng ngay trong BU; vào thư viện chung phải qua curation">
            <table className="table">
              <thead><tr><th>Mã</th><th>Trạng thái</th><th className="rt">Score</th><th></th></tr></thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.id}
                    style={selected?.id === c.id ? { background: "var(--nhg-primary-subtle)" } : undefined}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, cursor: "pointer" }}
                      onClick={() => setSelected(c)}>
                      {c.payload.code ?? c.payload.kpi?.code ?? "—"}
                      {c.type !== "task_cell" && <Badge tone="gray">+KPI</Badge>}
                    </td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? "gray"}>{c.status}</Badge></td>
                    <td className="rt">{c.qualityScore ?? "—"}</td>
                    <td>
                      {(c.status === "draft" || c.status === "needs_changes") && (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn ghost sm" disabled={busy} onClick={() => startEdit(c)}>
                            <SquarePen size={12} /> Sửa
                          </button>
                          <button className="btn primary sm" disabled={busy} onClick={() => void submit(c)}>
                            <Send size={12} /> Gửi duyệt
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {mine.length === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>
                    Chưa có đóng góp nào — soạn Task Cell đầu tiên ở trên.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Quality report" sub={selected
          ? `${selected.payload.code ?? "—"} · từng check explainable`
          : "Chọn một đóng góp để xem"}>
          {selected?.qualityReport && (
            <>
              <div style={{ marginBottom: 8 }}>
                <Badge tone={selected.qualityReport.ok ? "green" : "red"}>
                  {selected.qualityReport.ok ? "ĐẠT chuẩn publish" : "CHƯA đạt"} · {selected.qualityReport.score}%
                </Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {selected.qualityReport.checks.map((ch) => (
                  <div key={ch.id} style={{ display: "flex", gap: 7, fontSize: 12, alignItems: "flex-start" }}>
                    {ch.passed
                      ? <CircleCheck size={14} style={{ color: "var(--nhg-primary)", flexShrink: 0, marginTop: 1 }} />
                      : <CircleX size={14} style={{ color: "#ED2024", flexShrink: 0, marginTop: 1 }} />}
                    <span>
                      {ch.label}
                      {ch.note && <em style={{ color: "var(--nhg-text-secondary)" }}> — {ch.note}</em>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {selected && (selected.reviews?.length ?? 0) > 0 && (
            <>
              <div style={{ margin: "12px 0 6px", fontSize: 11, textTransform: "uppercase", color: "var(--nhg-text-secondary)", fontWeight: 600 }}>
                Lịch sử duyệt
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {selected.reviews!.map((r) => (
                  <div key={r.id}>
                    <Badge tone="gray">{r.action}</Badge> {r.note ?? ""}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
