"use client";
/**
 * Từ điển Tác vụ — trình duyệt tra cứu canonical (read-only, API /task-dictionary).
 * Master–detail 3 khoang: cây Phòng → Nhóm · danh sách tác vụ · panel giải phẫu
 * 7 nhóm thuộc tính A–G + KPI. Tìm kiếm tức thời, lọc mức AI, song ngữ VI/EN,
 * light/dark theo NHG Design System.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, LogOut, ChevronRight, ChevronDown, Layers, Target,
  Users, ArrowRightLeft, Gauge, Bot, ShieldAlert, Recycle, Languages, X,
  MousePointerClick, History, MessageSquarePlus, Send,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { useI18n } from "@/lib/i18n";
import { DictCellDetail, DictCellRow, DictListResponse, TaskFeedback, TaskRevision } from "@/lib/api";

const FB_TONE: Record<string, string> = {
  open: "amber", triaged: "info", reopened: "green", resolved: "gray", wontfix: "gray",
};

// Mức AI → tone badge (badge tones có: green/amber/info/gray/ai)
const AI_TONE: Record<string, string> = {
  manual: "gray", assist: "amber", augment: "info", auto_hitl: "green", system: "ai",
};
const RISK_TONE: Record<string, string> = { low: "green", medium: "amber", high: "red" };

const deptSlug = (groupCode?: string | null) => (groupCode ? groupCode.split("-G")[0] : "—");
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : [];

export default function DictionaryPage() {
  const { call, session, logout } = useStudio();
  const { lang, toggle } = useI18n();
  const L = (vi: string, en: string) => (lang === "vi" ? vi : en);

  const [data, setData] = useState<DictListResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string | null>(null);      // slug phòng đang chọn
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

  // Cây Phòng (tên thân thiện) → Nhóm
  const tree = useMemo(() => {
    const byDept = new Map<string, {
      slug: string; name: string; count: number;
      groups: Array<{ groupCode: string; label?: string | null; count: number }>;
    }>();
    for (const g of data?.facets.groups ?? []) {
      const slug = deptSlug(g.groupCode);
      const d = byDept.get(slug) ?? { slug, name: g.dept ?? slug, count: 0, groups: [] };
      d.groups.push({ groupCode: g.groupCode, label: g.groupLabel, count: g.count });
      d.count += g.count;
      if (g.dept) d.name = g.dept;
      byDept.set(slug, d);
    }
    return [...byDept.values()].sort((a, b) => b.count - a.count);
  }, [data]);

  // Lọc client-side tức thời
  const cells = useMemo(() => {
    const qn = q.trim() ? norm(q) : null;
    return (data?.cells ?? []).filter((c) => {
      if (dept && deptSlug(c.groupCode) !== dept) return false;
      if (group && c.groupCode !== group) return false;
      if (aiLevel && c.aiLevel !== aiLevel) return false;
      if (qn) {
        const hay = norm(`${c.code} ${c.nameVi} ${c.nameEn ?? ""} ${c.kpiRef ?? ""}`);
        if (!hay.includes(qn)) return false;
      }
      return true;
    });
  }, [data, q, dept, group, aiLevel]);

  const activeDeptName = tree.find((d) => d.slug === dept)?.name;
  const hasFilter = !!(dept || group || aiLevel || q.trim());
  const clearFilters = () => { setDept(null); setGroup(null); setAiLevel(null); setQ(""); };

  return (
    <AppShell crumb={{ section: L("Từ điển Tác vụ", "Task Dictionary"), page: L("Tra cứu", "Browse") }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">{L("Tài nguyên tham chiếu toàn hàng · read-only", "Enterprise reference · read-only")}</div>
          <h1>{L("Từ điển Tác vụ", "Task Dictionary")}</h1>
          <p>{L("Tra cứu tác vụ chuẩn đã gắn KPI — cây phòng/nhóm, tìm kiếm, giải phẫu 7 nhóm thuộc tính.",
                "Browse canonical tasks linked to KPIs — department tree, search, 7-facet anatomy.")}</p>
        </div>
        <div className="dict-session">
          <span className="who"><b>{session?.email}</b></span>
          <button className="btn ghost sm" onClick={toggle}><Languages size={13} /> {lang === "vi" ? "EN" : "VI"}</button>
          <button className="btn ghost sm" onClick={logout}><LogOut size={13} /> {L("Đổi phiên", "Switch")}</button>
        </div>
      </div>

      {err && <div className="studio-msg err">{err}</div>}
      {data?.capped && (
        <div className="studio-msg err">
          {L("Thư viện vượt trần hiển thị — danh sách/bộ lọc chỉ trên phần đầu. Cần phân trang.",
            "Library exceeds display cap — list/filter cover the first page only. Pagination needed.")}
        </div>
      )}

      <div className="dict-wrap">
        <div className="dict-stats">
          <div className="dict-stat"><b>{data?.total ?? "—"}</b><span>{L("tác vụ chuẩn", "canonical tasks")}</span></div>
          <div className="dict-stat-div" />
          <div className="dict-stat"><b>{tree.length}</b><span>{L("phòng ban", "departments")}</span></div>
          <div className="dict-stat-div" />
          <div className="dict-stat accent"><b>{data?.facets.kpis.length ?? "—"}</b><span>{L("KPI được gắn", "linked KPIs")}</span></div>
          <div className="dict-stat-div" />
          <div className="dict-stat"><b>{cells.length}</b><span>{L("khớp bộ lọc", "match filter")}</span></div>
        </div>

        <div className="dict-layout">
          {/* Rail trái */}
          <aside className="dict-rail">
            <div className="dict-search">
              <Search size={15} />
              <input
                placeholder={L("Tìm mã / tên / KPI…", "Search code / name / KPI…")}
                value={q} onChange={(e) => setQ(e.target.value)}
              />
              {q && <button className="dict-clear" onClick={() => setQ("")}><X size={14} /></button>}
            </div>

            {data && data.facets.aiLevels.length > 0 && (
              <div>
                <div className="dict-facet-label">{L("Mức AI", "AI level")}</div>
                <div className="dict-chips">
                  {data.facets.aiLevels.map((a) => (
                    <button key={a.aiLevel}
                      className={`dict-chip${aiLevel === a.aiLevel ? " on" : ""}`}
                      onClick={() => setAiLevel(aiLevel === a.aiLevel ? null : a.aiLevel)}>
                      {a.aiLevel} <span>{a.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="dict-facet-label">{L("Phòng ban", "Departments")}</div>
              <nav className="dict-tree">
                <button className={`dict-tree-all${!dept && !group ? " on" : ""}`}
                  onClick={() => { setDept(null); setGroup(null); }}>
                  <Layers size={14} /> {L("Tất cả phòng", "All departments")}
                  <span className="cnt">{data?.total ?? ""}</span>
                </button>
                {tree.map((d) => {
                  const open = expanded[d.slug] ?? false;
                  return (
                    <div key={d.slug}>
                      <button className={`dict-tree-head${dept === d.slug && !group ? " on" : ""}`}
                        title={d.name}
                        onClick={() => {
                          setExpanded((p) => ({ ...p, [d.slug]: !open }));
                          setDept(d.slug); setGroup(null);
                        }}>
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="dict-tree-dept-name">{d.name}</span>
                        <span className="cnt">{d.count}</span>
                      </button>
                      {open && d.groups.map((g) => (
                        <button key={g.groupCode}
                          className={`dict-tree-group${group === g.groupCode ? " on" : ""}`}
                          title={g.label ?? g.groupCode}
                          onClick={() => { setDept(d.slug); setGroup(g.groupCode); }}>
                          <span className="gc">{g.groupCode}</span>
                          <span className="cnt">{g.count}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Danh sách */}
          <section className="dict-list">
            <div className="dict-list-head">
              <b>{cells.length}</b>
              <span>{hasFilter ? L("kết quả khớp bộ lọc", "results match filter") : L("tác vụ", "tasks")}</span>
              <div className="dict-active-filters">
                {activeDeptName && (
                  <span className="dict-fpill">{group ?? activeDeptName}
                    <button onClick={() => { setDept(null); setGroup(null); }}><X size={12} /></button></span>
                )}
                {aiLevel && (
                  <span className="dict-fpill">{aiLevel}
                    <button onClick={() => setAiLevel(null)}><X size={12} /></button></span>
                )}
                {q.trim() && (
                  <span className="dict-fpill">“{q.trim()}”
                    <button onClick={() => setQ("")}><X size={12} /></button></span>
                )}
                {hasFilter && (
                  <button className="btn ghost sm" onClick={clearFilters} style={{ height: 26 }}>
                    {L("Xoá lọc", "Clear")}
                  </button>
                )}
              </div>
            </div>

            <div className="dict-rows">
              {cells.map((c: DictCellRow) => (
                <div key={c.code} className={`dict-row${selected === c.code ? " on" : ""}`}
                  onClick={() => void openDetail(c.code)}>
                  <code className="dict-code">{c.code}</code>
                  <div>
                    <div className="dict-row-name">{lang === "vi" ? c.nameVi : (c.nameEn || c.nameVi)}</div>
                    {c.responsibleRole && <div className="dict-row-role">{c.responsibleRole}</div>}
                  </div>
                  <div className="dict-row-trail">
                    {c.aiLevel && <Badge tone={AI_TONE[c.aiLevel] ?? "gray"}>{c.aiLevel}</Badge>}
                    {c.kpiRef && <code className="dict-kpi">{c.kpiRef}</code>}
                  </div>
                </div>
              ))}
              {cells.length === 0 && (
                <div className="dict-empty">
                  <Search size={28} />
                  <p>{data ? L("Không có tác vụ khớp bộ lọc.", "No tasks match the filter.")
                          : L("Đang tải…", "Loading…")}</p>
                </div>
              )}
            </div>
          </section>

          {/* Panel giải phẫu */}
          <div className={`dict-scrim${selected ? " show" : ""}`} onClick={() => setSelected(null)} />
          <aside className={`dict-detail${selected ? " open" : ""}`}>
            {!selected && (
              <div className="dict-detail-empty">
                <MousePointerClick size={30} />
                <p>{L("Chọn một tác vụ để xem giải phẫu 7 nhóm thuộc tính + KPI gắn kèm.",
                      "Pick a task to see its 7-facet anatomy + linked KPI.")}</p>
              </div>
            )}
            {selected && detailBusy && (
              <div className="dict-detail-empty"><p>{L("Đang tải…", "Loading…")}</p></div>
            )}
            {selected && detail && (
              <AnatomyPanel detail={detail} lang={lang} L={L}
                statusHint={cells.find((c) => c.code === selected)?.status ?? null}
                onClose={() => setSelected(null)} />
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="dict-sec">
      <div className="dict-sec-head">{icon} {title}</div>
      {children}
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

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return <ul className="dict-ul">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

function AnatomyPanel({ detail, lang, L, statusHint, onClose }: {
  detail: DictCellDetail; lang: string;
  L: (vi: string, en: string) => string; statusHint: string | null; onClose: () => void;
}) {
  const c = detail.cell;
  const gov = (c.governance ?? {}) as Record<string, unknown>;
  const life = (c.lifecycle ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));
  const AI_TONE_MAP: Record<string, string> = AI_TONE;

  return (
    <div>
      <div className="dict-anatomy-head">
        <div style={{ minWidth: 0 }}>
          <div className="code-row">
            <code className="dict-code lg">{c.code}</code>
            {c.kpiRef && <code className="dict-kpi">{c.kpiRef}</code>}
          </div>
          <h3>{lang === "vi" ? c.nameVi : (c.nameEn || c.nameVi)}</h3>
          <div className="dict-anatomy-badges">
            {c.aiLevel && <Badge tone={AI_TONE_MAP[c.aiLevel] ?? "gray"}>{L("AI", "AI")}: {c.aiLevel}</Badge>}
            {c.riskLevel && <Badge tone={RISK_TONE[c.riskLevel] ?? "gray"}>{L("Rủi ro", "Risk")}: {c.riskLevel}</Badge>}
            {c.origin && <Badge tone="gray">{c.origin}</Badge>}
          </div>
        </div>
        <button className="dict-clear" onClick={onClose}><X size={17} /></button>
      </div>

      <Section icon={<Target size={13} />} title={L("A · Định danh", "A · Identity")}>
        <Field label={L("Nhóm", "Group")} value={c.groupCode} />
        <Field label="Cluster" value={c.clusterCode ?? undefined} />
        <Field label={L("Tên EN", "Name EN")} value={c.nameEn ?? undefined} />
      </Section>

      <Section icon={<Users size={13} />} title={L("B · Vai trò (RACI)", "B · Roles (RACI)")}>
        <Field label="Responsible" value={c.responsibleRole ?? undefined} />
        <Field label="Accountable" value={c.accountableRole ?? undefined} />
        <Field label="Consulted" value={asList(c.consulted).join(", ") || undefined} />
        <Field label="Informed" value={asList(c.informed).join(", ") || undefined} />
      </Section>

      <Section icon={<ArrowRightLeft size={13} />} title={L("C · Luồng vào / ra", "C · Inputs / Outputs")}>
        <div className="dict-sub">{L("Đầu vào", "Inputs")}</div>
        <BulletList items={asList(c.inputs)} />
        <div className="dict-sub">{L("Đầu ra", "Outputs")}</div>
        <BulletList items={asList(c.outputs)} />
      </Section>

      <Section icon={<Gauge size={13} />} title={L("D · Đo lường & KPI", "D · Measurement & KPI")}>
        <BulletList items={asList(c.measures)} />
        {detail.kpi ? (
          <div className="dict-kpi-card">
            <div className="dict-kpi-top">
              <code className="dict-kpi">{detail.kpi.code}</code>
              {detail.kpi.isDictionary && <Badge tone="green">{L("KPI chuẩn", "Standard KPI")}</Badge>}
              {detail.kpi.domain && <Badge tone="gray">{detail.kpi.domain}</Badge>}
            </div>
            <span className="kpi-name">{detail.kpi.nameVi}</span>
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
        {str(gov.kpiMapReason) && <Field label={L("Vì sao gắn KPI", "KPI rationale")} value={str(gov.kpiMapReason)} />}
        {asList(gov.synthesized).length > 0 && (
          <div className="dict-note">
            {L("Lưu ý dữ liệu tổng hợp:", "Synthesized data:")}
            <BulletList items={asList(gov.synthesized)} />
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

      <RevisionHistory code={c.code} L={L} />
      <FeedbackPanel code={c.code} statusHint={statusHint} L={L} />
    </div>
  );
}

/** Lịch sử phiên bản vòng tối ưu — append-only, snapshot mỗi bản. Bấm 1 bản để xem
 *  thay đổi so với bản liền trước (diff dựng client từ snapshot). Đường theo MÃ (F122). */
function RevisionHistory({ code, L }: { code: string; L: (vi: string, en: string) => string }) {
  const { call } = useStudio();
  const [revs, setRevs] = useState<TaskRevision[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [snap, setSnap] = useState<Record<number, TaskRevision>>({});

  useEffect(() => {
    setRevs(null); setOpen(null); setSnap({});
    call<TaskRevision[]>(`/task-dictionary/${encodeURIComponent(code)}/revisions`)
      .then(setRevs).catch(() => setRevs([]));
  }, [code, call]);

  const toggle = async (v: number) => {
    if (open === v) { setOpen(null); return; }
    setOpen(v);
    if (!snap[v]) {
      try {
        const r = await call<TaskRevision>(`/task-dictionary/${encodeURIComponent(code)}/revisions/${v}`);
        setSnap((m) => ({ ...m, [v]: r }));
      } catch {}
    }
  };

  if (revs && revs.length === 0) return null;
  return (
    <Section icon={<History size={13} />} title={L("Lịch sử phiên bản", "Version history")}>
      {!revs && <div className="dict-sub">{L("Đang tải…", "Loading…")}</div>}
      <div className="dict-rev-list">
        {(revs ?? []).map((r) => {
          const prev = (revs ?? []).find((x) => x.version === r.version - 1);
          return (
            <div key={r.version} className="dict-rev">
              <button className="dict-rev-head" onClick={() => void toggle(r.version)}>
                {open === r.version ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Badge tone={r.version === Math.max(...(revs ?? []).map((x) => x.version)) ? "green" : "gray"}>v{r.version}</Badge>
                <span className="dict-rev-sum">{r.changeSummary ?? L("(không mô tả)", "(no summary)")}</span>
                <span className="dict-rev-date">{new Date(r.activatedAt).toLocaleDateString("vi-VN")}</span>
              </button>
              {open === r.version && snap[r.version] && (
                <RevisionDiff snap={snap[r.version].snapshot} prevSnap={prev ? snap[prev.version]?.snapshot : undefined}
                  L={L} onLoadPrev={prev ? () => void toggle(prev.version) : undefined} hasPrev={!!prev} />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const DIFF_FIELDS: Array<[string, string, string]> = [
  ["nameVi", "Tên VI", "Name VI"], ["responsibleRole", "Responsible", "Responsible"],
  ["accountableRole", "Accountable", "Accountable"], ["aiLevel", "Mức AI", "AI level"],
  ["riskLevel", "Rủi ro", "Risk"], ["kpiRef", "KPI", "KPI"],
];

/** Diff client-side: so trường then chốt của snapshot với bản liền trước. */
function RevisionDiff({ snap, prevSnap, L, onLoadPrev, hasPrev }: {
  snap?: Record<string, unknown>; prevSnap?: Record<string, unknown>;
  L: (vi: string, en: string) => string; onLoadPrev?: () => void; hasPrev: boolean;
}) {
  const val = (o: Record<string, unknown> | undefined, k: string) => {
    const v = o?.[k];
    if (v == null) return "—";
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") || "—";
    return String(v);
  };
  return (
    <div className="dict-rev-diff">
      {hasPrev && !prevSnap && (
        <button className="btn ghost sm" onClick={onLoadPrev} style={{ marginBottom: 6 }}>
          {L("Tải bản trước để so sánh", "Load previous to compare")}
        </button>
      )}
      <table className="dict-diff-table">
        <thead><tr><th>{L("Trường", "Field")}</th><th>{L("Trước", "Before")}</th><th>{L("Sau", "After")}</th></tr></thead>
        <tbody>
          {DIFF_FIELDS.map(([k, vi, en]) => {
            const after = val(snap, k);
            const before = prevSnap ? val(prevSnap, k) : "—";
            const changed = hasPrev && prevSnap && before !== after;
            return (
              <tr key={k} className={changed ? "changed" : ""}>
                <td>{L(vi, en)}</td>
                <td>{hasPrev ? before : "—"}</td>
                <td>{after}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Góp ý sử dụng thực tế — mọi persona đọc; gửi góp ý cần quyền task:feedback và
 *  tác vụ đang vận hành (active/reopened). BE là nguồn chân lý, form chỉ hiển thị lỗi trung thực. */
function FeedbackPanel({ code, statusHint, L }: {
  code: string; statusHint: string | null; L: (vi: string, en: string) => string;
}) {
  const { call } = useStudio();
  const [list, setList] = useState<TaskFeedback[] | null>(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("optimize");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setList(null);
    call<TaskFeedback[]>(`/task-dictionary/${encodeURIComponent(code)}/feedback`)
      .then(setList).catch(() => setList([]));
  }, [code, call]);
  useEffect(() => { setMsg(null); setBody(""); load(); }, [load]);

  const canPost = statusHint == null || statusHint === "active" || statusHint === "reopened";

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await call(`/task-dictionary/${encodeURIComponent(code)}/feedback`, {
        method: "POST", json: { body: body.trim(), category },
      });
      setBody(""); setMsg(L("Đã gửi góp ý — trưởng phòng sẽ xem xét mở vòng tối ưu.",
                            "Feedback sent — the head may open an optimization round."));
      load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Section icon={<MessageSquarePlus size={13} />} title={L("Góp ý sử dụng", "Usage feedback")}>
      {canPost ? (
        <div className="dict-fb-form">
          <div className="row" style={{ gap: 6 }}>
            <select className="studio-select" style={{ height: 30, fontSize: 12 }}
              value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="optimize">{L("tối ưu", "optimize")}</option>
              <option value="defect">{L("lỗi", "defect")}</option>
              <option value="question">{L("thắc mắc", "question")}</option>
            </select>
          </div>
          <textarea className="studio-input" rows={2} style={{ resize: "vertical", fontSize: 12.5 }}
            placeholder={L("Góp ý từ thực tế vận hành để tác vụ tốt hơn…", "Feedback from real usage…")}
            value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn primary sm" disabled={busy || !body.trim()} onClick={() => void submit()}>
            <Send size={12} /> {L("Gửi góp ý", "Send")}
          </button>
        </div>
      ) : (
        <div className="dict-sub">{L("Tác vụ không ở trạng thái vận hành — chưa nhận góp ý.",
                                     "Task not operational — feedback closed.")}</div>
      )}
      {msg && <div className="dict-fb-msg">{msg}</div>}

      <div className="dict-fb-list">
        {(list ?? []).map((f) => (
          <div key={f.id} className="dict-fb">
            <div className="dict-fb-top">
              <Badge tone={FB_TONE[f.status] ?? "gray"}>{f.status}</Badge>
              <span className="dict-fb-cat">{f.category}</span>
              {f.version != null && <span className="dict-fb-ver">v{f.version}</span>}
              <span className="dict-fb-date">{new Date(f.createdAt).toLocaleDateString("vi-VN")}</span>
            </div>
            <div className="dict-fb-body">{f.body}</div>
          </div>
        ))}
        {list && list.length === 0 && (
          <div className="dict-sub">{L("Chưa có góp ý nào.", "No feedback yet.")}</div>
        )}
      </div>
    </Section>
  );
}
