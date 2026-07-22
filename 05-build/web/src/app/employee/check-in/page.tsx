"use client";
/**
 * [Trục A — L2] Check-in — màn GHI THẬT đầu tiên của khu nhân viên.
 *
 * BE (CheckinService.submit) làm tất cả trong MỘT transaction: tạo check-in + goal
 * updates + roll-up health. Vì vậy sau khi nộp, FE nạp lại goal để hiển thị sức khoẻ
 * MỚI — đó cũng là bằng chứng nhìn thấy được rằng màn này đã nối backend thật.
 *
 * [F172] Nút nộp khoá bằng ref đồng bộ: check-in unique theo (person, cadence, period)
 * nên double-submit sẽ ăn 409 — khoá trước cho người dùng khỏi thấy lỗi vô nghĩa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, Check, AlertCircle, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { CheckinRow, GoalRow } from "@/lib/api";

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CK_TONE: Record<string, string> = { open: "gray", submitted: "amber", reviewed: "green" };
const CK_LABEL: Record<string, string> = {
  open: "đang mở", submitted: "chờ quản lý", reviewed: "đã nhận xét",
};

export default function MyCheckinPage() {
  const { call } = useStudio();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [blocker, setBlocker] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false); // [F172] chặn đồng bộ — state React batched không đủ nhanh

  const periodKey = currentMonthKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, c] = await Promise.all([
        call<GoalRow[]>("/goals"),
        call<CheckinRow[]>("/checkins"),
      ]);
      setGoals(g);
      setCheckins(c);
      // Mặc định ô nhập = sức khoẻ hiện tại của goal (điểm xuất phát hợp lý, người sửa tiếp)
      setProgress((prev) => {
        const next = { ...prev };
        for (const goal of g) {
          if (next[goal.id] === undefined) {
            next[goal.id] = goal.healthScore != null ? Math.round(Number(goal.healthScore)) : 0;
          }
        }
        return next;
      });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const thisPeriod = useMemo(
    () => checkins.find((c) => c.periodKey === periodKey && c.cadence === "monthly"),
    [checkins, periodKey],
  );
  const history = useMemo(
    () => [...checkins].sort((a, b) => b.periodKey.localeCompare(a.periodKey)).slice(0, 8),
    [checkins],
  );

  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMsg(null);
    try {
      await call("/checkins", {
        method: "POST",
        json: {
          cadence: "monthly",
          periodKey,
          progressNote: progressNote || undefined,
          blocker: blocker || undefined,
          goalUpdates: goals.map((g) => ({
            goalId: g.id,
            progressPct: Number(progress[g.id] ?? 0),
            note: notes[g.id] || undefined,
          })),
        },
      });
      setMsg({ kind: "ok", text: `Đã nộp check-in ${periodKey}. Sức khoẻ mục tiêu đã được tính lại.` });
      setProgressNote(""); setBlocker(""); setNotes({});
      await load(); // nạp lại để thấy health mới do BE roll-up
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", marginTop: 8, fontFamily: "inherit", fontSize: 12.5, padding: "8px 11px",
    borderRadius: 9, border: "1px solid var(--nhg-border-default)",
    background: "var(--nhg-bg-canvas)", color: "var(--nhg-text-primary)",
  };

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Cập nhật tiến độ" }}>
      <div className="page-head">
        <div className="eyebrow">Cập nhật tiến độ · Continuous Check-in</div>
        <h1>Check-in {periodKey}</h1>
        <p>Trao đổi tiến độ định kỳ thay vì chờ cuối năm — cập nhật mục tiêu, nêu điểm nghẽn.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 14 }}>{msg.text}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
          <Card
            title={<><CalendarCheck size={16} color="var(--nhg-primary)" /> Cập nhật mục tiêu</>}
            sub={thisPeriod ? `Kỳ ${periodKey} đã nộp` : `Tiến độ từng mục tiêu trong kỳ ${periodKey}`}
          >
            {goals.length === 0 && (
              <span className="tiny muted">
                Bạn chưa có mục tiêu nào — chưa cần check-in kỳ này.
              </span>
            )}

            {thisPeriod ? (
              <>
                <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                  <Badge tone={CK_TONE[thisPeriod.status]}>{CK_LABEL[thisPeriod.status]}</Badge>
                  <span className="tiny muted">
                    Đã nộp {new Date(thisPeriod.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                {thisPeriod.progressNote && (
                  <div className="ai-draft" style={{ marginTop: 0 }}>{thisPeriod.progressNote}</div>
                )}
                {thisPeriod.blocker && (
                  <div className="ai-flag" style={{ marginTop: 10 }}>
                    <AlertCircle size={15} /><span>{thisPeriod.blocker}</span>
                  </div>
                )}
                {thisPeriod.managerComment && (
                  <>
                    <hr className="hr" />
                    <div className="card-sub" style={{ marginBottom: 6 }}>
                      <MessageSquare size={13} /> Nhận xét của quản lý
                    </div>
                    <div className="ai-draft" style={{ marginTop: 0 }}>{thisPeriod.managerComment}</div>
                  </>
                )}
                <hr className="hr" />
                <span className="tiny muted">
                  Mỗi kỳ chỉ nộp một lần. Cần sửa thì trao đổi với quản lý trực tiếp.
                </span>
              </>
            ) : (
              goals.length > 0 && (
                <>
                  {goals.map((g) => (
                    <div key={g.id} style={{ marginBottom: 16 }}>
                      <div className="row between" style={{ marginBottom: 5 }}>
                        <b style={{ fontSize: 13 }}>{g.nameVi}</b>
                        <span className="tiny numeric muted">{progress[g.id] ?? 0}%</span>
                      </div>
                      <Progress
                        value={progress[g.id] ?? 0}
                        tone={(progress[g.id] ?? 0) < 40 ? "danger" : (progress[g.id] ?? 0) < 70 ? "warn" : undefined}
                      />
                      <input
                        type="range" min={0} max={100} step={1}
                        value={progress[g.id] ?? 0}
                        onChange={(e) => setProgress((p) => ({ ...p, [g.id]: Number(e.target.value) }))}
                        style={{ width: "100%", marginTop: 8 }}
                      />
                      <input
                        value={notes[g.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [g.id]: e.target.value }))}
                        placeholder="Ghi chú tiến độ…"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <hr className="hr" />
                  <div className="card-sub" style={{ marginBottom: 6 }}>Tóm tắt kỳ này</div>
                  <input
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    placeholder="Tóm tắt những gì đã làm được…"
                    style={{ ...inputStyle, marginTop: 0 }}
                  />
                  <div className="card-sub" style={{ margin: "12px 0 6px" }}>Điểm nghẽn (nếu có)</div>
                  <input
                    value={blocker}
                    onChange={(e) => setBlocker(e.target.value)}
                    placeholder="Điều gì đang cản trở bạn?"
                    style={{ ...inputStyle, marginTop: 0 }}
                  />
                  <button
                    className="btn primary sm" style={{ marginTop: 14 }}
                    disabled={busy} onClick={() => void submit()}
                  >
                    <Check size={15} /> {busy ? "Đang nộp…" : `Nộp check-in ${periodKey}`}
                  </button>
                </>
              )
            )}
          </Card>

          <Card title="Lịch sử check-in" sub="Các kỳ gần đây">
            {history.length === 0 && <span className="tiny muted">Chưa có kỳ nào.</span>}
            {history.length > 0 && (
              <table className="table">
                <thead><tr><th>Kỳ</th><th>Trạng thái</th><th className="rt">Mục tiêu</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{h.periodKey}</td>
                      <td><Badge tone={CK_TONE[h.status] ?? "gray"}>{CK_LABEL[h.status] ?? h.status}</Badge></td>
                      <td className="rt numeric">{h.goalUpdates?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
