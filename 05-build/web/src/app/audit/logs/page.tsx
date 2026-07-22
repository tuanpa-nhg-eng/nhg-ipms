"use client";
/**
 * [Trục A — L5] Nhật ký kiểm toán — nối `GET /audit-logs` (read-model L1).
 *
 * [I6] CHỈ vai `auditor` đọc được. `tenant_admin` CỐ Ý không có `audit:read` — người
 * quản trị hệ thống không tự đọc (và do đó tự kiểm) vết của chính mình. Đăng nhập
 * admin@ ở màn này sẽ thấy thông báo từ chối: đó là hành vi ĐÚNG, không phải lỗi.
 *
 * [I5] Danh sách KHÔNG trả `before`/`after` — hai cột đó chứa payload nghiệp vụ thô,
 * có PII (vé F5 từ Phase 0, chưa có allowlist field). Chỉ hiện cờ "có dữ liệu kèm theo"
 * để kiểm toán viên biết mà xin trích xuất theo quy trình riêng.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollText, Lock, Filter, ChevronDown, Database } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  at: string;
  ip?: string | null;
  actor: { id: string; email: string | null; fullName: string | null } | null;
  hasPayload: boolean;
}
interface AuditPage { entries: AuditEntry[]; nextCursor: string | null; total: number }

export default function AuditLogsPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [denied, setDenied] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const fetchPage = useCallback(async (reset: boolean, cur?: string | null) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (action.trim()) qs.set("action", action.trim());
    if (entityType.trim()) qs.set("entityType", entityType.trim());
    if (cur) qs.set("cursor", cur);
    const page = await call<AuditPage>(`/audit-logs?${qs.toString()}`);
    setEntries((prev) => (reset ? page.entries : [...prev, ...page.entries]));
    setCursor(page.nextCursor);
  }, [call, action, entityType]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await call<MeResponse>("/me");
      setMe(m);
      if (!m.permissions?.includes("audit:read")) { setDenied(true); return; }
      setDenied(false);
      await fetchPage(true, null);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call, fetchPage]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    setMore(true);
    try { await fetchPage(false, cursor); }
    catch (e) { setErr((e as Error).message); }
    finally { setMore(false); }
  };

  return (
    <AppShell crumb={{ section: "Kiểm toán", page: "Nhật ký" }}>
      <div className="page-head">
        <div className="eyebrow">Audit Log · vết không sửa được</div>
        <h1>Nhật ký kiểm toán</h1>
        <p>Ghi thêm-chỉ-thêm ở tầng cơ sở dữ liệu — không ai sửa hay xoá được, kể cả chủ sở hữu.</p>
      </div>

      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}
      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}

      {!loading && denied && (
        <Card>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Lock size={18} />
            <div>
              <b style={{ fontSize: 13 }}>Tài khoản này không có quyền đọc nhật ký kiểm toán</b>
              <p className="tiny muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
                Quyền <b>audit:read</b> chỉ cấp cho vai <b>kiểm toán viên</b>. Quản trị viên đơn vị
                cố ý KHÔNG có quyền này — để người quản trị hệ thống không tự đọc, và do đó không
                tự kiểm, vết hoạt động của chính mình. Đăng nhập <b>auditor@</b> để xem.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !denied && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 200 }}>
              <label>Hành động (tiền tố)</label>
              <input className="studio-input" value={action} onChange={(e) => setAction(e.target.value)}
                placeholder="review. · config. · library." />
            </div>
            <div className="studio-field" style={{ minWidth: 180 }}>
              <label>Loại đối tượng</label>
              <input className="studio-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}
                placeholder="review · task_cell" />
            </div>
            <button className="btn ghost sm" onClick={() => void load()}><Filter size={15} /> Lọc</button>
          </div>

          <Card title={<><ScrollText size={16} color="var(--nhg-primary)" /> Vết hoạt động</>}
            sub={`${entries.length} bản ghi${cursor ? " (còn nữa)" : ""}`}>
            {entries.length === 0 && <span className="tiny muted">Không có bản ghi nào khớp bộ lọc.</span>}
            {entries.length > 0 && (
              <table className="table">
                <thead>
                  <tr><th>Thời điểm</th><th>Hành động</th><th>Đối tượng</th><th>Người thực hiện</th><th>Dữ liệu</th></tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="tiny numeric">{new Date(e.at).toLocaleString("vi-VN")}</td>
                      <td><b style={{ fontSize: 12.5 }}>{e.action}</b></td>
                      <td className="tiny">
                        {e.entityType}
                        {e.entityId && <div className="muted tiny">{e.entityId.slice(0, 8)}…</div>}
                      </td>
                      <td className="tiny">
                        {e.actor?.fullName ?? e.actor?.email ?? "—"}
                        {e.ip && <div className="muted tiny">{e.ip}</div>}
                      </td>
                      <td>
                        {e.hasPayload
                          ? <Badge tone="info"><Database size={11} /> có</Badge>
                          : <span className="tiny muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {cursor && (
              <button className="btn ghost sm" style={{ marginTop: 12 }} disabled={more}
                onClick={() => void loadMore()}>
                <ChevronDown size={15} /> {more ? "Đang tải…" : "Tải thêm"}
              </button>
            )}
            <hr className="hr" />
            <span className="tiny muted">
              Nội dung thay đổi trước/sau KHÔNG hiển thị ở đây: hai trường đó chứa dữ liệu nghiệp
              vụ thô, có thể gồm thông tin cá nhân. Cần trích xuất thì đi theo quy trình riêng có
              phê duyệt.
            </span>
          </Card>
        </>
      )}
    </AppShell>
  );
}
