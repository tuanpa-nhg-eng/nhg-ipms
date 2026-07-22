"use client";
/**
 * [Trục A — L3] Đội của tôi — nối `GET /persons/team` (read-model L1 gộp sẵn check-in
 * + review + đếm goal cho cả đội trong 3 query) và `POST /checkins/:id/review`.
 *
 * [I3 — SoD hiển thị TRUNG THỰC] Trưởng phòng không được nhận xét check-in của CHÍNH
 * MÌNH (BE F41 chặn 409). FE khoá nút kèm lý do thay vì để bấm rồi ăn lỗi — người dùng
 * phải hiểu được vì sao, không phải đoán.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, MessageSquare, Check, TriangleAlert, Lock, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse, ReviewCycleRow } from "@/lib/api";

interface TeamMember {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  orgUnitId?: string | null;
  managerId?: string | null;
  checkin: { id: string; status: string; blocker?: string | null; periodKey: string } | null;
  review: { id: string; status: string; proposedRating?: string | null; finalRating?: string | null } | null;
  goalCounts: Record<string, number>;
}
interface TeamResponse {
  orgUnitIds: string[];
  periodKey: string | null;
  cycleId: string | null;
  members: TeamMember[];
}

const CK_TONE: Record<string, string> = { submitted: "amber", reviewed: "green", open: "gray" };
const CK_LABEL: Record<string, string> = {
  submitted: "Chờ nhận xét", reviewed: "Đã nhận xét", open: "Đang mở",
};
const RV_LABEL: Record<string, string> = {
  draft: "Chờ tự đánh giá", self_done: "Chờ bạn đánh giá", manager_done: "Bạn đã đánh giá",
  calibrated: "Đã cân chỉnh", final: "Đã chốt",
};

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function TeamPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [cycleId, setCycleId] = useState<string>("");
  const [comment, setComment] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, cy] = await Promise.all([
        call<MeResponse | null>("/me"),
        call<ReviewCycleRow[]>("/review-cycles").catch(() => [] as ReviewCycleRow[]),
      ]);
      setMe(m);
      setCycles(cy);
      const openCycle = cy.find((c) => c.status === "open");
      const useCycle = cycleId || openCycle?.id || "";
      if (!cycleId && useCycle) setCycleId(useCycle);
      const qs = new URLSearchParams({ periodKey });
      if (useCycle) qs.set("cycleId", useCycle);
      setTeam(await call<TeamResponse>(`/persons/team?${qs.toString()}`));
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [call, periodKey, cycleId]);
  useEffect(() => { void load(); }, [load]);

  const reviewCheckin = async (m: TeamMember) => {
    if (!m.checkin || pending.current) return;
    const text = (comment[m.id] ?? "").trim();
    if (text.length === 0) {
      setMsg({ kind: "err", text: "Nhập nhận xét trước khi gửi." });
      return;
    }
    pending.current = true;
    setBusyId(m.id);
    setMsg(null);
    try {
      await call(`/checkins/${m.checkin.id}/review`, {
        method: "POST", json: { managerComment: text },
      });
      setMsg({ kind: "ok", text: `Đã gửi nhận xét cho ${m.fullName}.` });
      setComment((c) => ({ ...c, [m.id]: "" }));
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      pending.current = false;
      setBusyId(null);
    }
  };

  const members = team?.members ?? [];
  const stats = useMemo(() => {
    const submitted = members.filter((m) => m.checkin).length;
    const waiting = members.filter((m) => m.checkin?.status === "submitted").length;
    const blockers = members.filter((m) => m.checkin?.blocker).length;
    const offTrack = members.reduce((a, m) => a + (m.goalCounts.off_track ?? 0), 0);
    return { submitted, waiting, blockers, offTrack };
  }, [members]);

  return (
    <AppShell crumb={{ section: "Trưởng phòng", page: "Đội của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">Team Check-in · kỳ {periodKey}</div>
        <h1>Check-in &amp; sức khoẻ đội</h1>
        <p>Nhịp liên tục thay vì chấm cuối năm — thấy sớm ai chệch hướng, ai đang vướng.</p>
      </div>

      <div className="studio-toolbar" style={{ marginBottom: 14 }}>
        <div className="studio-field">
          <label>Kỳ check-in</label>
          <input
            className="studio-input" value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)} placeholder="2026-07"
          />
        </div>
        <div className="studio-field" style={{ minWidth: 240 }}>
          <label>Chu kỳ đánh giá</label>
          <select className="studio-input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            <option value="">— không gắn —</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </select>
        </div>
        <button className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} /> Tải lại
        </button>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className="v green numeric">{stats.submitted}/{members.length}</div>
              <div className="l">Đã nộp check-in</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{stats.waiting}</div><div className="l">Chờ bạn nhận xét</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${stats.blockers ? " red" : ""}`}>{stats.blockers}</div>
              <div className="l">Đang vướng điểm nghẽn</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${stats.offTrack ? " red" : ""}`}>{stats.offTrack}</div>
              <div className="l">Mục tiêu chệch hướng</div>
            </div></Card>
          </div>

          <Card
            className="section-gap"
            title={<><Users size={16} color="var(--nhg-primary)" /> Bảng check-in đội</>}
            sub="Lọc theo phạm vi phụ trách — bạn chỉ thấy người thuộc quyền mình"
          >
            {members.length === 0 && (
              <span className="tiny muted">
                Chưa có ai trong phạm vi phụ trách của bạn. Nhân sự được gắn qua
                <b> người quản lý trực tiếp</b> hoặc <b>đơn vị</b> bạn phụ trách.
              </span>
            )}
            {members.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Thành viên</th><th>Check-in {periodKey}</th>
                    <th style={{ width: 160 }}>Mục tiêu</th><th>Đánh giá</th><th>Nhận xét</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const isSelf = m.id === me?.id;
                    const total = Object.values(m.goalCounts).reduce((a, b) => a + b, 0);
                    const good = (m.goalCounts.active ?? 0) + (m.goalCounts.done ?? 0);
                    const pct = total ? (good / total) * 100 : 0;
                    const canReview = !!m.checkin && m.checkin.status === "submitted" && !isSelf;
                    return (
                      <tr key={m.id}>
                        <td>
                          <b>{m.fullName}</b>
                          <div className="muted tiny">{m.employeeCode}</div>
                        </td>
                        <td>
                          {m.checkin ? (
                            <>
                              <Badge tone={CK_TONE[m.checkin.status] ?? "gray"}>
                                {CK_LABEL[m.checkin.status] ?? m.checkin.status}
                              </Badge>
                              {m.checkin.blocker && (
                                <div className="row tiny" style={{ gap: 5, marginTop: 4, color: "var(--nhg-danger)" }}>
                                  <TriangleAlert size={12} /> <span>{m.checkin.blocker}</span>
                                </div>
                              )}
                            </>
                          ) : <Badge tone="gray">Chưa nộp</Badge>}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <Progress value={pct} tone={pct < 50 ? "danger" : pct < 80 ? "warn" : undefined} />
                            </div>
                            <span className="tiny numeric muted">{good}/{total}</span>
                          </div>
                        </td>
                        <td className="tiny">
                          {m.review
                            ? <>{RV_LABEL[m.review.status] ?? m.review.status}
                                {m.review.proposedRating && <> · <b>{m.review.proposedRating}</b></>}</>
                            : <span className="muted">—</span>}
                        </td>
                        <td style={{ minWidth: 230 }}>
                          {isSelf ? (
                            <span className="row tiny muted" style={{ gap: 6 }}>
                              <Lock size={13} /> Không tự nhận xét check-in của mình
                            </span>
                          ) : canReview ? (
                            <div className="row" style={{ gap: 6 }}>
                              <input
                                className="studio-input" style={{ flex: 1, fontSize: 12 }}
                                value={comment[m.id] ?? ""}
                                onChange={(e) => setComment((c) => ({ ...c, [m.id]: e.target.value }))}
                                placeholder="Nhận xét…"
                              />
                              <button
                                className="btn primary sm" disabled={busyId === m.id}
                                onClick={() => void reviewCheckin(m)}
                              >
                                <Check size={14} /> {busyId === m.id ? "…" : "Gửi"}
                              </button>
                            </div>
                          ) : m.checkin?.status === "reviewed" ? (
                            <span className="row tiny muted" style={{ gap: 6 }}>
                              <MessageSquare size={13} /> Đã nhận xét
                            </span>
                          ) : (
                            <span className="tiny muted">Chờ nhân viên nộp</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
