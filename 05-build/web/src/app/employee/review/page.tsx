"use client";
/**
 * [Trục A — L2] Đánh giá của tôi — nối `GET /reviews` + `/reviews/:id` + `POST :id/self`.
 *
 * [I2 — bất biến] Màn này KHÔNG BAO GIỜ render ô nhập phần quản lý hay điểm cuối cho
 * chính người được đánh giá. BE đã chặn (F26/F30: reviewee tự bơm điểm → 409), nhưng
 * FE cũng không được bày ra cái mà bấm vào là ăn lỗi. Nhận xét quản lý hiển thị
 * READ-ONLY.
 *
 * [F43 — chủ dự án chốt 22/07/2026] reviewee ĐƯỢC thấy điểm và nhận xét trước khi
 * chốt cuối kỳ. Vì vậy điểm/hạng hiện ngay khi có, không che.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileCheck, ShieldCheck, Rocket, ThumbsUp, AlertTriangle, Lock } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { ReviewCycleRow, ReviewItemScoreRow, ReviewRow } from "@/lib/api";

interface ReviewDetail extends ReviewRow {
  selfReflection?: string | null;
  managerAssessment?: string | null;
  strengths?: string | null;
  gaps?: string | null;
  developmentNeeds?: string | null;
  finalRationale?: string | null;
  itemScores?: ReviewItemScoreRow[];
}

const STATUS: Record<string, { tone: string; label: string }> = {
  draft: { tone: "gray", label: "Chờ bạn tự đánh giá" },
  self_done: { tone: "amber", label: "Chờ quản lý đánh giá" },
  manager_done: { tone: "info", label: "Quản lý đã đánh giá" },
  calibrated: { tone: "info", label: "Đã cân chỉnh" },
  final: { tone: "green", label: "Đã chốt" },
};

export default function MyReviewPage() {
  const { call } = useStudio();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cy] = await Promise.all([
        call<{ reviews: ReviewRow[] }>("/reviews").then((x) => x.reviews),
        call<ReviewCycleRow[]>("/review-cycles").catch(() => [] as ReviewCycleRow[]),
      ]);
      setReviews(r);
      setCycles(cy);
      setActiveId((cur) => cur ?? r[0]?.id ?? null);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    let alive = true;
    void (async () => {
      try {
        const d = await call<ReviewDetail>(`/reviews/${activeId}`);
        if (!alive) return;
        setDetail(d);
        setDraft(d.selfReflection ?? "");
      } catch (e) {
        if (alive) setMsg({ kind: "err", text: (e as Error).message });
      }
    })();
    return () => { alive = false; };
  }, [activeId, call]);

  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  const saveSelf = async () => {
    if (!detail || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMsg(null);
    try {
      await call(`/reviews/${detail.id}/self`, {
        method: "POST",
        json: { selfReflection: draft },
      });
      setMsg({ kind: "ok", text: "Đã gửi phần tự đánh giá tới quản lý." });
      const d = await call<ReviewDetail>(`/reviews/${detail.id}`);
      setDetail(d);
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const st = detail ? STATUS[detail.status] ?? { tone: "gray", label: detail.status } : null;
  const canWriteSelf = detail?.status === "draft";

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Đánh giá của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">
          My Review{detail ? ` · ${cycleById.get(detail.cycleId)?.name ?? ""}` : ""}
        </div>
        <h1>Đánh giá hiệu suất của tôi</h1>
        <p>Minh bạch: bạn thấy đúng những gì quản lý &amp; hệ thống đánh giá, kèm cách tính điểm.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && reviews.length === 0 && (
        <Card>
          <span className="tiny muted">
            Bạn chưa có kỳ đánh giá nào. Khi HR mở chu kỳ và tạo phiếu đánh giá, nó sẽ hiện ở đây.
          </span>
        </Card>
      )}

      {!loading && reviews.length > 0 && (
        <>
          {reviews.length > 1 && (
            <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {reviews.map((r) => (
                <button
                  key={r.id}
                  className={`btn sm ${r.id === activeId ? "primary" : "ghost"}`}
                  onClick={() => setActiveId(r.id)}
                >
                  {cycleById.get(r.cycleId)?.name ?? r.cycleId.slice(0, 8)}
                </button>
              ))}
            </div>
          )}

          <div className="grid g4">
            <Card><div className="stat">
              <div className={`v numeric${detail?.finalScore ? " green" : ""}`}>
                {detail?.finalScore != null ? Math.round(Number(detail.finalScore)) : "—"}
              </div>
              <div className="l">Điểm tổng (1–100)</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{detail?.ipcGrade ?? detail?.finalRating ?? "—"}</div>
              <div className="l">Hạng</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{detail?.itemScores?.length ?? 0}</div>
              <div className="l">Chỉ tiêu được chấm</div>
            </div></Card>
            <Card><div className="row" style={{ height: "100%", alignItems: "center" }}>
              {st && <Badge tone={st.tone}>{st.label}</Badge>}
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <div className="grid" style={{ gap: 16 }}>
              <Card
                title={<><FileCheck size={16} color="var(--nhg-primary)" /> Bảng điểm theo chỉ tiêu</>}
                sub="Mục tiêu (target) do hệ thống lấy từ scorecard — không ai nhập tay lúc chấm"
              >
                {(!detail?.itemScores || detail.itemScores.length === 0) && (
                  <span className="tiny muted">
                    Chưa chấm điểm. Bảng này hiện sau khi quản lý chạy tính điểm.
                  </span>
                )}
                {detail?.itemScores && detail.itemScores.length > 0 && (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Chỉ tiêu</th><th className="rt">Mục tiêu</th><th className="rt">Thực tế</th>
                        <th className="rt">Đạt</th><th className="rt">Tỷ trọng</th><th className="rt">Điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.itemScores.map((it) => (
                        <tr key={it.id}>
                          <td>
                            <span className="tiny">{it.kpiId.slice(0, 8)}</span>
                            {it.formulaVersion != null && (
                              <div className="muted tiny">công thức v{it.formulaVersion}</div>
                            )}
                          </td>
                          <td className="rt numeric">{it.targetValue != null ? Number(it.targetValue) : "—"}</td>
                          <td className="rt numeric">{it.actualValue != null ? Number(it.actualValue) : "—"}</td>
                          <td className="rt numeric">{it.achievedPct != null ? `${Number(it.achievedPct)}%` : "—"}</td>
                          <td className="rt numeric">{it.weight != null ? `${Number(it.weight)}%` : "—"}</td>
                          <td className="rt numeric"><b>{it.score != null ? Number(it.score) : "—"}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              <Card
                title="Tự đánh giá"
                sub={canWriteSelf ? "Phần bạn tự nhận xét — gửi xong sẽ khoá lại" : "Đã gửi — chỉ đọc"}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  disabled={!canWriteSelf}
                  placeholder="Bạn đã làm được gì trong kỳ này? Điều gì chưa đạt và vì sao?"
                  style={{
                    width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: 12,
                    borderRadius: 10, border: "1px solid var(--nhg-border-default)",
                    background: canWriteSelf ? "var(--nhg-bg-canvas)" : "var(--nhg-bg-subtle)",
                    color: "var(--nhg-text-primary)", resize: "vertical",
                  }}
                />
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="muted tiny">
                    {detail?.updatedAt
                      ? `Cập nhật ${new Date(detail.updatedAt).toLocaleString("vi-VN")}`
                      : ""}
                  </span>
                  {canWriteSelf ? (
                    <button
                      className="btn primary sm"
                      disabled={busy || draft.trim().length === 0}
                      onClick={() => void saveSelf()}
                    >
                      {busy ? "Đang gửi…" : "Gửi tự đánh giá"}
                    </button>
                  ) : (
                    <span className="row tiny muted" style={{ gap: 6 }}>
                      <Lock size={13} /> Đã gửi, không sửa được
                    </span>
                  )}
                </div>
              </Card>

              <Card title="Nhận xét của quản lý" sub="Chỉ đọc — phần này do người quản lý viết">
                {detail?.managerAssessment ? (
                  <div className="ai-draft" style={{ margin: 0 }}>{detail.managerAssessment}</div>
                ) : (
                  <span className="tiny muted">Quản lý chưa viết nhận xét cho kỳ này.</span>
                )}
                {(detail?.strengths || detail?.gaps) && (
                  <div className="grid g2" style={{ marginTop: 12 }}>
                    {detail?.strengths && (
                      <div>
                        <div className="card-sub" style={{ marginBottom: 6 }}>Điểm mạnh</div>
                        <div className="row" style={{ gap: 7, fontSize: 12.5 }}>
                          <ThumbsUp size={14} color="var(--nhg-primary)" /> <span>{detail.strengths}</span>
                        </div>
                      </div>
                    )}
                    {detail?.gaps && (
                      <div>
                        <div className="card-sub" style={{ marginBottom: 6 }}>Cần cải thiện</div>
                        <div className="row" style={{ gap: 7, fontSize: 12.5 }}>
                          <AlertTriangle size={14} color="var(--nhg-warning)" /> <span>{detail.gaps}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {detail?.finalRationale && (
                  <>
                    <hr className="hr" />
                    <div className="card-sub" style={{ marginBottom: 6 }}>Lý do chốt hạng</div>
                    <div className="ai-draft" style={{ margin: 0 }}>{detail.finalRationale}</div>
                  </>
                )}
              </Card>
            </div>

            <div className="grid" style={{ gap: 16 }}>
              {detail?.developmentNeeds && (
                <Card title={<><Rocket size={16} color="var(--nhg-primary)" /> Nhu cầu phát triển</>} sub="Ghi nhận từ kỳ đánh giá này">
                  <div className="ai-draft" style={{ margin: 0 }}>{detail.developmentNeeds}</div>
                  <Link className="btn ghost sm" style={{ marginTop: 10 }} href="/employee/development">
                    Xem kế hoạch phát triển
                  </Link>
                </Card>
              )}
              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <ShieldCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Hạng cuối do <b>người</b> chốt và phê duyệt (quyền riêng), có vết kiểm toán.
                    Bạn chỉ viết được phần tự đánh giá của mình.
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
