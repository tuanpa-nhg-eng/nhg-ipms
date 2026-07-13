"use client";
/**
 * Từ điển KPI chuẩn — tra cứu 20 metric chuẩn hoá (Semantic Dictionary → kpi_template
 * isDictionary=true). Lọc theo lĩnh vực (domain), tìm kiếm tức thời, song ngữ.
 * Đây là "nguồn KPI thật" cho hard-block Q1: tác vụ phải gắn 1 mã trong đây mới active.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Search, LogOut, Languages, X, Gauge, Bot, Database, Ruler, ShieldQuestion,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { useI18n } from "@/lib/i18n";
import { KpiDictItem } from "@/lib/api";

const METHOD_TONE: Record<string, string> = { manual: "amber", system: "ai" };
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export default function KpiDictionaryPage() {
  const { call, session, logout } = useStudio();
  const { lang, toggle } = useI18n();
  const L = (vi: string, en: string) => (lang === "vi" ? vi : en);

  const [items, setItems] = useState<KpiDictItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    call<KpiDictItem[]>("/kpi-dictionary").then(setItems).catch((e) => setErr((e as Error).message));
  }, [call]);

  const domains = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items ?? []) if (it.domain) m.set(it.domain, (m.get(it.domain) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const qn = q.trim() ? norm(q) : null;
    return (items ?? []).filter((it) => {
      if (domain && it.domain !== domain) return false;
      if (qn) {
        const hay = norm(`${it.code} ${it.nameVi} ${it.nameEn ?? ""} ${it.definition ?? ""}`);
        if (!hay.includes(qn)) return false;
      }
      return true;
    });
  }, [items, q, domain]);

  const sel = filtered.find((x) => x.code === selected) ?? items?.find((x) => x.code === selected) ?? null;

  return (
    <AppShell crumb={{ section: L("Từ điển KPI", "KPI Dictionary"), page: L("Tra cứu", "Browse") }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">{L("Bộ chỉ số chuẩn hoá toàn hàng · read-only", "Standardized metric set · read-only")}</div>
          <h1>{L("Từ điển KPI", "KPI Dictionary")}</h1>
          <p>{L("20 KPI chuẩn (Semantic Dictionary). Mọi tác vụ active phải gắn một mã trong đây — đây là nguồn KPI thật của hệ.",
                "20 canonical KPIs (Semantic Dictionary). Every active task must link one code here — the system's source of real KPIs.")}</p>
        </div>
        <div className="dict-session">
          <span className="who"><b>{session?.email}</b></span>
          <button className="btn ghost sm" onClick={toggle}><Languages size={13} /> {lang === "vi" ? "EN" : "VI"}</button>
          <button className="btn ghost sm" onClick={logout}><LogOut size={13} /> {L("Đổi phiên", "Switch")}</button>
        </div>
      </div>

      {err && <div className="studio-msg err">{err}</div>}

      <div className="dict-wrap">
        <div className="dict-stats">
          <div className="dict-stat"><b>{items?.length ?? "—"}</b><span>{L("KPI chuẩn", "canonical KPIs")}</span></div>
          <div className="dict-stat-div" />
          <div className="dict-stat"><b>{domains.length}</b><span>{L("lĩnh vực", "domains")}</span></div>
          <div className="dict-stat-div" />
          <div className="dict-stat"><b>{filtered.length}</b><span>{L("khớp bộ lọc", "match filter")}</span></div>
        </div>

        <div className="kpi-toolbar">
          <div className="dict-search" style={{ maxWidth: 340 }}>
            <Search size={15} />
            <input placeholder={L("Tìm mã / tên / định nghĩa…", "Search code / name / definition…")}
              value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="dict-clear" onClick={() => setQ("")}><X size={14} /></button>}
          </div>
          <div className="dict-chips">
            <button className={`dict-chip${!domain ? " on" : ""}`} onClick={() => setDomain(null)}>
              {L("Tất cả", "All")} <span>{items?.length ?? 0}</span>
            </button>
            {domains.map(([d, n]) => (
              <button key={d} className={`dict-chip${domain === d ? " on" : ""}`}
                onClick={() => setDomain(domain === d ? null : d)}>
                {d} <span>{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="kpi-grid">
          {filtered.map((it) => (
            <button key={it.code} className={`kpi-card${selected === it.code ? " on" : ""}`}
              onClick={() => setSelected(selected === it.code ? null : it.code)}>
              <div className="kpi-card-top">
                <code className="dict-kpi">{it.code}</code>
                {it.method && <Badge tone={METHOD_TONE[it.method] ?? "gray"}>{it.method}</Badge>}
                {it.domain && <Badge tone="gray">{it.domain}</Badge>}
              </div>
              <div className="kpi-card-name">{lang === "vi" ? it.nameVi : (it.nameEn || it.nameVi)}</div>
              {it.definition && <div className="kpi-card-def">{it.definition}</div>}
              <div className="kpi-card-meta">
                {it.unit && <span><Ruler size={11} /> {it.unit}</span>}
                {it.frequency && <span>{it.frequency}</span>}
                {it.direction && <span>{it.direction}</span>}
              </div>
            </button>
          ))}
          {items && filtered.length === 0 && (
            <div className="dict-empty" style={{ gridColumn: "1 / -1" }}>
              <Search size={28} /><p>{L("Không có KPI khớp bộ lọc.", "No KPI matches the filter.")}</p>
            </div>
          )}
          {!items && !err && (
            <div className="dict-empty" style={{ gridColumn: "1 / -1" }}><p>{L("Đang tải…", "Loading…")}</p></div>
          )}
        </div>
      </div>

      {/* Panel chi tiết KPI */}
      <div className={`dict-scrim${sel ? " show" : ""}`} onClick={() => setSelected(null)} />
      <aside className={`dict-detail${sel ? " open" : ""}`}>
        {sel && (
          <div>
            <div className="dict-anatomy-head">
              <div style={{ minWidth: 0 }}>
                <div className="code-row"><code className="dict-kpi">{sel.code}</code></div>
                <h3>{lang === "vi" ? sel.nameVi : (sel.nameEn || sel.nameVi)}</h3>
                <div className="dict-anatomy-badges">
                  {sel.isDictionary && <Badge tone="green">{L("KPI chuẩn", "Canonical")}</Badge>}
                  {sel.domain && <Badge tone="gray">{sel.domain}</Badge>}
                  {sel.method && <Badge tone={METHOD_TONE[sel.method] ?? "gray"}>{sel.method}</Badge>}
                </div>
              </div>
              <button className="dict-clear" onClick={() => setSelected(null)}><X size={17} /></button>
            </div>

            <KpiSection icon={<ShieldQuestion size={13} />} title={L("Định nghĩa", "Definition")}>
              <p className="kpi-def-full">{sel.definition ?? L("(chưa có định nghĩa)", "(no definition)")}</p>
            </KpiSection>

            <KpiSection icon={<Gauge size={13} />} title={L("Đo lường", "Measurement")}>
              <KField label={L("Công thức", "Formula")} value={sel.formulaExpr ?? undefined} mono />
              <KField label="Grain" value={sel.grain ?? undefined} />
              <KField label={L("Đơn vị", "Unit")} value={sel.unit ?? undefined} />
              <KField label={L("Tần suất", "Frequency")} value={sel.frequency ?? undefined} />
              <KField label={L("Chiều", "Direction")} value={sel.direction ?? undefined} />
              <KField label="Method" value={sel.method ?? undefined} />
            </KpiSection>

            <KpiSection icon={<Database size={13} />} title={L("Dữ liệu & nguồn", "Data & source")}>
              <KField label={L("Phân loại dữ liệu", "Data class")} value={sel.dataClassification ?? undefined} />
              <KField label={L("Hệ nguồn", "Source system")} value={sel.sourceSystem ?? undefined} />
            </KpiSection>

            <KpiSection icon={<Bot size={13} />} title={L("Ranh giới AI", "AI boundary")}>
              <p className="kpi-def-full">{sel.aiBoundary ?? L("(không quy định)", "(not specified)")}</p>
            </KpiSection>
          </div>
        )}
      </aside>
    </AppShell>
  );
}

function KpiSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="dict-sec"><div className="dict-sec-head">{icon} {title}</div>{children}</div>;
}

function KField({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="dict-field">
      <span className="dict-field-k">{label}</span>
      <span className="dict-field-v" style={mono ? { fontFamily: "ui-monospace, monospace", fontSize: 11.5 } : undefined}>{value}</span>
    </div>
  );
}
