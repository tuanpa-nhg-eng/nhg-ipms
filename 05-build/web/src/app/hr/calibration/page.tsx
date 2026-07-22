"use client";
/**
 * [Trục A — L4] Phòng cân chỉnh đánh giá — nối `/calibration-sessions` (read-model L1)
 * + `/calibration-decisions` + `/reviews?cycleId=`.
 *
 * Ràng buộc nghiệp vụ được phản ánh đúng trên giao diện:
 *  · Lý do đổi hạng BẮT BUỘC ≥10 ký tự (explainable) — nút khoá tới khi đủ.
 *  · Chỉ cân chỉnh phiếu đã qua đánh giá quản lý; phiếu đã chốt thì khoá.
 *  · Không cân chỉnh phiếu của chính mình (SoD) — khoá kèm lý do, không để bấm rồi lỗi.
 *  · Đổi hạng dùng optimistic lock (version) — chống hai người sửa cùng lúc.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scale, ShieldCheck, TriangleAlert, Lock, Plus, History } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse, ReviewCycleRow, ReviewRow } from "@/lib/api";

interface ReviewListRow extends ReviewRow {
  reviewee: { id: string; fullName: string; employeeCode: string } | null;
}
interface SessionRow {
  id: string; cycleId?: string | null; orgUnitId?: string | null;
  status: string; createdAt: string; decisionCount: number;
}
interface SessionDetail extends SessionRow {
  decisions: Array<{
    id: string; reviewId: string; ratingBefore?: string | null; ratingAfter?: string | null;
    rationale: string; createdAt: string; reviewStatus?: string | null;
    reviewee: { id: string; fullName: string; employeeCode: string } | null;
  }>;
}

const CALIBRATABLE = ["manager_done", "calibrated"];

export default function CalibrationPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [reviews, setReviews] = useState<ReviewListRow[]>([]);
  const [draft, setDraft] = useState<Record<string, { rating: string; rationale: string }>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, cy, ss] = await Promise.all([
        call<MeResponse>("/me"),
        call<ReviewCycleRow[]>("/review-cycles"),
        call<SessionRow[]>("/calibration-sessions").catch(() => [] as SessionRow[]),
      ]);
      setMe(m); setCycles(cy); setSessions(ss);
      const useCycle = cycleId || cy.find((c) => c.status === "open")?.id || "";
      if (!cycleId && useCycle) setCycleId(useCycle);
      if (useCycle) {
        const list = await call<{ reviews: ReviewListRow[] }>(`/reviews?cycleId=${useCycle}`);
        setReviews(list.reviews);
      }
      const useSession = sessionId || ss[0]?.id || "";
      if (!sessionId && useSession) setSessionId(useSession);
      if (useSession) {
        setDetail(await call<SessionDetail>(`/calibration-sessions/${useSession}`));
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { setLoading(false); }
  }, [call, cycleId, sessionId]);
  useEffect(() => { void load(); }, [load]);

  const can = (p: string) => !!me?.permissions?.includes(p);

  const dist = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reviews) {
      const k = r.finalRating ?? r.proposedRating;
      if (k) m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reviews]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(key); setMsg(null);
    try {
      await fn(); setMsg({ kind: "ok", text: ok }); await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { pending.current = false; setBusy(null); }
  };

  const createSession = () =>
    act("session", async () => {
      const s = await call<{ id: string }>("/calibration-sessions", {
        method: "POST", json: cycleId ? { cycleId } : {},
      });
      setSessionId(s.id);
    }, "Đã mở phiên cân chỉnh.");

  const decide = (r: ReviewListRow) => {
    const d = draft[r.id];
    return act(r.id, () => call("/calibration-decisions", {
      method: "POST",
      json: {
        sessionId, reviewId: r.id, ratingAfter: d.rating,
        rationale: d.rationale, version: r.version,
      },
    }), `Đã cân chỉnh hạng cho ${r.reviewee?.fullName ?? "nhân sự"}.`);
  };

  return (
    <AppShell crumb={{ section: "HR", page: "Phòng cân chỉnh" }}>
      <div className="page-head">
        <div className="eyebrow">Calibration · công bằng giữa các đơn vị</div>
        <h1>Phòng cân chỉnh đánh giá</h1>
        <p>Soát phân bố hạng, điều chỉnh có lý do ghi lại — mọi thay đổi đều truy được nguồn.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && !can("calibration:run") && (
        <Card>
          <div className="row" style={{ gap: 8 }}>
            <Lock size={16} />
            <span className="tiny muted">
              Bạn không có quyền chạy cân chỉnh (<b>calibration:run</b>). Quyền này thuộc HRBP
              và quản trị viên đơn vị — đăng nhập <b>hr@</b> để thao tác.
            </span>
          </div>
        </Card>
      )}

      {!loading && can("calibration:run") && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 250 }}>
              <label>Chu kỳ</label>
              <select className="studio-input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
              </select>
            </div>
            <div className="studio-field" style={{ minWidth: 250 }}>
              <label>Phiên cân chỉnh</label>
              <select className="studio-input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.length === 0 && <option value="">— chưa có phiên —</option>}
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.createdAt).toLocaleString("vi-VN")} · {s.status} ({s.decisionCount} quyết định)
                  </option>
                ))}
              </select>
            </div>
            <button className="btn ghost sm" disabled={busy !== null} onClick={() => void createSession()}>
              <Plus size={15} /> {busy === "session" ? "…" : "Mở phiên"}
            </button>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <Card
              title={<><Scale size={16} color="var(--nhg-primary)" /> Danh sách cân chỉnh</>}
              sub="Chỉ phiếu đã qua đánh giá quản lý mới cân chỉnh được"
            >
              {reviews.length === 0 && <span className="tiny muted">Chu kỳ này chưa có phiếu.</span>}
              {reviews.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nhân sự</th><th className="rt">Điểm</th><th>Hạng hiện tại</th>
                      <th style={{ width: 260 }}>Cân chỉnh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r) => {
                      const isSelf = r.revieweeId === me?.id;
                      const editable = CALIBRATABLE.includes(r.status) && !isSelf && !!sessionId;
                      const d = draft[r.id] ?? { rating: r.proposedRating ?? "", rationale: "" };
                      const ready = d.rating.trim().length > 0 && d.rationale.trim().length >= 10;
                      return (
                        <tr key={r.id}>
                          <td>
                            <b>{r.reviewee?.fullName ?? r.revieweeId.slice(0, 8)}</b>
                            <div className="muted tiny">{r.reviewee?.employeeCode}</div>
                          </td>
                          <td className="rt numeric">{r.finalScore != null ? Math.round(Number(r.finalScore)) : "—"}</td>
                          <td>
                            <Badge tone={r.status === "final" ? "green" : "amber"}>
                              {r.finalRating ?? r.proposedRating ?? "—"}
                            </Badge>
                          </td>
                          <td>
                            {isSelf ? (
                              <span className="row tiny muted" style={{ gap: 6 }}>
                                <Lock size={13} /> Không cân chỉnh phiếu của chính mình
                              </span>
                            ) : r.status === "final" ? (
                              <span className="row tiny muted" style={{ gap: 6 }}>
                                <Lock size={13} /> Đã chốt — khoá
                              </span>
                            ) : !CALIBRATABLE.includes(r.status) ? (
                              <span className="tiny muted">Chờ quản lý đánh giá xong</span>
                            ) : !sessionId ? (
                              <span className="tiny muted">Mở phiên trước</span>
                            ) : (
                              <div className="grid" style={{ gap: 6 }}>
                                <input
                                  className="studio-input" style={{ fontSize: 12 }} value={d.rating}
                                  onChange={(e) => setDraft((s) => ({ ...s, [r.id]: { ...d, rating: e.target.value } }))}
                                  placeholder="Hạng mới (A/B/C)"
                                />
                                <input
                                  className="studio-input" style={{ fontSize: 12 }} value={d.rationale}
                                  onChange={(e) => setDraft((s) => ({ ...s, [r.id]: { ...d, rationale: e.target.value } }))}
                                  placeholder="Lý do (≥10 ký tự) — bắt buộc"
                                />
                                <button
                                  className="btn primary sm" disabled={!ready || busy !== null || !editable}
                                  onClick={() => void decide(r)}
                                >
                                  {busy === r.id ? "Đang lưu…" : "Cân chỉnh"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title="Phân bố hạng" sub="Theo chu kỳ đang chọn">
                {dist.length === 0 && <span className="tiny muted">Chưa có hạng nào được đề xuất.</span>}
                {dist.map(([k, n]) => (
                  <div key={k} className="row between" style={{ padding: "6px 0" }}>
                    <span className="tiny"><b>{k}</b></span>
                    <span className="tiny numeric muted">{n} người</span>
                  </div>
                ))}
              </Card>

              <Card title={<><History size={16} color="var(--nhg-primary)" /> Quyết định trong phiên</>} sub="Lưu vĩnh viễn, có lý do">
                {(!detail || detail.decisions.length === 0) && (
                  <span className="tiny muted">Phiên này chưa có quyết định nào.</span>
                )}
                <div className="timeline">
                  {detail?.decisions.map((d) => (
                    <div key={d.id} className="tl-item">
                      <div className="t">
                        {d.reviewee?.fullName ?? d.reviewId.slice(0, 8)} ·{" "}
                        {new Date(d.createdAt).toLocaleString("vi-VN")}
                      </div>
                      <div className="m">
                        <b>{d.ratingBefore ?? "—"} → {d.ratingAfter}</b>
                        <div className="muted tiny" style={{ marginTop: 3 }}>{d.rationale}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <ShieldCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Mỗi lần đổi hạng ghi lại hạng trước/sau + lý do + người quyết định, kèm
                    vết kiểm toán trong cùng giao dịch.
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
