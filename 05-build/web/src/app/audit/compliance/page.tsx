"use client";
/**
 * [Trục A — L5] Tuân thủ — nối `GET /audit-logs/stats` + `/audit-logs` (lọc theo
 * nhóm hành động nhạy cảm).
 *
 * Bản mock cũ có bảng "kiểm tra tuân thủ" với các mục PASS/FAIL cứng và danh sách
 * ngoại lệ dựng sẵn. Hệ thống không có bộ luật tuân thủ khai báo được, nên chấm
 * PASS/FAIL là tự phong. Thay bằng thứ kiểm chứng được: các nhóm hành động có ý nghĩa
 * kiểm soát đã thực sự để lại vết hay chưa, và số lần chúng xảy ra.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Lock, Construction, Activity } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface Stats { actions: Array<{ action: string; count: number }> }

/** Nhóm hành động có ý nghĩa kiểm soát — mỗi nhóm là một câu hỏi kiểm toán thật. */
const CONTROLS: Array<{ prefix: string; label: string; why: string }> = [
  { prefix: "review.", label: "Vòng đánh giá hiệu suất", why: "Ai chấm ai, chốt lúc nào" },
  { prefix: "calibration.", label: "Cân chỉnh hạng", why: "Đổi hạng có lý do ghi lại" },
  { prefix: "rating", label: "Phê duyệt hạng cuối", why: "Người chốt phải khác người được chấm" },
  { prefix: "config.", label: "Thay đổi cấu hình", why: "Soạn ⟂ duyệt, có thể quay lui" },
  { prefix: "library.", label: "Thư viện tác vụ", why: "Nội dung chuẩn ai đưa vào" },
  { prefix: "policy.", label: "Chính sách truy cập", why: "Luật chặn quyền thay đổi khi nào" },
  { prefix: "authoring.", label: "Uỷ quyền soạn thảo", why: "Ai được cấp quyền, ai thu hồi" },
  { prefix: "ai_golden.", label: "Thước đo chất lượng AI", why: "Người duyệt ≠ người tạo tín hiệu" },
];

export default function CompliancePage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await call<MeResponse>("/me");
      setMe(m);
      if (!m.permissions?.includes("audit:read")) { setDenied(true); return; }
      setDenied(false);
      setStats(await call<Stats>("/audit-logs/stats"));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const byControl = useMemo(() => {
    const acts = stats?.actions ?? [];
    return CONTROLS.map((c) => {
      const matched = acts.filter((a) => a.action.startsWith(c.prefix));
      return { ...c, count: matched.reduce((s, a) => s + a.count, 0), actions: matched };
    });
  }, [stats]);

  const covered = byControl.filter((c) => c.count > 0).length;

  return (
    <AppShell crumb={{ section: "Kiểm toán", page: "Tuân thủ" }}>
      <div className="page-head">
        <div className="eyebrow">Compliance · độ phủ vết kiểm soát</div>
        <h1>Tuân thủ &amp; kiểm soát</h1>
        <p>Những nhóm hành động quan trọng có để lại vết hay không — kiểm chứng được, không tự chấm.</p>
      </div>

      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}
      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}

      {!loading && denied && (
        <Card>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Lock size={18} />
            <div>
              <b style={{ fontSize: 13 }}>Cần quyền kiểm toán</b>
              <p className="tiny muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
                Trang này đọc nhật ký kiểm toán nên yêu cầu <b>audit:read</b> — chỉ vai kiểm toán
                viên có. Đăng nhập <b>auditor@</b>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !denied && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className="v green numeric">{covered}/{CONTROLS.length}</div>
              <div className="l">Nhóm kiểm soát có vết</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{stats?.actions.length ?? 0}</div>
              <div className="l">Loại hành động ghi nhận</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">
                {(stats?.actions ?? []).reduce((a, x) => a + x.count, 0)}
              </div>
              <div className="l">Tổng bản ghi</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v green numeric">Bật</div>
              <div className="l">Chống sửa/xoá ở tầng DB</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <Card title={<><ShieldCheck size={16} color="var(--nhg-primary)" /> Độ phủ vết theo nhóm kiểm soát</>}
              sub="Có vết = kiểm toán viên truy được; chưa có vết = chưa có hoạt động hoặc chưa gắn ghi nhận">
              <table className="table">
                <thead><tr><th>Nhóm kiểm soát</th><th>Câu hỏi kiểm toán</th><th className="rt">Bản ghi</th><th></th></tr></thead>
                <tbody>
                  {byControl.map((c) => (
                    <tr key={c.prefix}>
                      <td><b>{c.label}</b><div className="muted tiny">{c.prefix}*</div></td>
                      <td className="tiny muted">{c.why}</td>
                      <td className="rt numeric">{c.count}</td>
                      <td>
                        <Badge tone={c.count > 0 ? "green" : "gray"}>
                          {c.count > 0 ? "có vết" : "chưa có"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><Activity size={16} color="var(--nhg-primary)" /> Hành động nhiều nhất</>}>
                {(stats?.actions ?? []).slice(0, 12).map((a) => (
                  <div key={a.action} className="row between" style={{ padding: "5px 0" }}>
                    <span className="tiny">{a.action}</span>
                    <span className="tiny numeric muted">{a.count}</span>
                  </div>
                ))}
              </Card>

              <Card title={<><Construction size={16} color="var(--nhg-text-secondary)" /> Chưa xây dựng</>}
                sub="Không tự chấm PASS/FAIL">
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.8 }}>
                  Bản trước hiển thị bảng &ldquo;kiểm tra tuân thủ&rdquo; với kết quả PASS/FAIL và
                  danh sách ngoại lệ. Hệ thống chưa có nơi khai báo bộ luật tuân thủ, nên mọi kết
                  luận PASS/FAIL đều là tự phong.
                </p>
                <hr className="hr" />
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.8 }}>
                  Muốn có: khai báo được luật kiểm soát (điều kiện + tần suất + người chịu trách
                  nhiệm), rồi chấm tự động dựa trên chính nhật ký này.
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
