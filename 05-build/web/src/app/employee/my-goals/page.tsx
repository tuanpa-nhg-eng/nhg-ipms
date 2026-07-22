"use client";
/**
 * [Trục A — L2] Mục tiêu của tôi — nối `GET /goals` + `/objectives` + `/evidence` thật.
 * Trước lát này màn chạy `lib/mock.ts`: mọi người nhìn thấy CÙNG một bộ số cứng.
 *
 * healthScore/status là do BE tính (GoalService roll-up trong cùng transaction với
 * check-in), FE chỉ hiển thị — không tự suy lại ngưỡng, tránh hai nguồn sự thật.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Target, Paperclip, Check, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { GoalRow, MeResponse, ObjectiveRow } from "@/lib/api";

interface EvidenceRow {
  id: string;
  type: string;
  sourceSystem: string;
  status: string;
  occurredAt?: string | null;
  uri?: string | null;
  relatedGoalId?: string | null;
}

const GOAL_TONE: Record<string, string> = {
  active: "green", at_risk: "amber", off_track: "red", done: "green",
  draft: "gray", cancelled: "gray",
};
const GOAL_LABEL: Record<string, string> = {
  active: "Đúng nhịp", at_risk: "Có rủi ro", off_track: "Chệch hướng",
  done: "Hoàn thành", draft: "Nháp", cancelled: "Đã huỷ",
};

export default function MyGoalsPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, g, o, ev] = await Promise.all([
        call<MeResponse | null>("/me"),
        call<GoalRow[]>("/goals"),
        call<ObjectiveRow[]>("/objectives").catch(() => [] as ObjectiveRow[]),
        call<EvidenceRow[]>("/evidence").catch(() => [] as EvidenceRow[]),
      ]);
      setMe(m); setGoals(g); setObjectives(o); setEvidence(ev);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const objById = useMemo(() => new Map(objectives.map((o) => [o.id, o])), [objectives]);

  /** Lineage OKR ▸ KGI ▸ Goal — dựng từ objective.parentId thật. */
  const lineage = useCallback((g: GoalRow): string => {
    if (!g.objectiveId) return "—";
    const kgi = objById.get(g.objectiveId);
    if (!kgi) return "—";
    const okr = kgi.parentId ? objById.get(kgi.parentId) : undefined;
    return okr ? `${okr.nameVi} ▸ ${kgi.nameVi}` : kgi.nameVi;
  }, [objById]);

  const totalWeight = goals.reduce((a, g) => a + Number(g.weight ?? 0), 0);
  const avgHealth = useMemo(() => {
    const v = goals.map((g) => Number(g.healthScore)).filter(Number.isFinite);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  }, [goals]);
  const onTrack = goals.filter((g) => g.status === "active" || g.status === "done").length;

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Mục tiêu của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">My Goals · {me?.fullName ?? ""}</div>
        <h1>Mục tiêu &amp; Bằng chứng của tôi</h1>
        <p>Hiểu rõ mình được đánh giá thế nào — mỗi mục tiêu gắn chiến lược &amp; bằng chứng có nguồn.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className={`v numeric${avgHealth != null && avgHealth >= 70 ? " green" : ""}`}>{avgHealth ?? "—"}</div>
              <div className="l">Sức khoẻ trung bình</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{totalWeight ? `${totalWeight}%` : "—"}</div>
              <div className="l">Tổng tỷ trọng</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v green numeric">{onTrack}/{goals.length}</div>
              <div className="l">Mục tiêu đúng nhịp</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{evidence.filter((e) => e.status === "verified").length}</div>
              <div className="l">Bằng chứng đã xác minh</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <Card
              title={<><Target size={16} color="var(--nhg-primary)" /> Mục tiêu cá nhân</>}
              sub="Sức khoẻ do hệ thống tính từ tiến độ check-in (roll-up cùng transaction)"
            >
              {goals.length === 0 && (
                <span className="tiny muted">
                  Chưa có mục tiêu nào được giao cho bạn trong kỳ này.
                </span>
              )}
              {goals.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mục tiêu</th><th>Kỳ</th>
                      <th style={{ width: 150 }}>Sức khoẻ</th>
                      <th className="rt">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goals.map((g) => {
                      const h = g.healthScore != null ? Math.round(Number(g.healthScore)) : null;
                      return (
                        <tr key={g.id}>
                          <td>
                            <b>{g.nameVi}</b>
                            <div className="muted tiny">
                              {lineage(g)} · <Badge tone={GOAL_TONE[g.status] ?? "gray"}>
                                {GOAL_LABEL[g.status] ?? g.status}
                              </Badge>
                            </div>
                          </td>
                          <td className="tiny">{g.period}</td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <Progress
                                  value={h ?? 0}
                                  tone={h == null ? undefined : h < 40 ? "danger" : h < 70 ? "warn" : undefined}
                                />
                              </div>
                              <span className="tiny numeric muted">{h ?? "—"}</span>
                            </div>
                          </td>
                          <td className="rt numeric">{g.weight != null ? `${Number(g.weight)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <Link className="btn primary sm" href="/employee/check-in">
                  <Check size={15} /> Cập nhật tiến độ
                </Link>
              </div>
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card
                title={<><Paperclip size={16} color="var(--nhg-primary)" /> Bằng chứng</>}
                sub="Có nguồn + thời điểm + trạng thái xác minh"
              >
                {evidence.length === 0 && (
                  <span className="tiny muted">Chưa có bằng chứng nào gắn với bạn.</span>
                )}
                <div className="timeline">
                  {evidence.slice(0, 12).map((e) => (
                    <div key={e.id} className="tl-item">
                      <div className="t">
                        {e.occurredAt ? new Date(e.occurredAt).toLocaleDateString("vi-VN") : "—"}
                        {" · "}{e.sourceSystem}
                      </div>
                      <div className="m">
                        {e.type}{" "}
                        <Badge tone={e.status === "verified" ? "green" : e.status === "rejected" ? "red" : "amber"}>
                          {e.status === "verified" ? "đã xác minh"
                            : e.status === "rejected" ? "bị từ chối" : "chờ xác minh"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <ShieldCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Chỉ bạn và người quản lý trực tiếp đọc được dữ liệu này — hệ thống lọc theo
                    phạm vi ngay trong truy vấn.
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
