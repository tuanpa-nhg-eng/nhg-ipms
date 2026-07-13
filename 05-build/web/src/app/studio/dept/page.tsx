"use client";
/**
 * Bàn làm việc Trưởng phòng (Spec Task Dictionary §7, lát 4l) — cổng vận hành vòng
 * lặp tối ưu liên tục của phòng:
 *   ① Nhân sự phòng + ỦY QUYỀN SOẠN (grant/revoke taskcell:author — 4j)
 *   ② Tác vụ CHƯA NHẬN → claim về phòng
 *   ③ Tác vụ CỦA PHÒNG → mở vòng tối ưu (reopen, giao nhân viên) / huỷ vòng
 *   ④ Hàng đợi phiếu → DUYỆT KÍCH HOẠT (approve-active → active v+1 + revision)
 * SoD bất biến (BE chặn): người sửa ⟂ người duyệt. Đăng nhập bằng dept@.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users2, PackageOpen, RefreshCw, GitPullRequestArrow,
  Inbox, CircleCheck, CircleX, ShieldCheck, Undo2, UserPlus, UserMinus, Hand,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { AuthoringGrant, DeptBoard, DeptBoardCell, DeptBoardQueueItem, DeptStaff } from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  active: "green", reopened: "amber", draft: "gray", deprecated: "gray",
  submitted: "amber", in_review: "amber", needs_changes: "red", published: "green", rejected: "red",
};
const AI_TONE: Record<string, string> = {
  manual: "gray", assist: "amber", augment: "info", auto_hitl: "green", system: "ai",
};

export default function DeptBoardPage() {
  const { call } = useStudio();
  const [board, setBoard] = useState<DeptBoard | null>(null);
  const [grants, setGrants] = useState<AuthoringGrant[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // trạng thái claim & reopen (mini-form nội tuyến)
  const [claimUnit, setClaimUnit] = useState<Record<string, string>>({}); // cellId → orgUnitId
  const [reopenCell, setReopenCell] = useState<DeptBoardCell | null>(null);
  const [reopenAssignee, setReopenAssignee] = useState("");
  const [reopenNote, setReopenNote] = useState("");
  const [approveNote, setApproveNote] = useState<Record<string, string>>({});

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  const reload = useCallback(async () => {
    try {
      const [b, g] = await Promise.all([
        call<DeptBoard>("/task-board"),
        call<AuthoringGrant[]>("/authoring/grants").catch(() => [] as AuthoringGrant[]),
      ]);
      setBoard(b);
      setGrants(g);
    } catch (e) { fail(e); }
  }, [call]);
  useEffect(() => { void reload(); }, [reload]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ kind: "ok", text: ok }); await reload(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  // map grantee → grant active (để revoke lấy đúng id)
  const grantOf = useMemo(() => {
    const m = new Map<string, AuthoringGrant>();
    for (const g of grants) if (g.status === "active") m.set(`${g.granteeId}:${g.orgUnitId}`, g);
    return m;
  }, [grants]);

  const grant = (s: DeptStaff) => {
    if (!s.orgUnitId) return;
    void act(
      () => call("/authoring/grants", { method: "POST", json: { granteeId: s.userId, orgUnitId: s.orgUnitId } }),
      `Đã cấp quyền soạn cho ${s.fullName}`,
    );
  };
  const revoke = (s: DeptStaff) => {
    const g = s.orgUnitId ? grantOf.get(`${s.userId}:${s.orgUnitId}`) : undefined;
    if (!g) { setMsg({ kind: "err", text: "Không tìm thấy grant đang hiệu lực để thu hồi (reload)" }); return; }
    void act(() => call(`/authoring/grants/${g.id}`, { method: "DELETE" }), `Đã thu quyền soạn của ${s.fullName}`);
  };

  const claim = (cell: DeptBoardCell) => {
    const unit = claimUnit[cell.id] ?? board?.orgUnits[0]?.id;
    if (!unit) { setMsg({ kind: "err", text: "Chọn phòng để nhận tác vụ về" }); return; }
    void act(() => call(`/task-cells/${cell.id}/claim`, { method: "POST", json: { orgUnitId: unit } }),
      `Đã nhận ${cell.code} về phòng`);
  };

  const openReopen = (cell: DeptBoardCell) => {
    setReopenCell(cell); setReopenAssignee(""); setReopenNote("");
  };
  const doReopen = () => {
    if (!reopenCell || !reopenAssignee) return;
    void act(
      () => call(`/task-cells/${reopenCell.id}/reopen`, {
        method: "POST", json: { assigneeId: reopenAssignee, ...(reopenNote ? { note: reopenNote } : {}) },
      }),
      `Đã mở vòng tối ưu ${reopenCell.code} — giao nhân viên sửa`,
    ).then(() => setReopenCell(null));
  };
  const cancelReopen = (cell: DeptBoardCell) =>
    void act(() => call(`/task-cells/${cell.id}/reopen-cancel`, { method: "POST", json: {} }),
      `Đã huỷ vòng tối ưu ${cell.code} — trả về active`);

  const approveActive = (q: DeptBoardQueueItem) =>
    void act(
      () => call(`/library/contributions/${q.id}/approve-active`, {
        method: "POST", json: { ...(approveNote[q.id] ? { note: approveNote[q.id] } : {}) },
      }),
      "Đã duyệt kích hoạt — tác vụ lên phiên bản mới (active v+1)",
    );

  // nhân viên đủ điều kiện được giao sửa: có quyền soạn + thuộc phòng sở hữu cell
  const eligibleAssignees = useMemo(() => {
    if (!reopenCell || !board) return [] as DeptStaff[];
    return board.staff.filter((s) => s.canAuthor && s.orgUnitId === reopenCell.ownerOrgUnitId);
  }, [reopenCell, board]);

  const codeById = useMemo(() => {
    const m = new Map<string, DeptBoardCell>();
    for (const c of board?.mine ?? []) m.set(c.id, c);
    return m;
  }, [board]);

  return (
    <AppShell crumb={{ section: "Từ điển Tác vụ", page: "Bàn làm việc Trưởng phòng" }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Vòng lặp tối ưu liên tục · trưởng phòng gác cổng active</div>
          <h1>Bàn làm việc Trưởng phòng</h1>
          <p>Nhận tác vụ về phòng · ủy quyền nhân viên soạn · mở vòng tối ưu · duyệt kích hoạt phiên bản mới. Đăng nhập bằng <b>dept@</b>.</p>
        </div>
        <button className="btn ghost sm" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        {/* Cột trái: nhân sự + tác vụ chưa nhận */}
        <div>
          <Card title={<><Users2 size={15} /> Nhân sự phòng &amp; ủy quyền soạn</>}
            sub="SoD: người được cấp quyền SOẠN không đồng thời là người DUYỆT. Thu quyền có hiệu lực tức thì.">
            <table className="table">
              <thead><tr><th>Nhân viên</th><th>Mã NV</th><th className="rt">Quyền soạn</th></tr></thead>
              <tbody>
                {(board?.staff ?? []).map((s) => (
                  <tr key={s.userId}>
                    <td>{s.fullName}</td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{s.employeeCode ?? "—"}</td>
                    <td className="rt">
                      {s.canAuthor ? (
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <Badge tone="green">được soạn</Badge>
                          <button className="btn ghost sm" disabled={busy || !s.orgUnitId} onClick={() => revoke(s)}>
                            <UserMinus size={12} /> Thu
                          </button>
                        </div>
                      ) : (
                        <button className="btn ghost sm" disabled={busy || !s.orgUnitId} onClick={() => grant(s)}>
                          <UserPlus size={12} /> Cấp quyền
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(board?.staff.length ?? 0) === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>
                    Chưa có nhân sự trong phạm vi phòng.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <div style={{ height: 12 }} />
          <Card title={<><PackageOpen size={15} /> Tác vụ chưa nhận về phòng</>}
            sub="Tác vụ chuẩn còn trống chủ sở hữu — nhận về phòng để mở được vòng tối ưu.">
            <table className="table">
              <thead><tr><th>Mã</th><th>Tên</th><th>Nhận về</th></tr></thead>
              <tbody>
                {(board?.unclaimed ?? []).slice(0, 40).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{c.code}</td>
                    <td style={{ fontSize: 12 }}>{c.nameVi}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {(board?.orgUnits.length ?? 0) > 1 && (
                          <select className="studio-select" style={{ height: 28, fontSize: 11.5 }}
                            value={claimUnit[c.id] ?? board?.orgUnits[0]?.id ?? ""}
                            onChange={(e) => setClaimUnit((m) => ({ ...m, [c.id]: e.target.value }))}>
                            {board?.orgUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                          </select>
                        )}
                        <button className="btn ghost sm" disabled={busy || (board?.orgUnits.length ?? 0) === 0}
                          onClick={() => claim(c)}>
                          <Hand size={12} /> Nhận
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(board?.unclaimed.length ?? 0) === 0 && (
                  <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>Không còn tác vụ chưa nhận.</td></tr>
                )}
              </tbody>
            </table>
            {(board?.unclaimed.length ?? 0) > 40 && (
              <div style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)", marginTop: 6 }}>
                …hiển thị 40/{board?.unclaimed.length} — dùng bộ lọc ở Từ điển để tìm mã cụ thể.
              </div>
            )}
          </Card>
        </div>

        {/* Cột phải: tác vụ của phòng + hàng đợi phiếu */}
        <div>
          <Card title={<><ShieldCheck size={15} /> Tác vụ của phòng</>}
            sub="Mở vòng tối ưu khi có góp ý sử dụng; huỷ vòng nếu giao nhầm. Góp ý mở hiển thị số đỏ.">
            <table className="table">
              <thead><tr><th>Mã</th><th>Trạng thái</th><th className="rt">v</th><th className="rt">Góp ý</th><th></th></tr></thead>
              <tbody>
                {(board?.mine ?? []).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                      {c.code}
                      {c.aiLevel && <><br /><Badge tone={AI_TONE[c.aiLevel] ?? "gray"}>{c.aiLevel}</Badge></>}
                    </td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? "gray"}>{c.status}</Badge></td>
                    <td className="rt">{c.activeVersion}</td>
                    <td className="rt">{(c.openFeedback ?? 0) > 0 ? <Badge tone="red">{c.openFeedback}</Badge> : "0"}</td>
                    <td>
                      {c.status === "active" && (
                        <button className="btn ghost sm" disabled={busy} onClick={() => openReopen(c)}>
                          <GitPullRequestArrow size={12} /> Mở vòng
                        </button>
                      )}
                      {c.status === "reopened" && (
                        <button className="btn ghost sm" disabled={busy} onClick={() => cancelReopen(c)}>
                          <Undo2 size={12} /> Huỷ vòng
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(board?.mine.length ?? 0) === 0 && (
                  <tr><td colSpan={5} style={{ color: "var(--nhg-text-secondary)" }}>
                    Phòng chưa sở hữu tác vụ nào — nhận từ danh sách bên trái.
                  </td></tr>
                )}
              </tbody>
            </table>

            {reopenCell && (
              <div className="dept-reopen">
                <div className="dept-reopen-head">
                  <GitPullRequestArrow size={14} /> Mở vòng tối ưu <code>{reopenCell.code}</code>
                  <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setReopenCell(null)}>
                    <CircleX size={13} />
                  </button>
                </div>
                <div className="studio-field">
                  <label>Giao nhân viên sửa (chỉ người ĐÃ được cấp quyền soạn, thuộc phòng sở hữu)</label>
                  <select className="studio-select" value={reopenAssignee} onChange={(e) => setReopenAssignee(e.target.value)}>
                    <option value="">— chọn nhân viên —</option>
                    {eligibleAssignees.map((s) => (
                      <option key={s.userId} value={s.userId}>{s.fullName} ({s.employeeCode ?? "—"})</option>
                    ))}
                  </select>
                </div>
                {eligibleAssignees.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#ED2024", margin: "4px 0" }}>
                    Chưa có nhân viên đủ điều kiện — cấp quyền soạn ở bảng nhân sự trước.
                  </div>
                )}
                <div className="studio-field">
                  <label>Ghi chú (tuỳ chọn) — bối cảnh vòng tối ưu</label>
                  <input className="studio-input" value={reopenNote} placeholder="vd: gộp góp ý SLA từ 3 nhân viên"
                    onChange={(e) => setReopenNote(e.target.value)} />
                </div>
                <button className="btn primary sm" disabled={busy || !reopenAssignee} onClick={doReopen}>
                  <GitPullRequestArrow size={13} /> Mở vòng &amp; giao việc
                </button>
              </div>
            )}
          </Card>

          <div style={{ height: 12 }} />
          <Card title={<><Inbox size={15} /> Hàng đợi phiếu vòng tối ưu</>}
            sub="Nhân viên sửa xong gửi lên đây. Duyệt → active v+1 + lưu lịch sử. SoD: không tự duyệt bản mình.">
            <table className="table">
              <thead><tr><th>Tác vụ</th><th>Trạng thái</th><th className="rt">Score</th><th></th></tr></thead>
              <tbody>
                {(board?.queue ?? []).map((q) => {
                  const cell = codeById.get(q.taskCellId);
                  const ready = q.status === "submitted" || q.status === "in_review";
                  return (
                    <tr key={q.id}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                        {cell?.code ?? q.payload.code ?? "—"}
                        {q.kpiRef && <><br /><span className="dict-kpi" style={{ fontSize: 10 }}>{q.kpiRef}</span></>}
                      </td>
                      <td><Badge tone={STATUS_TONE[q.status] ?? "gray"}>{q.status}</Badge></td>
                      <td className="rt">{q.qualityScore ?? "—"}</td>
                      <td>
                        {ready ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                            <input className="studio-input" style={{ height: 26, fontSize: 11, width: 150 }}
                              placeholder="ghi chú duyệt" value={approveNote[q.id] ?? ""}
                              onChange={(e) => setApproveNote((m) => ({ ...m, [q.id]: e.target.value }))} />
                            <button className="btn primary sm" disabled={busy} onClick={() => approveActive(q)}>
                              <CircleCheck size={12} /> Duyệt kích hoạt
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--nhg-text-secondary)" }}>nhân viên đang sửa</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(board?.queue.length ?? 0) === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>
                    Hàng đợi trống — chưa có phiếu vòng tối ưu nào.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
