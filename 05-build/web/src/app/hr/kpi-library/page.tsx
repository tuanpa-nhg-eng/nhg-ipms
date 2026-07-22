"use client";
/**
 * [Trục A — L4] Thư viện KPI — nối `GET /kpis` + `POST /kpis/:id/approve` (HITL).
 *
 * KPI mới sinh ra ở trạng thái `draft`, phải có người duyệt mới `active` — vòng
 * human-in-the-loop từ Phase 1. Màn này là nơi thực hiện việc duyệt đó.
 * Công thức là bản BẤT BIẾN có đánh phiên bản: sửa công thức = tạo phiên bản mới,
 * bản cũ giữ nguyên để chấm lại lịch sử đúng công thức của kỳ đó.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookMarked, Check, Lock, ShieldCheck, Sigma } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface KpiRow {
  id: string;
  code: string;
  nameVi: string;
  method: string;
  direction: string;
  unit?: string | null;
  frequency: string;
  status: string;
  dataSource?: string | null;
  kpiVersion: number;
  formula?: { id: string; expression: string; note?: string | null } | null;
  scoreTiers?: Array<{ id: string; minPct: string | number; score: string | number }>;
}

const ST_TONE: Record<string, string> = {
  active: "green", draft: "amber", pending_approval: "amber", deprecated: "gray",
};

export default function KpiLibraryPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, list] = await Promise.all([
        call<MeResponse>("/me"),
        call<KpiRow[]>("/kpis"),
      ]);
      setMe(m); setKpis(list);
      setActiveId((cur) => cur ?? list[0]?.id ?? null);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const can = (p: string) => !!me?.permissions?.includes(p);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? kpis.filter((k) => `${k.code} ${k.nameVi}`.toLowerCase().includes(s)) : kpis;
  }, [kpis, q]);
  const active = kpis.find((k) => k.id === activeId) ?? null;
  const pendingCount = kpis.filter((k) => k.status !== "active" && k.status !== "deprecated").length;

  const approve = async (k: KpiRow) => {
    if (pending.current) return;
    pending.current = true; setBusy(k.id); setMsg(null);
    try {
      await call(`/kpis/${k.id}/approve`, { method: "POST", json: {} });
      setMsg({ kind: "ok", text: `Đã phê duyệt ${k.code} — chỉ tiêu chuyển sang đang dùng.` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { pending.current = false; setBusy(null); }
  };

  return (
    <AppShell crumb={{ section: "HR", page: "Thư viện KPI" }}>
      <div className="page-head">
        <div className="eyebrow">KPI Library · chỉ tiêu đo lường</div>
        <h1>Thư viện chỉ tiêu</h1>
        <p>Công thức có phiên bản bất biến — sửa là tạo bản mới, bản cũ giữ để chấm lại lịch sử.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="grid g4">
            <Card><div className="stat"><div className="v numeric">{kpis.length}</div><div className="l">Chỉ tiêu</div></div></Card>
            <Card><div className="stat">
              <div className="v green numeric">{kpis.filter((k) => k.status === "active").length}</div>
              <div className="l">Đang dùng</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${pendingCount ? " amber" : ""}`}>{pendingCount}</div>
              <div className="l">Chờ phê duyệt</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{kpis.filter((k) => k.method === "system").length}</div>
              <div className="l">Lấy tự động</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <Card title={<><BookMarked size={16} color="var(--nhg-primary)" /> Danh sách chỉ tiêu</>} sub="Bấm để xem công thức & bậc điểm">
              <input
                className="studio-input" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo mã hoặc tên…" style={{ marginBottom: 10 }}
              />
              {filtered.length === 0 && <span className="tiny muted">Không có chỉ tiêu nào khớp.</span>}
              {filtered.length > 0 && (
                <table className="table">
                  <thead>
                    <tr><th>Chỉ tiêu</th><th>Nguồn</th><th>Trạng thái</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((k) => (
                      <tr key={k.id} style={{ cursor: "pointer" }} onClick={() => setActiveId(k.id)}>
                        <td>
                          <b>{k.nameVi}</b>
                          <div className="muted tiny">{k.code} · v{k.kpiVersion}</div>
                        </td>
                        <td>
                          <Badge tone={k.method === "system" ? "info" : "gray"}>
                            {k.method === "system" ? "Tự động" : "Nhập tay"}
                          </Badge>
                        </td>
                        <td><Badge tone={ST_TONE[k.status] ?? "gray"}>{k.status}</Badge></td>
                        <td className="rt">
                          {k.status !== "active" && k.status !== "deprecated" && (
                            can("kpi:approve") ? (
                              <button
                                className="btn primary sm" disabled={busy !== null}
                                onClick={(e) => { e.stopPropagation(); void approve(k); }}
                              >
                                <Check size={14} /> {busy === k.id ? "…" : "Duyệt"}
                              </button>
                            ) : (
                              <span className="row tiny muted" style={{ gap: 5 }}>
                                <Lock size={12} /> cần kpi:approve
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><Sigma size={16} color="var(--nhg-primary)" /> Công thức &amp; bậc điểm</>} sub={active?.code ?? ""}>
                {!active && <span className="tiny muted">Chọn một chỉ tiêu để xem chi tiết.</span>}
                {active && (
                  <>
                    <div className="row between" style={{ marginBottom: 8 }}>
                      <span className="tiny muted">Chiều</span>
                      <span className="tiny">
                        {active.direction === "reverse" ? "càng thấp càng tốt" : "càng cao càng tốt"}
                      </span>
                    </div>
                    <div className="row between" style={{ marginBottom: 8 }}>
                      <span className="tiny muted">Tần suất</span><span className="tiny">{active.frequency}</span>
                    </div>
                    {active.dataSource && (
                      <div className="row between" style={{ marginBottom: 8 }}>
                        <span className="tiny muted">Nguồn dữ liệu</span><span className="tiny">{active.dataSource}</span>
                      </div>
                    )}
                    <div className="card-sub" style={{ margin: "10px 0 5px" }}>Công thức</div>
                    <div className="ai-draft" style={{ marginTop: 0, fontFamily: "monospace", fontSize: 12 }}>
                      {active.formula?.expression ?? "— chưa gắn công thức —"}
                    </div>
                    {active.scoreTiers && active.scoreTiers.length > 0 && (
                      <>
                        <div className="card-sub" style={{ margin: "12px 0 5px" }}>Bậc thang điểm</div>
                        <table className="table">
                          <thead><tr><th className="rt">Đạt từ</th><th className="rt">Điểm</th></tr></thead>
                          <tbody>
                            {[...active.scoreTiers]
                              .sort((a, b) => Number(b.minPct) - Number(a.minPct))
                              .map((t) => (
                                <tr key={t.id}>
                                  <td className="rt numeric">{Number(t.minPct)}%</td>
                                  <td className="rt numeric"><b>{Number(t.score)}</b></td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </>
                )}
              </Card>

              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <ShieldCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Chỉ tiêu chuẩn toàn hàng nằm ở <Link href="/kpi-dictionary">Từ điển KPI</Link>.
                    Màn này quản lý chỉ tiêu vận hành của đơn vị.
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
