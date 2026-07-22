"use client";
/**
 * [Trục A — L4] Thiết lập chu kỳ đánh giá — nối `/review-cycles`, `/reviews`,
 * `/persons/team`, `/scorecards`, và `/export/payroll`.
 *
 * [I4 — ĐƯỜNG TIỀN] Xuất bảng lương là đầu ra đi thẳng vào hệ thống trả lương: chỉ
 * lấy phiếu đã CHỐT, và bắt xác nhận 2 bước trước khi tải. Không đặt cạnh các nút
 * thao tác thường để tránh bấm nhầm.
 *
 * [I6] Không nới quyền cho vừa giao diện: chốt hạng cần `rating:approve` — theo thiết
 * kế seed, quyền đó thuộc QUẢN LÝ TRỰC TIẾP chứ không thuộc HRBP. Màn này hiển thị
 * đúng như vậy thay vì cấp thêm quyền cho hr@.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCog, Plus, Play, Users, Download, ShieldAlert, CircleCheck, Lock,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse, ReviewCycleRow, ReviewRow } from "@/lib/api";

interface ReviewListRow extends ReviewRow {
  reviewee: { id: string; fullName: string; employeeCode: string } | null;
}
interface TeamMember { id: string; fullName: string; employeeCode: string }
interface ScorecardRow { id: string; nameVi: string; period?: string | null }

const FLOW: Array<{ key: string; label: string }> = [
  { key: "draft", label: "Chờ tự đánh giá" },
  { key: "self_done", label: "Chờ quản lý" },
  { key: "manager_done", label: "Đã đánh giá" },
  { key: "calibrated", label: "Đã cân chỉnh" },
  { key: "final", label: "Đã chốt" },
];

export default function ReviewCyclePage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [reviews, setReviews] = useState<ReviewListRow[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRow[]>([]);
  const [form, setForm] = useState({ name: "", period: "", startDate: "", endDate: "" });
  const [scorecardId, setScorecardId] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportArmed, setExportArmed] = useState(false); // [I4] xác nhận 2 bước
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, cy, sc, team] = await Promise.all([
        call<MeResponse>("/me"),
        call<ReviewCycleRow[]>("/review-cycles"),
        call<ScorecardRow[]>("/scorecards").catch(() => [] as ScorecardRow[]),
        call<{ members: TeamMember[] }>("/persons/team").catch(() => ({ members: [] })),
      ]);
      setMe(m); setCycles(cy); setScorecards(sc); setMembers(team.members);
      const use = activeId || cy.find((c) => c.status === "open")?.id || cy[0]?.id || "";
      if (!activeId && use) setActiveId(use);
      if (use) {
        const list = await call<{ reviews: ReviewListRow[] }>(`/reviews?cycleId=${use}`);
        setReviews(list.reviews);
      } else setReviews([]);
      if (!scorecardId && sc[0]) setScorecardId(sc[0].id);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [call, activeId, scorecardId]);
  useEffect(() => { void load(); }, [load]);

  const can = (p: string) => !!me?.permissions?.includes(p);
  const activeCycle = cycles.find((c) => c.id === activeId) ?? null;

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reviews) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [reviews]);
  const finalCount = counts.final ?? 0;

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(key); setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { pending.current = false; setBusy(null); }
  };

  const createCycle = () =>
    act("cycle", () => call("/review-cycles", { method: "POST", json: form }),
      `Đã tạo chu kỳ ${form.name}.`);

  const createReviews = () => {
    const missing = members.filter((m) => !reviews.some((r) => r.revieweeId === m.id));
    return act("reviews", async () => {
      for (const m of missing) {
        await call("/reviews", {
          method: "POST",
          json: { cycleId: activeId, revieweeId: m.id, scorecardId },
        });
      }
    }, `Đã tạo ${missing.length} phiếu đánh giá.`);
  };

  const exportPayroll = async () => {
    if (!activeId) { setMsg({ kind: "err", text: "Chọn chu kỳ trước khi xuất." }); return; }
    if (!exportArmed) { setExportArmed(true); return; }
    setBusy("export"); setMsg(null);
    try {
      // `?cycle=` là BẮT BUỘC — không truyền thì API trả 422. Bảng lương luôn thuộc
      // về đúng một chu kỳ; không có khái niệm "xuất tất cả".
      const data = await call<unknown>(`/export/payroll?cycle=${activeId}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-${activeCycle?.period ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: "ok", text: "Đã tải dữ liệu bảng lương (chỉ gồm phiếu đã chốt)." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally { setBusy(null); setExportArmed(false); }
  };

  const missingCount = members.filter((m) => !reviews.some((r) => r.revieweeId === m.id)).length;

  return (
    <AppShell crumb={{ section: "HR", page: "Chu kỳ đánh giá" }}>
      <div className="page-head">
        <div className="eyebrow">Review Cycle · quản trị chu kỳ</div>
        <h1>Thiết lập &amp; theo dõi chu kỳ đánh giá</h1>
        <p>Mở chu kỳ, tạo phiếu cho nhân sự, theo dõi tiến độ tới khi chốt và xuất bảng lương.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 280 }}>
              <label>Chu kỳ đang xem</label>
              <select className="studio-input" value={activeId} onChange={(e) => setActiveId(e.target.value)}>
                {cycles.length === 0 && <option value="">— chưa có chu kỳ —</option>}
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.period} ({c.status})</option>)}
              </select>
            </div>
          </div>

          <div className="grid g4">
            <Card><div className="stat">
              <div className="v numeric">{reviews.length}</div><div className="l">Phiếu trong chu kỳ</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{(counts.self_done ?? 0) + (counts.manager_done ?? 0)}</div>
              <div className="l">Đang xử lý</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v green numeric">{finalCount}</div><div className="l">Đã chốt</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${missingCount ? " red" : ""}`}>{missingCount}</div>
              <div className="l">Nhân sự chưa có phiếu</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <Card
              title={<><CalendarCog size={16} color="var(--nhg-primary)" /> Tiến độ chu kỳ</>}
              sub={activeCycle ? `${activeCycle.startDate?.slice(0, 10)} → ${activeCycle.endDate?.slice(0, 10)}` : ""}
            >
              {FLOW.map((f) => {
                const n = counts[f.key] ?? 0;
                const pct = reviews.length ? (n / reviews.length) * 100 : 0;
                return (
                  <div key={f.key} style={{ marginBottom: 10 }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span className="tiny">{f.label}</span>
                      <span className="tiny numeric muted">{n}/{reviews.length}</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
              <hr className="hr" />
              <table className="table">
                <thead><tr><th>Nhân sự</th><th>Trạng thái</th><th className="rt">Điểm</th><th>Hạng</th></tr></thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.reviewee?.fullName ?? r.revieweeId.slice(0, 8)}</b>
                        <div className="muted tiny">{r.reviewee?.employeeCode}</div>
                      </td>
                      <td>
                        <Badge tone={r.status === "final" ? "green" : r.status === "draft" ? "gray" : "amber"}>
                          {FLOW.find((f) => f.key === r.status)?.label ?? r.status}
                        </Badge>
                      </td>
                      <td className="rt numeric">{r.finalScore != null ? Math.round(Number(r.finalScore)) : "—"}</td>
                      <td>{r.finalRating ?? r.proposedRating ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reviews.length === 0 && <span className="tiny muted">Chu kỳ này chưa có phiếu nào.</span>}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><Plus size={16} color="var(--nhg-primary)" /> Mở chu kỳ mới</>} sub="Khung thời gian bắt buộc — bằng chứng chỉ tính trong kỳ">
                {can("review:manage") ? (
                  <>
                    <div className="studio-field"><label>Tên</label>
                      <input className="studio-input" value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Đánh giá Quý 4/2026" /></div>
                    <div className="studio-field"><label>Kỳ</label>
                      <input className="studio-input" value={form.period}
                        onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2026-Q4" /></div>
                    <div className="grid g2" style={{ gap: 8 }}>
                      <div className="studio-field"><label>Từ ngày</label>
                        <input className="studio-input" type="date" value={form.startDate}
                          onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
                      <div className="studio-field"><label>Đến ngày</label>
                        <input className="studio-input" type="date" value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
                    </div>
                    <button className="btn primary sm" style={{ marginTop: 10 }}
                      disabled={busy !== null || !form.name || !form.period || !form.startDate || !form.endDate}
                      onClick={() => void createCycle()}>
                      <Play size={15} /> {busy === "cycle" ? "Đang tạo…" : "Mở chu kỳ"}
                    </button>
                  </>
                ) : (
                  <span className="row tiny muted" style={{ gap: 6 }}>
                    <Lock size={13} /> Cần quyền quản trị chu kỳ (review:manage)
                  </span>
                )}
              </Card>

              <Card title={<><Users size={16} color="var(--nhg-primary)" /> Tạo phiếu hàng loạt</>} sub="Cho nhân sự trong phạm vi của bạn">
                <div className="studio-field"><label>Scorecard áp dụng</label>
                  <select className="studio-input" value={scorecardId} onChange={(e) => setScorecardId(e.target.value)}>
                    {scorecards.map((s) => <option key={s.id} value={s.id}>{s.nameVi}</option>)}
                  </select></div>
                <p className="tiny muted" style={{ margin: "8px 0" }}>
                  {missingCount > 0
                    ? `${missingCount} nhân sự chưa có phiếu trong chu kỳ này.`
                    : "Mọi nhân sự trong phạm vi đã có phiếu."}
                </p>
                {can("review:manage") ? (
                  <button className="btn primary sm"
                    disabled={busy !== null || missingCount === 0 || !activeId || !scorecardId}
                    onClick={() => void createReviews()}>
                    {busy === "reviews" ? "Đang tạo…" : `Tạo ${missingCount} phiếu`}
                  </button>
                ) : (
                  <span className="row tiny muted" style={{ gap: 6 }}><Lock size={13} /> Cần review:manage</span>
                )}
              </Card>

              {/* [I4] ĐƯỜNG TIỀN — tách riêng, viền cảnh báo, xác nhận 2 bước */}
              <Card
                title={<><Download size={16} color="var(--nhg-danger)" /> Xuất bảng lương</>}
                sub="Dữ liệu đi vào hệ thống trả lương"
              >
                <div className="ai-flag" style={{ marginBottom: 10 }}>
                  <ShieldAlert size={15} />
                  <span>
                    Chỉ gồm phiếu đã <b>CHỐT</b> ({finalCount}/{reviews.length} trong chu kỳ này).
                    Thao tác được ghi vết kiểm toán.
                  </span>
                </div>
                {can("payroll:export") ? (
                  <>
                    <button
                      className={`btn sm ${exportArmed ? "primary" : "ghost"}`}
                      disabled={busy !== null || !activeId}
                      onClick={() => void exportPayroll()}
                    >
                      {busy === "export" ? "Đang xuất…"
                        : exportArmed ? "Xác nhận xuất bảng lương" : "Xuất bảng lương…"}
                    </button>
                    {exportArmed && (
                      <button className="btn ghost sm" style={{ marginLeft: 8 }}
                        onClick={() => setExportArmed(false)}>Huỷ</button>
                    )}
                  </>
                ) : (
                  <span className="row tiny muted" style={{ gap: 6 }}>
                    <Lock size={13} /> Cần quyền xuất bảng lương (payroll:export)
                  </span>
                )}
              </Card>

              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <CircleCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Chốt hạng cuối cần quyền <b>rating:approve</b> — theo thiết kế phân quyền
                    hiện tại thuộc <b>quản lý trực tiếp</b>, không thuộc HR. HR mở chu kỳ, theo
                    dõi tiến độ và xuất kết quả.
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
