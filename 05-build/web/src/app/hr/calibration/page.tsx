import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { ratingDist, calibrationOutliers } from "@/lib/mock";
import { Scale, Sparkles, TriangleAlert, Check, ShieldCheck } from "lucide-react";

const sevMap: Record<string, { tone: string; label: string }> = {
  high: { tone: "red", label: "Ưu tiên" },
  med: { tone: "amber", label: "Theo dõi" },
  ok: { tone: "green", label: "Nhất quán" },
};
const barColor = ["#037236", "#0A8040", "#1D6FB8", "#B7791F", "#ED2024"];

export default function CalibrationPage() {
  const total = ratingDist.reduce((a, r) => a + r.count, 0);
  return (
    <AppShell crumb={{ section: "HR / B1", page: "Phòng cân chỉnh đánh giá" }}>
      <div className="page-head">
        <div className="eyebrow">Phòng cân chỉnh đánh giá · Calibration · Quý 3/2026 · Khối Đại học</div>
        <h1>Hiệu chỉnh công bằng &amp; nhất quán</h1>
        <p>So sánh phân phối rating cross-BU, phát hiện outlier/bias. Mọi thay đổi rating bắt buộc rationale + audit.</p>
      </div>

      <div className="grid g2">
        <Card title={<><Scale size={16} color="var(--nhg-primary)" /> Phân phối rating</>} sub={`${total} nhân sự · trước calibration`}>
          {ratingDist.map((r, i) => (
            <div key={r.grade} style={{ marginBottom: 10 }}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <span className="tiny"><b>{r.grade}</b> <span className="muted">· {r.count} người</span></span>
                <span className="tiny numeric muted">{r.pct}%</span>
              </div>
              <div className="progress"><span style={{ width: `${r.pct}%`, background: barColor[i] }} /></div>
            </div>
          ))}
          <hr className="hr" />
          <div className="ai-flag"><TriangleAlert size={15} /><span>Tỷ lệ A+/A = 36% — cao hơn ngưỡng khuyến nghị 30%, cân nhắc rà soát inflation.</span></div>
        </Card>

        <div className="ai-panel">
          <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Calibration Assistant</b>
            <span className="ai-chip" style={{ marginLeft: "auto" }}>AI · không chốt rating</span></div>
          <div className="ai-draft">
            Chuẩn bị calibration pack: <b>3 outlier</b> cần thảo luận, 1 manager có pattern chấm thấp (deflation),
            2 review thiếu evidence cho rating đề xuất. Gợi ý câu hỏi đính kèm từng case bên dưới.
          </div>
          <div className="card-sub">Câu hỏi gợi ý cho hội đồng</div>
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}><span>“Evidence nào chứng minh mức A+ cho trường hợp Đỗ Hải Yến?”</span></div>
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}><span>“Manager B chấm thấp đồng loạt — do tiêu chí hay do kỳ vọng?”</span></div>
        </div>
      </div>

      <Card className="section-gap" title="Outlier &amp; bias cần hiệu chỉnh" sub="AI flag — quyết định thuộc hội đồng calibration">
        <table className="table">
          <thead><tr><th>Nhân sự</th><th>BU</th><th>Manager</th><th>Đề xuất</th><th>Mức</th><th>Cảnh báo</th><th></th></tr></thead>
          <tbody>
            {calibrationOutliers.map((o) => (
              <tr key={o.person}>
                <td><b>{o.person}</b></td>
                <td><Badge tone="gray">{o.bu}</Badge></td>
                <td className="muted">{o.mgr}</td>
                <td><Badge tone={o.proposed.startsWith("A") ? "green" : o.proposed === "C" || o.proposed === "D" ? "red" : "info"}>{o.proposed}</Badge></td>
                <td><Badge tone={sevMap[o.sev].tone}>{sevMap[o.sev].label}</Badge></td>
                <td className="muted tiny">{o.flag}</td>
                <td className="rt"><button className="btn ghost sm">Mở review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="hr" />
        <div className="row between">
          <span className="muted tiny"><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Đổi rating yêu cầu nhập <b>rationale</b> — ghi audit + version.</span>
          <button className="btn primary sm"><Check size={15} /> Chốt phiên calibration</button>
        </div>
      </Card>
    </AppShell>
  );
}
