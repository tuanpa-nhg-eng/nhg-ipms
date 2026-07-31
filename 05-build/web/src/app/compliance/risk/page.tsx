"use client";
/**
 * [Trục C — L4] Cờ rủi ro & Sự cố — màn của B5 (tuân thủ) và B0 (kiểm toán).
 *
 * Đây là "đường thứ nhất" trong bốn đường của lát. Ba đường còn lại là API: `/risk/summary`
 * (V1 điều hành, chỉ số đếm), `/platform/risk` (B3, số đếm xuyên đơn vị), và `/audit-logs`
 * (B0 đọc thẳng nguồn gốc — cờ chỉ là lớp suy ra, không phải nguồn sự thật thứ hai).
 *
 * Hai điều màn này CỐ Ý không có:
 *  · KHÔNG có nút "tạo cờ" — cờ sinh từ sự kiện (K8). Một sổ rủi ro nhập tay đo sự chăm chỉ
 *    của người nhập, không đo rủi ro.
 *  · KHÔNG có nút "bỏ qua/xoá cờ" — cờ là sự kiện ĐÃ xảy ra. Xử lý một cờ nghĩa là gắn nó vào
 *    một sự cố và đóng sự cố đó, có người phụ trách và nguyên nhân gốc.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { TriangleAlert, Lock, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface RiskFlag {
  id: string; kind: string; severity: "low" | "medium" | "high";
  summary: string; occurredAt: string; incidentId: string | null;
  actor: { id: string; email: string | null } | null;
}
interface Incident {
  id: string; title: string; severity: string; status: string;
  openedAt: string; closedAt: string | null; rootCause: string | null;
  assignee: { email: string | null } | null; flagCount: number; version: number;
}

const KIND_LABEL: Record<string, string> = {
  export_blocked: "Xuất dữ liệu bị chặn",
  privilege_escalation_blocked: "Chặn leo thang quyền",
  impersonation_blocked: "Chặn mở phiên đóng vai",
  ai_egress_blocked: "Gọi AI bị chặn egress",
  sod_violation: "Vi phạm phân tách nhiệm vụ",
  policy_denied: "Chính sách truy cập từ chối",
  exception_denied: "Đơn ngoại lệ bị chặn",
  exception_used: "Dùng quyền nới có thời hạn",
};
const SEV_TONE: Record<string, "red" | "amber" | "gray"> = {
  high: "red", medium: "amber", low: "gray",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Mới mở", investigating: "Đang điều tra",
  remediating: "Đang khắc phục", closed: "Đã đóng",
};

export default function RiskPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [denied, setDenied] = useState(false);
  const [flags, setFlags] = useState<RiskFlag[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sev, setSev] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const canManage = !!me?.permissions?.includes("incident:manage");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await call<MeResponse>("/me");
      setMe(m);
      if (!m.permissions?.includes("risk:read")) { setDenied(true); return; }
      setDenied(false);
      const [f, i] = await Promise.all([
        call<{ entries: RiskFlag[] }>(`/risk${sev ? `?severity=${sev}` : ""}`),
        call<{ entries: Incident[] }>("/incidents"),
      ]);
      setFlags(f.entries);
      setIncidents(i.entries);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call, sev]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, unlinked: 0 };
    for (const f of flags) {
      c[f.severity] += 1;
      if (!f.incidentId) c.unlinked += 1;
    }
    return c;
  }, [flags]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  async function openIncident() {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      const first = flags.find((f) => picked.has(f.id));
      await call("/incidents", {
        method: "POST",
        json: {
          title: `Xử lý ${picked.size} cảnh báo — ${KIND_LABEL[first?.kind ?? ""] ?? first?.kind}`,
          severity: first?.severity ?? "medium",
          flagIds: [...picked],
        },
      });
      setPicked(new Set());
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <AppShell crumb={{ section: "Tuân thủ", page: "Cờ rủi ro & Sự cố" }}>
      <div className="page-head">
        <div className="eyebrow">Risk &amp; Incident · sinh tự động từ sự kiện</div>
        <h1>Cờ rủi ro &amp; Sự cố</h1>
        <p>
          Cờ suy ra từ vết đã ghi (chặn xuất dữ liệu, vi phạm phân tách nhiệm vụ, chính sách từ
          chối, egress AI bị chặn, dùng ngoại lệ). Không có màn nhập tay — danh sách rỗng nghĩa
          là không có sự kiện nào, không phải chưa ai nhập.
        </p>
      </div>

      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}
      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}

      {!loading && denied && (
        <Card>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Lock size={18} />
            <div>
              <b style={{ fontSize: 13 }}>Cần quyền đọc cờ rủi ro</b>
              <p className="tiny muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
                Trang này yêu cầu <b>risk:read</b> — vai <b>data_steward</b> (tuân thủ) hoặc{" "}
                <b>auditor</b> (kiểm toán). Điều hành xem bản tổng hợp số đếm qua{" "}
                <code>/risk/summary</code>; tầng nền tảng xem theo đơn vị qua{" "}
                <code>/platform/risk</code>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !denied && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className="v red numeric">{counts.high}</div>
              <div className="l">Mức cao</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{counts.medium}</div>
              <div className="l">Mức trung bình</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{counts.unlinked}</div>
              <div className="l">Chưa gắn sự cố</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{incidents.filter((i) => i.status !== "closed").length}</div>
              <div className="l">Sự cố đang mở</div>
            </div></Card>
          </div>

          <Card className="mt-14">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="row" style={{ gap: 8 }}>
                <TriangleAlert size={16} />
                <b style={{ fontSize: 13 }}>Cờ rủi ro</b>
                <select
                  className="studio-select" value={sev} style={{ marginLeft: 8 }}
                  onChange={(e) => setSev(e.target.value)}
                >
                  <option value="">Mọi mức</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              {/* [J4] Chỉ hiện nút mà API sẽ nhận: `incident:manage` là của B5, B0 chỉ soát. */}
              {canManage && (
                <button
                  className="btn primary" disabled={picked.size === 0 || busy}
                  onClick={() => void openIncident()}
                >
                  Mở sự cố từ {picked.size} cờ đã chọn
                </button>
              )}
            </div>

            <table className="tbl" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  {canManage && <th style={{ width: 34 }} />}
                  <th>Loại</th><th>Mức</th><th>Diễn giải</th><th>Người liên quan</th>
                  <th>Thời điểm</th><th>Sự cố</th>
                </tr>
              </thead>
              <tbody>
                {flags.length === 0 && (
                  <tr><td colSpan={canManage ? 7 : 6} className="muted tiny">
                    Không có cờ nào trong 90 ngày gần đây.
                  </td></tr>
                )}
                {flags.map((f) => (
                  <tr key={f.id}>
                    {canManage && (
                      <td>
                        <input
                          type="checkbox" checked={picked.has(f.id)}
                          disabled={!!f.incidentId} onChange={() => toggle(f.id)}
                        />
                      </td>
                    )}
                    <td>{KIND_LABEL[f.kind] ?? f.kind}</td>
                    <td><Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge></td>
                    <td className="tiny">{f.summary}</td>
                    <td className="tiny muted">{f.actor?.email ?? "—"}</td>
                    <td className="tiny muted">{new Date(f.occurredAt).toLocaleString("vi-VN")}</td>
                    <td className="tiny">
                      {f.incidentId ? <Badge tone="gray">đã gắn</Badge> : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="mt-14">
            <div className="row" style={{ gap: 8 }}>
              <ShieldCheck size={16} />
              <b style={{ fontSize: 13 }}>Sự cố</b>
            </div>
            <table className="tbl" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Tiêu đề</th><th>Mức</th><th>Trạng thái</th><th>Số cờ</th>
                  <th>Phụ trách</th><th>Nguyên nhân gốc</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 && (
                  <tr><td colSpan={6} className="muted tiny">Chưa có sự cố nào.</td></tr>
                )}
                {incidents.map((i) => (
                  <tr key={i.id}>
                    <td className="tiny">{i.title}</td>
                    <td><Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge></td>
                    <td className="tiny">
                      <Badge tone={i.status === "closed" ? "green" : "amber"}>
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </td>
                    <td className="tiny numeric">{i.flagCount}</td>
                    <td className="tiny muted">{i.assignee?.email ?? "—"}</td>
                    <td className="tiny muted">{i.rootCause ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}
