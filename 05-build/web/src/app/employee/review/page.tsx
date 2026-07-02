import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { myReview } from "@/lib/mock";
import { FileCheck, ShieldCheck, Rocket, MessageSquareWarning, ThumbsUp, AlertTriangle } from "lucide-react";

const statusMap: Record<string, { tone: string; label: string }> = {
  self_done: { tone: "amber", label: "Chờ quản lý đánh giá" },
  manager_done: { tone: "info", label: "Quản lý đã đánh giá" },
  final: { tone: "green", label: "Đã chốt" },
};

export default function MyReviewPage() {
  const r = myReview;
  const s = statusMap[r.status];
  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Đánh giá của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">My Review · {r.cycle}</div>
        <h1>Đánh giá hiệu suất của tôi</h1>
        <p>Minh bạch: bạn thấy đúng những gì quản lý &amp; hệ thống đánh giá — kèm bằng chứng và kế hoạch phát triển.</p>
      </div>

      <div className="grid g4">
        <Card><div className="stat"><div className="v green numeric">{r.finalScore}</div><div className="l">Điểm tổng (1–100)</div></div></Card>
        <Card><div className="stat"><div className="v numeric">{r.ipc}</div><div className="l">Hạng IPC</div></div></Card>
        <Card><div className="stat"><div className="v numeric">2/5</div><div className="l">KPI đạt mục tiêu</div></div></Card>
        <Card><div className="row" style={{ height: "100%", alignItems: "center" }}><Badge tone={s.tone}>{s.label}</Badge></div></Card>
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="grid" style={{ gap: 16 }}>
          <Card title={<><FileCheck size={16} color="var(--nhg-primary)" /> Bảng điểm theo KPI</>} sub="Có bằng chứng — bấm để xem evidence">
            <table className="table">
              <thead><tr><th>KPI</th><th className="rt">Tỷ trọng</th><th className="rt">Đạt</th><th className="rt">Điểm</th></tr></thead>
              <tbody>
                {r.items.map((it) => (
                  <tr key={it.kpi}>
                    <td><b>{it.kpi}</b></td>
                    <td className="rt numeric">{it.weight}%</td>
                    <td className="rt numeric">{it.pct}%</td>
                    <td className="rt numeric"><b>{it.raw}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Tự đánh giá (self review)" sub="Phần bạn tự nhận xét">
            <textarea
              defaultValue={r.selfReflection}
              rows={4}
              style={{ width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: 12,
                borderRadius: 10, border: "1px solid var(--nhg-border-default)",
                background: "var(--nhg-bg-canvas)", color: "var(--nhg-text-primary)", resize: "vertical" }}
            />
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="muted tiny">Cập nhật lần cuối: 22/07/2026</span>
              <button className="btn ghost sm">Lưu</button>
            </div>
          </Card>

          <Card title="Nhận xét của quản lý" sub="Chỉ đọc">
            <div className="ai-draft" style={{ margin: 0 }}>{r.managerAssessment}</div>
            <div className="grid g2" style={{ marginTop: 12 }}>
              <div>
                <div className="card-sub" style={{ marginBottom: 6 }}>Điểm mạnh</div>
                {r.strengths.map((x, i) => (
                  <div key={i} className="row" style={{ gap: 7, marginBottom: 5, fontSize: 12.5 }}>
                    <ThumbsUp size={14} color="var(--nhg-primary)" /> <span>{x}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="card-sub" style={{ marginBottom: 6 }}>Cần cải thiện</div>
                {r.gaps.map((x, i) => (
                  <div key={i} className="row" style={{ gap: 7, marginBottom: 5, fontSize: 12.5 }}>
                    <AlertTriangle size={14} color="var(--nhg-warning)" /> <span>{x}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <Card title={<><Rocket size={16} color="var(--nhg-primary)" /> Kế hoạch phát triển</>} sub="Mỗi gap → hành động phát triển (nối iLMS)">
            <p className="tiny muted" style={{ marginBottom: 12 }}>
              2 skill gap được phát hiện từ review này đã chuyển thành kế hoạch học tập 30-60-90.
            </p>
            <Link className="btn primary sm" href="/employee/development"><Rocket size={15} /> Xem kế hoạch phát triển</Link>
          </Card>

          <Card title="Giải trình / khiếu nại" sub="Quyền của bạn — minh bạch & có audit">
            <p className="tiny muted" style={{ marginBottom: 10 }}>
              Nếu bạn chưa đồng thuận với đánh giá, có thể mở yêu cầu giải trình. Mọi trao đổi được ghi nhận.
            </p>
            <button className="btn ghost sm"><MessageSquareWarning size={15} /> Mở giải trình</button>
          </Card>

          <Card>
            <div className="row" style={{ gap: 8 }}>
              <ShieldCheck size={16} color="var(--nhg-primary)" />
              <span className="tiny muted">Rating cuối do <b>người</b> chốt &amp; phê duyệt. AI chỉ hỗ trợ soạn nháp.</span>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
