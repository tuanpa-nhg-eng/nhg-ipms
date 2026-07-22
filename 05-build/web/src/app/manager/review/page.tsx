"use client";
/**
 * [Trục A — L3] Đánh giá — màn trưởng phòng chấm người trong phòng mình.
 *
 * [I3 — SoD hiển thị TRUNG THỰC] BE chặn tuyệt đối việc tự chấm mình (F30, không
 * ngoại lệ kể cả admin). FE KHÔNG bày nút rồi để ăn 409: nếu người được đánh giá chính
 * là bạn thì mọi ô nhập bị khoá kèm giải thích.
 *
 * [F26] `target` KHÔNG do FE gửi — server tự lấy từ scorecard_item. FE chỉ nhập `actual`
 * cho KPI phương pháp thủ công; KPI hệ thống lấy từ evidence đã xác minh trong kỳ.
 * Bảng dưới ghi rõ điều đó để người chấm biết con số đến từ đâu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck, Calculator, ShieldCheck, Lock, User, Sparkles, TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse, ReviewCycleRow, ReviewItemScoreRow, ReviewRow } from "@/lib/api";

interface ReviewListRow extends ReviewRow {
  reviewee: { id: string; fullName: string; employeeCode: string } | null;
}
interface ReviewDetail extends ReviewRow {
  selfReflection?: string | null;
  managerAssessment?: string | null;
  strengths?: string | null;
  gaps?: string | null;
  developmentNeeds?: string | null;
  itemScores?: ReviewItemScoreRow[];
}
interface ScorecardRow {
  id: string;
  nameVi: string;
  items: Array<{
    id: string; kpiId: string; weight?: string | number | null;
    target?: string | number | null; groupLabel?: string | null;
    kpi: { id: string; code: string; nameVi: string; method: string; direction: string; unit?: string | null };
  }>;
}

const STATUS: Record<string, { tone: string; label: string }> = {
  draft: { tone: "gray", label: "Chờ nhân viên tự đánh giá" },
  self_done: { tone: "amber", label: "Chờ bạn đánh giá" },
  manager_done: { tone: "info", label: "Đã đánh giá" },
  calibrated: { tone: "info", label: "Đã cân chỉnh" },
  final: { tone: "green", label: "Đã chốt" },
};

export default function ManagerReviewPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [rows, setRows] = useState<ReviewListRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [scorecards, setScorecards] = useState<ScorecardRow[]>([]);
  const [assessment, setAssessment] = useState("");
  const [rating, setRating] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"manager" | "compute" | null>(null);
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, cy, sc] = await Promise.all([
        call<MeResponse | null>("/me"),
        call<ReviewCycleRow[]>("/review-cycles").catch(() => [] as ReviewCycleRow[]),
        call<ScorecardRow[]>("/scorecards").catch(() => [] as ScorecardRow[]),
      ]);
      setMe(m); setCycles(cy); setScorecards(sc);
      const use = cycleId || cy.find((c) => c.status === "open")?.id || "";
      if (!cycleId && use) setCycleId(use);
      const qs = use ? `?cycleId=${use}` : "";
      const list = await call<{ reviews: ReviewListRow[] }>(`/reviews${qs}`);
      setRows(list.reviews);
      setActiveId((cur) => cur ?? list.reviews[0]?.id ?? null);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [call, cycleId]);
  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await call<ReviewDetail>(`/reviews/${id}`);
      setDetail(d);
      setAssessment(d.managerAssessment ?? "");
      setRating(d.proposedRating ?? "");
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }, [call]);
  useEffect(() => { if (activeId) void loadDetail(activeId); else setDetail(null); }, [activeId, loadDetail]);

  const activeRow = rows.find((r) => r.id === activeId) ?? null;
  const isSelf = !!detail && !!me && detail.revieweeId === me.id;
  const scorecard = useMemo(
    () => scorecards.find((s) => s.id === detail?.scorecardId) ?? null,
    [scorecards, detail],
  );
  const manualItems = scorecard?.items.filter((i) => i.kpi.method === "manual") ?? [];
  const systemItems = scorecard?.items.filter((i) => i.kpi.method !== "manual") ?? [];

  const canAssess = detail?.status === "self_done" && !isSelf;
  const canCompute = !!detail && detail.status !== "draft" && detail.status !== "final" && !isSelf;

  const submitManager = async () => {
    if (!detail || pending.current) return;
    pending.current = true; setBusy("manager"); setMsg(null);
    try {
      await call(`/reviews/${detail.id}/manager`, {
        method: "POST",
        json: { managerAssessment: assessment, proposedRating: rating || undefined },
      });
      setMsg({ kind: "ok", text: "Đã lưu đánh giá của quản lý." });
      await loadDetail(detail.id);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { pending.current = false; setBusy(null); }
  };

  const computeScore = async () => {
    if (!detail || pending.current) return;
    pending.current = true; setBusy("compute"); setMsg(null);
    try {
      await call(`/reviews/${detail.id}/compute-score`, {
        method: "POST",
        json: {
          manualActuals: manualItems
            .filter((i) => actuals[i.kpiId] !== undefined && actuals[i.kpiId] !== "")
            .map((i) => ({ kpiId: i.kpiId, actual: Number(actuals[i.kpiId]) })),
        },
      });
      setMsg({ kind: "ok", text: "Đã tính điểm — mục tiêu (target) lấy từ scorecard phía máy chủ." });
      await loadDetail(detail.id);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { pending.current = false; setBusy(null); }
  };

  const st = detail ? STATUS[detail.status] ?? { tone: "gray", label: detail.status } : null;

  return (
    <AppShell crumb={{ section: "Trưởng phòng", page: "Đánh giá" }}>
      <div className="page-head">
        <div className="eyebrow">
          Manager Review{activeRow?.reviewee ? ` · ${activeRow.reviewee.fullName}` : ""}
        </div>
        <h1>Đánh giá hiệu suất</h1>
        <p>Người quyết định, hệ thống tính toán minh bạch, mọi con số truy được về nguồn.</p>
      </div>

      <div className="studio-toolbar" style={{ marginBottom: 14 }}>
        <div className="studio-field" style={{ minWidth: 260 }}>
          <label>Chu kỳ</label>
          <select className="studio-input" value={cycleId} onChange={(e) => { setCycleId(e.target.value); setActiveId(null); }}>
            <option value="">— tất cả —</option>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
          </select>
        </div>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && rows.length === 0 && (
        <Card><span className="tiny muted">
          Chưa có phiếu đánh giá nào trong phạm vi của bạn. HR tạo phiếu ở màn Thiết lập chu kỳ.
        </span></Card>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
          <Card title="Người được đánh giá" sub={`${rows.length} phiếu`}>
            {rows.map((r) => (
              <button
                key={r.id}
                className={`btn sm ${r.id === activeId ? "primary" : "ghost"}`}
                style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6 }}
                onClick={() => setActiveId(r.id)}
              >
                <User size={14} />
                <span style={{ flex: 1, textAlign: "left" }}>
                  {r.reviewee?.fullName ?? r.revieweeId.slice(0, 8)}
                </span>
                <Badge tone={STATUS[r.status]?.tone ?? "gray"}>{r.status}</Badge>
              </button>
            ))}
          </Card>

          <div className="grid" style={{ gap: 16 }}>
            {isSelf && (
              <div className="studio-msg err">
                <b>Không thể tự đánh giá chính mình.</b> Phiếu này là của bạn — theo nguyên tắc
                phân tách trách nhiệm, người được đánh giá không bao giờ là người chấm. Quản lý
                cấp trên hoặc HR sẽ thực hiện phần này.
              </div>
            )}

            <Card
              title={<><ClipboardCheck size={16} color="var(--nhg-primary)" /> Trạng thái phiếu</>}
              sub={activeRow?.reviewee?.employeeCode ?? ""}
            >
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
                {detail?.finalScore != null && (
                  <span className="numeric" style={{ fontSize: 20, fontWeight: 800, color: "var(--nhg-primary)" }}>
                    {Math.round(Number(detail.finalScore))}
                  </span>
                )}
                {detail?.ipcGrade && <Badge tone="green">Hạng {detail.ipcGrade}</Badge>}
              </div>
            </Card>

            <Card title="Tự đánh giá của nhân viên" sub="Chỉ đọc — do chính người được đánh giá viết">
              {detail?.selfReflection
                ? <div className="ai-draft" style={{ margin: 0 }}>{detail.selfReflection}</div>
                : <span className="tiny muted">Nhân viên chưa gửi phần tự đánh giá.</span>}
            </Card>

            <Card
              title="Đánh giá của bạn"
              sub={canAssess ? "Cần nhân viên tự đánh giá trước, sau đó tới lượt bạn" : "Chỉ ghi được khi phiếu ở trạng thái chờ bạn đánh giá"}
            >
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                rows={4}
                disabled={!canAssess}
                placeholder="Nhận xét về kết quả, cách làm việc, điểm cần cải thiện…"
                style={{
                  width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: 12,
                  borderRadius: 10, border: "1px solid var(--nhg-border-default)",
                  background: canAssess ? "var(--nhg-bg-canvas)" : "var(--nhg-bg-subtle)",
                  color: "var(--nhg-text-primary)", resize: "vertical",
                }}
              />
              <div className="row between" style={{ marginTop: 10, gap: 10 }}>
                <div className="studio-field" style={{ maxWidth: 160 }}>
                  <label>Hạng đề xuất</label>
                  <input
                    className="studio-input" value={rating} disabled={!canAssess}
                    onChange={(e) => setRating(e.target.value)} placeholder="A / B / C"
                  />
                </div>
                {canAssess ? (
                  <button
                    className="btn primary sm"
                    disabled={busy !== null || assessment.trim().length === 0}
                    onClick={() => void submitManager()}
                  >
                    {busy === "manager" ? "Đang lưu…" : "Lưu đánh giá"}
                  </button>
                ) : (
                  <span className="row tiny muted" style={{ gap: 6 }}>
                    <Lock size={13} />
                    {isSelf ? "Phiếu của chính bạn"
                      : detail?.status === "draft" ? "Chờ nhân viên tự đánh giá"
                      : "Đã qua bước này"}
                  </span>
                )}
              </div>
            </Card>

            <Card
              title={<><Calculator size={16} color="var(--nhg-primary)" /> Tính điểm</>}
              sub="Mục tiêu (target) do máy chủ lấy từ scorecard — không nhập tay lúc chấm"
            >
              {!scorecard && (
                <span className="tiny muted">
                  Phiếu chưa gắn scorecard hoặc bạn không có quyền đọc scorecard này.
                </span>
              )}
              {scorecard && (
                <>
                  {manualItems.length > 0 && (
                    <>
                      <div className="card-sub" style={{ marginBottom: 8 }}>
                        Chỉ tiêu thủ công — bạn nhập số thực tế
                      </div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Chỉ tiêu</th><th className="rt">Mục tiêu</th>
                            <th className="rt">Tỷ trọng</th><th style={{ width: 140 }}>Thực tế</th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualItems.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <b>{i.kpi.nameVi}</b>
                                <div className="muted tiny">
                                  {i.kpi.code} · {i.kpi.direction === "reverse" ? "càng thấp càng tốt" : "càng cao càng tốt"}
                                </div>
                              </td>
                              <td className="rt numeric">{i.target != null ? Number(i.target) : "—"}</td>
                              <td className="rt numeric">{i.weight != null ? `${Number(i.weight)}%` : "—"}</td>
                              <td>
                                <input
                                  className="studio-input" type="number" style={{ fontSize: 12 }}
                                  value={actuals[i.kpiId] ?? ""} disabled={!canCompute}
                                  onChange={(e) => setActuals((a) => ({ ...a, [i.kpiId]: e.target.value }))}
                                  placeholder={i.kpi.unit ?? ""}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {systemItems.length > 0 && (
                    <>
                      <div className="card-sub" style={{ margin: "12px 0 8px" }}>
                        Chỉ tiêu hệ thống — lấy từ bằng chứng đã xác minh trong khung kỳ
                      </div>
                      {systemItems.map((i) => (
                        <div key={i.id} className="row between" style={{ padding: "5px 0" }}>
                          <span className="tiny">{i.kpi.nameVi} <span className="muted">({i.kpi.code})</span></span>
                          <Badge tone="info">tự động</Badge>
                        </div>
                      ))}
                    </>
                  )}

                  <div className="row between" style={{ marginTop: 14 }}>
                    <span className="row tiny muted" style={{ gap: 6 }}>
                      <Sparkles size={13} /> Điểm tính theo công thức đã phê duyệt, có lưu phiên bản công thức
                    </span>
                    {canCompute ? (
                      <button className="btn primary sm" disabled={busy !== null} onClick={() => void computeScore()}>
                        <Calculator size={15} /> {busy === "compute" ? "Đang tính…" : "Tính điểm"}
                      </button>
                    ) : (
                      <span className="row tiny muted" style={{ gap: 6 }}>
                        <Lock size={13} />
                        {isSelf ? "Phiếu của chính bạn"
                          : detail?.status === "final" ? "Phiếu đã chốt"
                          : "Chờ nhân viên tự đánh giá"}
                      </span>
                    )}
                  </div>

                  {detail?.itemScores && detail.itemScores.length > 0 && (
                    <>
                      <hr className="hr" />
                      <div className="card-sub" style={{ marginBottom: 8 }}>Kết quả đã chấm</div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Chỉ tiêu</th><th className="rt">Mục tiêu</th><th className="rt">Thực tế</th>
                            <th className="rt">Đạt</th><th className="rt">Điểm</th><th>Công thức</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.itemScores.map((s) => {
                            const item = scorecard.items.find((i) => i.kpiId === s.kpiId);
                            return (
                              <tr key={s.id}>
                                <td className="tiny">{item?.kpi.nameVi ?? s.kpiId.slice(0, 8)}</td>
                                <td className="rt numeric">{s.targetValue != null ? Number(s.targetValue) : "—"}</td>
                                <td className="rt numeric">{s.actualValue != null ? Number(s.actualValue) : "—"}</td>
                                <td className="rt numeric">{s.achievedPct != null ? `${Number(s.achievedPct)}%` : "—"}</td>
                                <td className="rt numeric"><b>{s.score != null ? Number(s.score) : "—"}</b></td>
                                <td className="tiny muted">{s.formulaVersion != null ? `v${s.formulaVersion}` : "—"}</td>
                              </tr>
                            );
                          })}
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
                  Chốt hạng cuối cùng là quyền riêng của HR/người có thẩm quyền phê duyệt —
                  không nằm ở màn này. Mọi thao tác đều để lại vết kiểm toán.
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
