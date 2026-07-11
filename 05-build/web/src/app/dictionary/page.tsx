"use client";
/**
 * Từ điển Tác vụ — tra cứu canonical (read-only, nối API thật /task-dictionary).
 * Cây Phòng → Nhóm → Tác vụ · tìm kiếm + lọc (mức AI/KPI) · panel giải phẫu 7 nhóm
 * thuộc tính + KPI gắn kèm (định nghĩa/công thức/grain/phân loại/ranh giới AI).
 * Song ngữ VI/EN (theo toggle app) · light/dark theo Design System.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenText, Search, LogOut, ChevronRight, ChevronDown, Layers, Target,
  Users, ArrowRightLeft, Gauge, Bot, ShieldAlert, Recycle, Languages, X,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { useI18n } from "@/lib/i18n";
import { DictCellDetail, DictCellRow, DictListResponse } from "@/lib/api";

const AI_TONE: Record<string, string> = {
  manual: "red", assist: "amber", augment: "blue", auto_hitl: "green", system: "blue",
};
const RISK_TONE: Record<string, string> = { low: "green", medium: "amber", high: "red" };

/** slug phòng ban từ groupCode 'TS-G01' → 'TS'. */
const deptOf = (groupCode?: string | null) => (groupCode ? groupCode.split("-G")[0] : "—");
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : [];

export default function DictionaryPage() {
  const { call, session, logout } = useStudio();
  const { lang, toggle } = useI18n();
  const L = (vi: string, en: string) => (lang === "vi" ? vi : en);

  const [data, setData] = useState<DictListResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [aiLevel, setAiLevel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DictCellDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setData(await call<DictListResponse>("/task-dictionary"));
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [call]);

  const openDetail = useCallback(async (code: string) => {
    setSelected(code);
    setDetail(null);
    setDetailBusy(true);
    try {
      setDetail(await call<DictCellDetail>(`/task-dictionary/${encodeURIComponent(code)}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDetailBusy(false);
    }
  }, [call]);

  // Cây Phòng → Nhóm từ facets.groups
  const tree = useMemo(() => {
    const byDept = new Map<string, Array<{ groupCode: string; label?: string | null; count: number }>>();
    for (const g of data?.facets.groups ?? []) {
      const d = deptOf(g.groupCode);
      const arr = byDept.get(d) ?? [];
      arr.push({ groupCode: g.groupCode, label: g.groupLabel, count: g.count });
      byDept.set(d, arr);
    }
    return [...byDept.entries()]
      .map(([d, groups]) => ({ dept: d, groups, count: groups.reduce((s, x) => s + x.count, 0) }))
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [data]);

  // Lọc client-side (tức thời) trên tập canonical đã tải
  const cells = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    const qn = q.trim() ? norm(q) : null;
    return (data?.cells ?? []).filter((c) => {
      if (dept && deptOf(c.groupCode) !== dept) return false;
      if (group && c.groupCode !== group) return false;
      if (aiLevel && c.aiLevel !== aiLevel) return false;
      if (qn) {
        const hay = norm(`${c.code} ${c.nameVi} ${c.nameEn ?? ""} ${c.kpiRef ?? ""}`);
        if (!hay.includes(qn)) return false;
      }
      return true;
    });
  }, [data, q, dept, group, aiLevel]);

  const clearFilters = () => { setDept(null); setGroup(null); setAiLevel(null); setQ(""); };

  return (
    <AppShell crumb={{ section: L("Từ điển Tác vụ", "Task Dictionary"), page: L("Tra cứu", "Browse") }}>
      <div className="page-head">
        <div className="eyebrow">{L("Tài nguyên tham chiếu toàn hàng · read-only", "Enterprise reference · read-only")}</div>
        <h1>{L("Từ điển Tác vụ", "Task Dictionary")}</h1>
        <p>
          {L("Tra cứu tác vụ chuẩn (canonical) đã gắn KPI — cây phòng/nhóm, tìm kiếm, giải phẫu 7 nhóm thuộc tính.",
            "Browse canonical tasks linked to KPIs — department/group tree, search, 7-facet anatomy.")}
          {" · "}
          <b>{session?.email}</b>
          <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={toggle}>
            <Languages size={13} /> {lang === "vi" ? "EN" : "VI"}
          </button>
          <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={logout}>
            <LogOut size={13} /> {L("Đổi phiên", "Switch")}
          </button>
        </p>
      </div>

      {err && <div className="studio-msg err">{err}</div>}
      {data?.capped && (
        <div className="studio-msg err">
          {L("Thư viện vượt trần hiển thị — danh sách/bộ lọc chỉ trên phần đầu. Cần phân trang.",
            "Library exceeds display cap — list/filter cover the first page only. Pagination needed.")}
        </div>
      )}

      <div className="dict-stats">
        <div><b>{data?.total ?? "—"}</b> {L("tác vụ chuẩn", "canonical tasks")}</div>
        <div><b>{tree.length}</b> {L("phòng ban", "departments")}</div>
        <div><b>{data?.facets.kpis.length ?? "—"}</b> {L("KPI được gắn", "linked KPIs")}</div>
        <div><b>{cells.length}</b> {L("khớp bộ lọc", "match filter")}</div>
      </div>

      <div className="dict-layout">
        {/* Rail trái — cây phòng/nhóm + lọc */}
        <aside className="dict-rail">
          <div className="dict-search">
            <Search size={15} />
            <input
              placeholder={L("Tìm mã / tên / KPI…", "Search code / name / KPI…")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {(dept || group || aiLevel || q) && (
              <button className="dict-clear" onClick={clearFilters} title={L("Xoá lọc", "Clear")}>
                <X size={14} />
              </button>
            )}
          </div>

          {data && data.facets.aiLevels.length > 0 && (
            <div className="dict-chips">
              {data.facets.aiLevels.map((a) => (
                <button
                  key={a.aiLevel}
                  className={`dict-chip${aiLevel === a.aiLevel ? " on" : ""}`}
                  onClick={() => setAiLevel(aiLevel === a.aiLevel ? null : a.aiLevel)}
                >
                  {a.aiLevel} <span>{a.count}</span>
                </button>
              ))}
            </div>
          )}

          <nav className="dict-tree">
            <button
              className={`dict-tree-all${!dept && !group ? " on" : ""}`}
              onClick={() => { setDept(null); setGroup(null); }}
            >
              <Layers size={14} /> {L("Tất cả phòng", "All departments")}
              <span>{data?.total ?? ""}</span>
            </button>
            {tree.map((d) => {
              const open = expanded[d.dept] ?? false;
              return (
                <div key={d.dept} className="dict-tree-dept">
                  <button
                    className={`dict-tree-head${dept === d.dept && !group ? " on" : ""}`}
                    onClick={() => {
                      setExpanded((p) => ({ ...p, [d.dept]: !open }));
                      setDept(d.dept); setGroup(null);
                    }}
                  >
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <b>{d.dept}</b>
                    <span>{d.count}</span>
                  </button>
                  {open && d.groups.map((g) => (
                    <button
                      key={g.groupCode}
                      className={`dict-tree-group${group === g.groupCode ? " on" : ""}`}
                      title={g.label ?? g.groupCode}
                      onClick={() => { setDept(d.dept); setGroup(g.groupCode); }}
                    >
                      {g.groupCode} <span>{g.count}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Danh sách tác vụ */}
        <section className="dict-list">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "16%" }}>{L("Mã", "Code")}</th>
                <th>{L("Tên tác vụ", "Task name")}</th>
                <th style={{ width: "12%" }}>AI</th>
                <th style={{ width: "18%" }}>KPI</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((c: DictCellRow) => (
                <tr
                  key={c.code}
                  className={`dict-row${selected === c.code ? " on" : ""}`}
                  onClick={() => void openDetail(c.code)}
                >
                  <td><code className="dict-code">{c.code}</code></td>
                  <td>
                    {lang === "vi" ? c.nameVi : (c.nameEn || c.nameVi)}
                    {c.responsibleRole && (
                      <div className="dict-role">{c.responsibleRole}</div>
                    )}
                  </td>
                  <td>{c.aiLevel && <Badge tone={AI_TONE[c.aiLevel] ?? "gray"}>{c.aiLevel}</Badge>}</td>
                  <td>{c.kpiRef && <code className="dict-kpi">{c.kpiRef}</code>}</td>
                </tr>
              ))}
              {cells.length === 0 && (
                <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>
                  {data ? L("Không có tác vụ khớp bộ lọc.", "No tasks match the filter.")
                        : L("Đang tải…", "Loading…")}
                </td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Panel giải phẫu */}
        <aside className={`dict-detail${selected ? " open" : ""}`}>
          {!selected && (
            <div className="dict-detail-empty">
              <BookOpenText size={30} />
              <p>{L("Chọn một tác vụ để xem giải phẫu 7 nhóm thuộc tính + KPI.",
                    "Pick a task to see its 7-facet anatomy + KPI.")}</p>
            </div>
          )}
          {selected && detailBusy && <div className="dict-detail-empty"><p>{L("Đang tải…", "Loading…")}</p></div>}
          {selected && detail && (
            <AnatomyPanel detail={detail} lang={lang} L={L} onClose={() => setSelected(null)} />
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="dict-sec">
      <div className="dict-sec-head">{icon} {title}</div>
      <div className="dict-sec-body">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="dict-field">
      <span className="dict-field-k">{label}</span>
      <span className="dict-field-v">{value}</span>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return <ul className="dict-ul">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function AnatomyPanel({ detail, lang, L, onClose }: {
  detail: DictCellDetail; lang: string;
  L: (vi: string, en: string) => string; onClose: () => void;
}) {
  const c = detail.cell;
  const gov = (c.governance ?? {}) as Record<string, unknown>;
  const life = (c.lifecycle ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));

  return (
    <div className="dict-anatomy">
      <div className="dict-anatomy-head">
        <div>
          <code className="dict-code lg">{c.code}</code>
          <h3>{lang === "vi" ? c.nameVi : (c.nameEn || c.nameVi)}</h3>
        </div>
        <button className="dict-clear" onClick={onClose}><X size={16} /></button>
      </div>

      <Section icon={<Target size={13} />} title={L("A · Định danh", "A · Identity")}>
        <Field label={L("Nhóm", "Group")} value={c.groupCode} />
        <Field label="Cluster" value={c.clusterCode ?? undefined} />
        <Field label={L("Tên EN", "Name EN")} value={c.nameEn ?? undefined} />
        <Field label={L("Nguồn gốc", "Origin")} value={c.origin ?? undefined} />
      </Section>

      <Section icon={<Users size={13} />} title={L("B · Vai trò (RACI)", "B · Roles (RACI)")}>
        <Field label="Responsible" value={c.responsibleRole ?? undefined} />
        <Field label="Accountable" value={c.accountableRole ?? undefined} />
        <Field label="Consulted" value={asList(c.consulted).join(", ") || undefined} />
        <Field label="Informed" value={asList(c.informed).join(", ") || undefined} />
      </Section>

      <Section icon={<ArrowRightLeft size={13} />} title={L("C · Luồng vào/ra", "C · Inputs/Outputs")}>
        <div className="dict-field-k">{L("Đầu vào", "Inputs")}</div>
        <List items={asList(c.inputs)} />
        <div className="dict-field-k">{L("Đầu ra", "Outputs")}</div>
        <List items={asList(c.outputs)} />
      </Section>

      <Section icon={<Gauge size={13} />} title={L("D · Đo lường & KPI", "D · Measurement & KPI")}>
        <List items={asList(c.measures).map((m) => m)} />
        {detail.kpi ? (
          <div className="dict-kpi-card">
            <div className="dict-kpi-top">
              <code className="dict-kpi">{detail.kpi.code}</code>
              {detail.kpi.isDictionary && <Badge tone="green">{L("KPI chuẩn", "Standard KPI")}</Badge>}
            </div>
            <b>{detail.kpi.nameVi}</b>
            <Field label={L("Định nghĩa", "Definition")} value={detail.kpi.definition ?? undefined} />
            <Field label="Grain" value={detail.kpi.grain ?? undefined} />
            <Field label={L("Phân loại dữ liệu", "Data class")} value={detail.kpi.dataClassification ?? undefined} />
            <Field label={L("Hệ nguồn", "Source system")} value={detail.kpi.sourceSystem ?? undefined} />
            <Field label={L("Ranh giới AI", "AI boundary")} value={detail.kpi.aiBoundary ?? undefined} />
          </div>
        ) : (
          c.kpiRef && <Field label="KPI" value={c.kpiRef} />
        )}
      </Section>

      <Section icon={<Bot size={13} />} title={L("E · Chiều AI", "E · AI dimension")}>
        <Field label={L("Mức AI", "AI level")} value={c.aiLevel ?? undefined} />
        <Field label={L("Chi tiết", "Detail")} value={asList(c.aiDimension).join(", ") || undefined} />
      </Section>

      <Section icon={<ShieldAlert size={13} />} title={L("F · Quản trị & rủi ro", "F · Governance & risk")}>
        <Field label={L("Mức rủi ro", "Risk")} value={c.riskLevel ?? undefined} />
        <Field label={L("Loại dữ liệu", "Data type")} value={str(gov.dataType)} />
        <Field label="Trigger" value={str(gov.trigger)} />
        <Field label={L("Hệ thống nguồn", "Source systems")} value={asList(gov.sourceSystems).join(", ") || undefined} />
        <Field label={L("Công cụ", "Tools")} value={asList(gov.tools).join(", ") || undefined} />
        {str(gov.kpiMapReason) && (
          <Field label={L("Vì sao gắn KPI", "KPI rationale")} value={str(gov.kpiMapReason)} />
        )}
        {asList(gov.synthesized).length > 0 && (
          <div className="dict-note">
            {L("Lưu ý dữ liệu tổng hợp:", "Synthesized data:")}
            <List items={asList(gov.synthesized)} />
          </div>
        )}
        <Field label={L("Xuất xứ", "Provenance")} value={str(gov.provenance)} />
      </Section>

      <Section icon={<Recycle size={13} />} title={L("G · Vòng đời", "G · Lifecycle")}>
        <Field label={L("Phòng nguồn", "Source dept")} value={str(life.catalogDept)} />
        <Field label={L("Nhãn nhóm", "Group label")} value={str(life.groupLabel)} />
        <Field label={L("Phạm vi", "Scope")} value={c.libScope ?? undefined} />
        <Field label={L("Tần suất dùng", "Usage")} value={c.usageCount ?? undefined} />
      </Section>
    </div>
  );
}
