"use client";
/**
 * [Trục A — L4] Chính sách truy cập — CHỈ ĐỌC, nối `GET /policies` (engine Cedar).
 *
 * Việc soạn/kích hoạt chính sách đã có nơi riêng ở Configuration Studio (có SoD
 * soạn ⟂ duyệt, có bộ test bắt buộc chạy lại tại thời điểm kích hoạt). Nhân đôi thao
 * tác đó sang màn HR sẽ tạo đường vòng quanh chính các cổng kiểm soát ấy — nên ở đây
 * chỉ hiển thị để HR biết luật nào đang chặn cái gì.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, FileText, ExternalLink, Lock } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface PolicyRow {
  id: string;
  name: string;
  description?: string | null;
  scope?: string | null;
  status: string;
  engine?: string;
  policyText?: string | null;
  tenantId?: string | null;
  updatedAt?: string;
}

const ST_TONE: Record<string, string> = { active: "green", draft: "amber", disabled: "gray" };

export default function PolicyPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await call<MeResponse>("/me");
      setMe(m);
      const list = await call<PolicyRow[]>("/policies");
      setPolicies(list);
      setActiveId((cur) => cur ?? list[0]?.id ?? null);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const active = policies.find((p) => p.id === activeId) ?? null;
  const activeCount = policies.filter((p) => p.status === "active").length;

  return (
    <AppShell crumb={{ section: "HR", page: "Chính sách truy cập" }}>
      <div className="page-head">
        <div className="eyebrow">Access Policy · chỉ đọc</div>
        <h1>Chính sách truy cập đang áp dụng</h1>
        <p>Lớp thu hẹp quyền chạy sau phân quyền vai trò — chính sách chỉ CẤM thêm, không cấp thêm.</p>
      </div>

      {err && (
        <Card>
          <div className="row" style={{ gap: 8 }}>
            <Lock size={16} />
            <span className="tiny muted">
              Không đọc được danh sách chính sách: {err}. Quyền đọc chính sách thuộc nhóm
              quản trị cấu hình.
            </span>
          </div>
        </Card>
      )}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && !err && (
        <>
          <div className="grid g4">
            <Card><div className="stat"><div className="v numeric">{policies.length}</div><div className="l">Chính sách</div></div></Card>
            <Card><div className="stat"><div className="v green numeric">{activeCount}</div><div className="l">Đang áp dụng</div></div></Card>
            <Card><div className="stat">
              <div className="v numeric">{policies.filter((p) => !p.tenantId).length}</div>
              <div className="l">Cấp tập đoàn</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{policies.filter((p) => p.status === "draft").length}</div>
              <div className="l">Bản nháp</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <Card title={<><FileText size={16} color="var(--nhg-primary)" /> Danh sách</>} sub="Bấm để xem nội dung luật">
              {policies.length === 0 && <span className="tiny muted">Chưa có chính sách nào được khai báo.</span>}
              {policies.length > 0 && (
                <table className="table">
                  <thead><tr><th>Tên</th><th>Phạm vi</th><th>Cấp</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {policies.map((p) => (
                      <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setActiveId(p.id)}>
                        <td>
                          <b>{p.name}</b>
                          {p.description && <div className="muted tiny">{p.description}</div>}
                        </td>
                        <td className="tiny">{p.scope ?? "—"}</td>
                        <td><Badge tone={p.tenantId ? "gray" : "info"}>{p.tenantId ? "Đơn vị" : "Tập đoàn"}</Badge></td>
                        <td><Badge tone={ST_TONE[p.status] ?? "gray"}>{p.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title="Nội dung luật" sub={active?.name ?? ""}>
                {!active && <span className="tiny muted">Chọn một chính sách.</span>}
                {active && (
                  <div className="ai-draft" style={{ marginTop: 0, fontFamily: "monospace", fontSize: 11.5, whiteSpace: "pre-wrap" }}>
                    {active.policyText ?? "— không có nội dung —"}
                  </div>
                )}
              </Card>

              <Card>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <ShieldCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Soạn và kích hoạt chính sách nằm ở Configuration Studio — nơi có tách vai
                    soạn ⟂ duyệt và bắt buộc chạy lại bộ test tại thời điểm kích hoạt.
                  </span>
                </div>
                <Link className="btn ghost sm" href="/studio">
                  Mở Configuration Studio <ExternalLink size={14} />
                </Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
