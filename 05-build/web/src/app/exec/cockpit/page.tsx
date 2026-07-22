"use client";
/**
 * [Trục A — L5] Tổng quan điều hành — nối `GET /exec/overview` (read-model L1).
 *
 * [I1] Endpoint gác bằng `goal:read` (quyền mà CẢ nhân viên cũng có), nên phạm vi dữ
 * liệu do SCOPE quyết định chứ không do permission: người scope hẹp gọi cùng URL vẫn
 * chỉ nhận số của chính họ. Màn hiển thị rõ đang xem ở phạm vi nào để không ai hiểu
 * nhầm con số là của toàn tenant.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, TriangleAlert, Users, Target, ArrowRight, Gauge,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";

interface Overview {
  scope: "tenant" | "scoped";
  coverage: { persons: number | null };
  goals: { total: number; byStatus: Record<string, number>; avgHealth: number | null };
  atRisk: Array<{
    id: string; nameVi: string; status: string; healthScore: number | null;
    period: string; updatedAt: string;
    owner: { id: string; fullName: string; employeeCode: string } | null;
  }>;
  cycles: Array<{
    id: string; name: string; period: string;
    startDate?: string | null; endDate?: string | null;
    total: number; byStatus: Record<string, number>;
  }>;
  kpi: Record<string, number> | null;
}

const GOAL_LABEL: Record<string, string> = {
  active: "Đúng nhịp", at_risk: "Có rủi ro", off_track: "Chệch hướng",
  done: "Hoàn thành", draft: "Nháp", cancelled: "Đã huỷ",
};

export default function CockpitPage() {
  const { call } = useStudio();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await call<Overview>("/exec/overview"));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const g = data?.goals;
  const healthy = (g?.byStatus.active ?? 0) + (g?.byStatus.done ?? 0);
  const risky = (g?.byStatus.at_risk ?? 0) + (g?.byStatus.off_track ?? 0);

  return (
    <AppShell crumb={{ section: "Điều hành", page: "Tổng quan" }}>
      <div className="page-head">
        <div className="eyebrow">
          Executive Cockpit
          {data && ` · phạm vi ${data.scope === "tenant" ? "toàn đơn vị" : "theo quyền của bạn"}`}
        </div>
        <h1>Tổng quan điều hành</h1>
        <p>Sức khoẻ mục tiêu, việc đang chệch hướng và tiến độ chu kỳ đánh giá — số liệu thật.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && data && (
        <>
          {data.scope === "scoped" && (
            <div className="ai-flag" style={{ marginBottom: 14 }}>
              <TriangleAlert size={15} />
              <span>
                Bạn đang xem ở phạm vi hạn chế
                {data.coverage.persons != null ? ` (${data.coverage.persons} nhân sự)` : ""} —
                các con số dưới đây KHÔNG phải toàn đơn vị.
              </span>
            </div>
          )}

          <div className="grid g4">
            <Card><div className="stat">
              <div className="v numeric">{g?.total ?? 0}</div><div className="l">Mục tiêu đang theo</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${(g?.avgHealth ?? 0) >= 70 ? " green" : ""}`}>
                {g?.avgHealth != null ? Math.round(g.avgHealth) : "—"}
              </div><div className="l">Sức khoẻ trung bình</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v green numeric">{healthy}</div><div className="l">Đúng nhịp</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${risky ? " red" : ""}`}>{risky}</div>
              <div className="l">Cần can thiệp</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <div className="grid" style={{ gap: 16 }} id="risk">
              <Card
                title={<><TriangleAlert size={16} color="var(--nhg-danger)" /> Mục tiêu cần can thiệp</>}
                sub="Sắp xếp theo sức khoẻ thấp nhất — danh sách hành động được, không phải con số suông"
              >
                {data.atRisk.length === 0 && (
                  <span className="tiny muted">Không có mục tiêu nào đang ở mức rủi ro.</span>
                )}
                {data.atRisk.length > 0 && (
                  <table className="table">
                    <thead>
                      <tr><th>Mục tiêu</th><th>Người phụ trách</th><th>Kỳ</th>
                        <th style={{ width: 130 }}>Sức khoẻ</th></tr>
                    </thead>
                    <tbody>
                      {data.atRisk.map((x) => (
                        <tr key={x.id}>
                          <td>
                            <b>{x.nameVi}</b>
                            <div className="muted tiny">
                              <Badge tone={x.status === "off_track" ? "red" : "amber"}>
                                {GOAL_LABEL[x.status] ?? x.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="tiny">
                            {x.owner?.fullName ?? "—"}
                            {x.owner && <div className="muted tiny">{x.owner.employeeCode}</div>}
                          </td>
                          <td className="tiny">{x.period}</td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <Progress
                                  value={x.healthScore ?? 0}
                                  tone={(x.healthScore ?? 0) < 40 ? "danger" : "warn"}
                                />
                              </div>
                              <span className="tiny numeric muted">
                                {x.healthScore != null ? Math.round(x.healthScore) : "—"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card title={<><Target size={16} color="var(--nhg-primary)" /> Phân bố trạng thái mục tiêu</>}>
                {Object.entries(g?.byStatus ?? {}).length === 0 && (
                  <span className="tiny muted">Chưa có mục tiêu nào.</span>
                )}
                {Object.entries(g?.byStatus ?? {}).map(([k, n]) => (
                  <div key={k} style={{ marginBottom: 9 }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span className="tiny">{GOAL_LABEL[k] ?? k}</span>
                      <span className="tiny numeric muted">{n}</span>
                    </div>
                    <Progress value={g?.total ? (n / g.total) * 100 : 0}
                      tone={k === "off_track" ? "danger" : k === "at_risk" ? "warn" : undefined} />
                  </div>
                ))}
              </Card>
            </div>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><Users size={16} color="var(--nhg-primary)" /> Chu kỳ đánh giá đang mở</>}>
                {data.cycles.length === 0 && <span className="tiny muted">Không có chu kỳ nào đang mở.</span>}
                {data.cycles.map((c) => {
                  const done = c.byStatus.final ?? 0;
                  return (
                    <div key={c.id} style={{ marginBottom: 12 }}>
                      <div className="row between" style={{ marginBottom: 4 }}>
                        <b style={{ fontSize: 12.5 }}>{c.name}</b>
                        <span className="tiny numeric muted">{done}/{c.total} chốt</span>
                      </div>
                      <Progress value={c.total ? (done / c.total) * 100 : 0} />
                      <div className="muted tiny" style={{ marginTop: 3 }}>
                        {Object.entries(c.byStatus).map(([k, n]) => `${k}: ${n}`).join(" · ") || "chưa có phiếu"}
                      </div>
                    </div>
                  );
                })}
                <Link className="btn ghost sm" href="/hr/review-cycle">
                  Quản trị chu kỳ <ArrowRight size={14} />
                </Link>
              </Card>

              {data.kpi && (
                <Card title={<><Gauge size={16} color="var(--nhg-primary)" /> Độ phủ chỉ tiêu</>} sub="Thư viện KPI của đơn vị">
                  {Object.entries(data.kpi).map(([k, n]) => (
                    <div key={k} className="row between" style={{ padding: "5px 0" }}>
                      <span className="tiny">{k}</span>
                      <span className="tiny numeric muted">{n}</span>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
