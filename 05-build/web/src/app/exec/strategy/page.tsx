"use client";
/**
 * [Trục A — L5] Phân rã mục tiêu — nối `GET /objectives` + `/objectives/:id/cascade`.
 * Cây OKR ▸ KGI ▸ Goal dựng từ quan hệ thật trong dữ liệu, không phải cây mẫu.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Network, ChevronRight, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { GoalRow, ObjectiveRow } from "@/lib/api";

interface CascadeNode {
  id: string; kind?: string; nameVi: string; period?: string;
  status?: string; weight?: string | number | null;
  children?: CascadeNode[];
  goals?: Array<{
    id: string; nameVi: string; status: string;
    healthScore?: string | number | null; weight?: string | number | null;
    ownerId: string;
  }>;
}

const TONE: Record<string, string> = {
  active: "green", at_risk: "amber", off_track: "red", done: "green", draft: "gray",
};

export default function StrategyPage() {
  const { call } = useStudio();
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [rootId, setRootId] = useState("");
  const [cascade, setCascade] = useState<CascadeNode | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [objs, gs] = await Promise.all([
        call<ObjectiveRow[]>("/objectives"),
        call<GoalRow[]>("/goals").catch(() => [] as GoalRow[]),
      ]);
      setObjectives(objs); setGoals(gs);
      const okrs = objs.filter((o) => o.kind === "okr");
      const use = rootId || okrs[0]?.id || "";
      if (!rootId && use) setRootId(use);
      if (use) setCascade(await call<CascadeNode>(`/objectives/${use}/cascade`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call, rootId]);
  useEffect(() => { void load(); }, [load]);

  const okrs = useMemo(() => objectives.filter((o) => o.kind === "okr"), [objectives]);
  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const gapCount = useMemo(() => {
    // KGI không có goal nào bên dưới = mục tiêu chiến lược chưa ai gánh
    const kgis = objectives.filter((o) => o.kind === "kgi");
    return kgis.filter((k) => !goals.some((g) => g.objectiveId === k.id)).length;
  }, [objectives, goals]);

  return (
    <AppShell crumb={{ section: "Điều hành", page: "Phân rã mục tiêu" }}>
      <div className="page-head">
        <div className="eyebrow">Strategy Cascade · OKR ▸ KGI ▸ Mục tiêu</div>
        <h1>Phân rã mục tiêu</h1>
        <p>Từ định hướng xuống việc cụ thể — thấy ngay tầng nào chưa có ai gánh.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && okrs.length === 0 && (
        <Card><span className="tiny muted">
          Chưa có định hướng (OKR) nào được khai báo trong phạm vi của bạn.
        </span></Card>
      )}

      {!loading && okrs.length > 0 && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 320 }}>
              <label>Định hướng (OKR)</label>
              <select className="studio-input" value={rootId} onChange={(e) => setRootId(e.target.value)}>
                {okrs.map((o) => <option key={o.id} value={o.id}>{o.nameVi} · {o.period}</option>)}
              </select>
            </div>
            {gapCount > 0 && (
              <Badge tone="amber">{gapCount} mục tiêu chiến lược chưa có việc bên dưới</Badge>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <Card title={<><Network size={16} color="var(--nhg-primary)" /> Cây phân rã</>} sub="Quan hệ lấy từ dữ liệu thật">
              {!cascade && <span className="tiny muted">Chọn một định hướng.</span>}
              {cascade && (
                <div>
                  <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                    <Badge tone="info">OKR</Badge>
                    <b style={{ fontSize: 13.5 }}>{cascade.nameVi}</b>
                    <span className="tiny muted">{cascade.period}</span>
                  </div>
                  {(cascade.children ?? []).length === 0 && (
                    <span className="tiny muted">Định hướng này chưa phân rã xuống KGI nào.</span>
                  )}
                  {(cascade.children ?? []).map((kgi) => {
                    const kgiGoals = goals.filter((g) => g.objectiveId === kgi.id);
                    const avg = kgiGoals.length
                      ? Math.round(kgiGoals.reduce((a, g) => a + Number(g.healthScore ?? 0), 0) / kgiGoals.length)
                      : null;
                    return (
                      <div key={kgi.id} style={{
                        marginLeft: 10, paddingLeft: 14, borderLeft: "2px solid var(--nhg-border-subtle)",
                        marginBottom: 14,
                      }}>
                        <div className="row between" style={{ marginBottom: 6 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <ChevronRight size={13} color="var(--nhg-text-secondary)" />
                            <Badge tone="gray">KGI</Badge>
                            <b style={{ fontSize: 12.5 }}>{kgi.nameVi}</b>
                          </div>
                          <span className="tiny numeric muted">{avg ?? "—"}</span>
                        </div>
                        {kgiGoals.length === 0 ? (
                          <div className="row tiny" style={{ gap: 6, color: "var(--nhg-warning)", marginLeft: 26 }}>
                            <TriangleAlert size={12} /> <span>Chưa có mục tiêu nào gắn vào</span>
                          </div>
                        ) : (
                          kgiGoals.map((g) => (
                            <div key={g.id} className="row between" style={{ marginLeft: 26, padding: "4px 0" }}>
                              <span className="tiny">{g.nameVi}</span>
                              <div className="row" style={{ gap: 8, width: 150 }}>
                                <div style={{ flex: 1 }}>
                                  <Progress
                                    value={Number(g.healthScore ?? 0)}
                                    tone={Number(g.healthScore ?? 0) < 40 ? "danger"
                                      : Number(g.healthScore ?? 0) < 70 ? "warn" : undefined}
                                  />
                                </div>
                                <Badge tone={TONE[g.status] ?? "gray"}>
                                  {g.healthScore != null ? Math.round(Number(g.healthScore)) : "—"}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Tóm tắt" sub="Trong phạm vi bạn được xem">
              <div className="row between" style={{ padding: "6px 0" }}>
                <span className="tiny muted">Định hướng (OKR)</span>
                <span className="tiny numeric">{okrs.length}</span>
              </div>
              <div className="row between" style={{ padding: "6px 0" }}>
                <span className="tiny muted">Mục tiêu chiến lược (KGI)</span>
                <span className="tiny numeric">{objectives.filter((o) => o.kind === "kgi").length}</span>
              </div>
              <div className="row between" style={{ padding: "6px 0" }}>
                <span className="tiny muted">Mục tiêu cụ thể</span>
                <span className="tiny numeric">{goals.length}</span>
              </div>
              <hr className="hr" />
              <div className="row between" style={{ padding: "6px 0" }}>
                <span className="tiny muted">KGI chưa có việc bên dưới</span>
                <Badge tone={gapCount ? "amber" : "green"}>{gapCount}</Badge>
              </div>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
