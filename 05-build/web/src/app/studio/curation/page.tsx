"use client";
/**
 * Curation Queue (Spec_BU_Authoring_Gate §6) — LIBRARY CURATOR gác cổng thư viện:
 * hàng đợi contribution → xem payload + quality report + dedup candidates →
 * approve / request changes / reject → publish canonical. SoD: không tự duyệt bài mình
 * (BE chặn bất biến — UI chỉ hiển thị lỗi trung thực).
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCheck, CircleCheck, CircleX, Inbox, MessageSquareText, Rocket, Undo2, X } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { InlineAssist } from "@/components/ai/InlineAssist";
import { useStudio } from "@/lib/studio";
import { DedupCandidate, LibraryContribution } from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  submitted: "amber", in_review: "amber", needs_changes: "red",
  approved: "green", published: "green", rejected: "red",
};
const QUEUE_FILTERS = ["", "submitted", "in_review", "needs_changes", "approved", "published", "rejected"];

export default function CurationQueuePage() {
  const { call } = useStudio();
  const [queue, setQueue] = useState<LibraryContribution[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<LibraryContribution | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  const reload = useCallback(async () => {
    try {
      const list = await call<LibraryContribution[]>(
        `/library/queue${filter ? `?status=${filter}` : ""}`,
      );
      setQueue(list);
      setSelected((prev) => list.find((c) => c.id === prev?.id) ?? null);
    } catch (e) { fail(e); }
  }, [call, filter]);
  useEffect(() => { void reload(); }, [reload]);

  const act = async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      setNote("");
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const review = (action: string) => {
    if (!selected) return;
    void act(
      () => call(`/library/contributions/${selected.id}/review`, {
        method: "POST", json: { action, ...(note ? { note } : {}) },
      }),
      `Đã ${action === "approve" ? "duyệt" : action === "reject" ? "từ chối" : "yêu cầu chỉnh sửa"}`,
    );
  };

  const publish = () => {
    if (!selected) return;
    void act(
      () => call(`/library/contributions/${selected.id}/publish`, { method: "POST" }),
      "Đã publish vào thư viện canonical — Derivation Engine dùng được ngay",
    );
  };

  const resolve = (d: DedupCandidate, resolution: string) => {
    void act(
      () => call(`/library/dedup/${d.id}/resolve`, { method: "POST", json: { resolution } }),
      `Dedup → ${resolution}`,
    );
  };

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Curation Queue" }}>
      <div className="page-head">
        <div className="eyebrow">BU Authoring Gate — kiểm duyệt</div>
        <h1>Hàng đợi thư viện</h1>
        <p>Quality gate + dedup + SoD (soạn ⟂ duyệt) trước khi vào thư viện dùng chung. Đăng nhập bằng curator@.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <Card title={<><Inbox size={15} /> Hàng đợi</>}
          sub="Mặc định: submitted + in_review — draft local của BU không hiện ở đây">
          <div className="studio-toolbar">
            <div className="studio-field">
              <label>Lọc trạng thái</label>
              <select className="studio-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                {QUEUE_FILTERS.map((s) => <option key={s} value={s}>{s || "— hàng đợi —"}</option>)}
              </select>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Mã</th><th>Loại</th><th>Trạng thái</th><th className="rt">Score</th><th className="rt">Dedup</th></tr></thead>
            <tbody>
              {queue.map((c) => {
                const pending = (c.dedupCandidates ?? []).filter((d) => d.resolution === "pending").length;
                return (
                  <tr key={c.id} style={{ cursor: "pointer", ...(selected?.id === c.id ? { background: "var(--nhg-primary-subtle)" } : {}) }}
                    onClick={() => setSelected(c)}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                      {c.payload.code ?? c.payload.kpi?.code ?? "—"}
                    </td>
                    <td style={{ fontSize: 11.5 }}>{c.type}</td>
                    <td><Badge tone={STATUS_TONE[c.status] ?? "gray"}>{c.status}</Badge></td>
                    <td className="rt">{c.qualityScore ?? "—"}</td>
                    <td className="rt">{pending > 0 ? <Badge tone="red">{pending}</Badge> : "0"}</td>
                  </tr>
                );
              })}
              {queue.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--nhg-text-secondary)" }}>Hàng đợi trống.</td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <div>
          <Card title="Chi tiết & quyết định" sub={selected ? `${selected.payload.code ?? "—"} · v${selected.version}` : "Chọn một mục trong hàng đợi"}>
            {selected && (
              <>
                {selected.qualityReport && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    <Badge tone={selected.qualityReport.ok ? "green" : "red"}>
                      Gate {selected.qualityReport.ok ? "ĐẠT" : "CHƯA đạt"} · {selected.qualityReport.score}%
                    </Badge>
                    {selected.qualityReport.checks.filter((ch) => !ch.passed).map((ch) => (
                      <div key={ch.id} style={{ display: "flex", gap: 6, fontSize: 12 }}>
                        <CircleX size={13} style={{ color: "#ED2024", flexShrink: 0, marginTop: 1 }} />
                        <span>{ch.label}{ch.note ? ` — ${ch.note}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}

                <dl className="kv">
                  <dt>Tên</dt><dd>{selected.payload.nameVi ?? "—"}</dd>
                  <dt>RACI</dt>
                  <dd>R: {selected.payload.responsibleRole ?? "—"} · A: {selected.payload.accountableRole ?? "—"}</dd>
                  <dt>I/O</dt>
                  <dd>{(selected.payload.inputs ?? []).join(", ") || "—"} → {(selected.payload.outputs ?? []).join(", ") || "—"}</dd>
                  <dt>Measures</dt>
                  <dd>{(selected.payload.measures ?? []).map((m) => typeof m === "string" ? m : m.name).join(", ") || "—"}</dd>
                  <dt>KPI</dt>
                  <dd>{selected.payload.kpi
                    ? `${selected.payload.kpi.code ?? "(sinh từ cell)"} · ${selected.payload.kpi.nameVi ?? "—"} · ${selected.payload.kpi.method ?? "—"}/${selected.payload.kpi.direction ?? "—"}`
                    : "—"}</dd>
                </dl>

                {(selected.dedupCandidates?.length ?? 0) > 0 && (
                  <>
                    <div style={{ margin: "12px 0 6px", fontSize: 11, textTransform: "uppercase", color: "var(--nhg-text-secondary)", fontWeight: 600 }}>
                      Dedup candidates (người quyết — hệ chỉ gợi ý)
                    </div>
                    {/* [AI inline] curation.dedup — tóm tắt khác biệt 2 cell + khuyến nghị merge/keep_both */}
                    {(selected.dedupCandidates ?? []).some((d) => d.resolution === "pending" && d.similarTaskCellId) && (
                      <div style={{ marginBottom: 8 }}>
                        <InlineAssist task="curation.dedup" label="AI phân tích trùng"
                          buildInput={() => ({ contributionId: selected.id })}
                          onAccept={(p) => {
                            const cand = (selected.dedupCandidates ?? [])
                              .find((d) => d.resolution === "pending" && d.similarTaskCellId);
                            const rec = typeof p.recommendation === "string" ? p.recommendation : null;
                            if (cand && (rec === "merge" || rec === "keep_both")) resolve(cand, rec);
                          }}
                          disabled={busy} />
                      </div>
                    )}
                    {selected.dedupCandidates!.map((d) => (
                      <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 6, flexWrap: "wrap" }}>
                        <Badge tone={d.resolution === "pending" ? "red" : "gray"}>
                          {Number(d.similarity ?? 0).toFixed(2)} · {d.resolution}
                        </Badge>
                        <span style={{ flex: 1 }}>{d.reason}</span>
                        {["merge", "keep_both", "discard"].map((res) => (
                          <button key={res} className="btn ghost sm" disabled={busy || d.resolution === res}
                            onClick={() => resolve(d, res)}>{res}</button>
                        ))}
                      </div>
                    ))}
                  </>
                )}

                <div className="studio-field" style={{ margin: "10px 0" }}>
                  <label>Ghi chú duyệt</label>
                  <input className="studio-input" value={note} placeholder="vd: bổ sung measure định lượng"
                    onChange={(e) => setNote(e.target.value)} />
                </div>
                {/* [F104] gate nút theo transition BE cho phép — không mời bấm để nhận 409 */}
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {["submitted", "in_review"].includes(selected.status) && (
                    <button className="btn ghost sm" disabled={busy} onClick={() => review("comment")}>
                      <MessageSquareText size={13} /> Góp ý
                    </button>
                  )}
                  {["submitted", "in_review", "approved"].includes(selected.status) && (
                    <>
                      <button className="btn ghost sm" disabled={busy} onClick={() => review("request_changes")}>
                        <Undo2 size={13} /> Yêu cầu sửa
                      </button>
                      <button className="btn ghost sm" disabled={busy} onClick={() => review("reject")}>
                        <X size={13} /> Từ chối
                      </button>
                    </>
                  )}
                  {(selected.status === "submitted" || selected.status === "in_review") && (
                    <button className="btn primary sm" disabled={busy} onClick={() => review("approve")}>
                      <CheckCheck size={13} /> Duyệt
                    </button>
                  )}
                  {selected.status === "approved" && (
                    <button className="btn accent sm" disabled={busy} onClick={publish}>
                      <Rocket size={13} /> Publish canonical
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--nhg-text-secondary)", display: "flex", gap: 5 }}>
                  <CircleCheck size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  Publish tạo canonical task_cell + kpi_template — Auto-Derivation Engine kéo theo được ngay cho vị trí khớp function.
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
