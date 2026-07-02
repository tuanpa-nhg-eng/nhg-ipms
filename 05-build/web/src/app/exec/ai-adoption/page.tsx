import { AppShell } from "@/components/shell/AppShell";
import { Card, Stat, Badge, Progress } from "@/components/ui";
import { aiAdoptionStats, aiByDept, aiUseCases } from "@/lib/mock";
import { Bot, Sparkles } from "lucide-react";

export default function AiAdoptionPage() {
  return (
    <AppShell crumb={{ section: "Điều hành", page: "Ứng dụng AI" }}>
      <div className="page-head">
        <div className="eyebrow">Ứng dụng AI · AI Adoption Analytics</div>
        <h1>AI có đang tạo giá trị thật?</h1>
        <p>Đo đòn bẩy AI: tỷ lệ tác vụ có AI, giờ tiết kiệm, chất lượng đầu ra, tuân thủ governance.</p>
      </div>

      <div className="grid g4">
        {aiAdoptionStats.map((s) => (
          <Stat key={s.l} value={s.v} label={s.l} delta={s.d} dir={s.dir} tone={s.tone} />
        ))}
      </div>

      <div className="grid g2 section-gap">
        <Card title={<><Bot size={16} color="var(--nhg-primary)" /> Ứng dụng AI theo phòng</>} sub="AI-assisted ratio · giờ tiết kiệm · tuân thủ chính sách">
          <table className="table">
            <thead><tr><th>Phòng</th><th style={{ width: 150 }}>AI ratio</th><th className="rt">Giờ/tháng</th><th className="rt">Tuân thủ</th></tr></thead>
            <tbody>
              {aiByDept.map((d) => (
                <tr key={d.dept}>
                  <td><b>{d.dept}</b></td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><Progress value={d.ratio} tone={d.ratio < 30 ? "warn" : undefined} /></div>
                      <span className="tiny numeric muted">{d.ratio}%</span>
                    </div>
                  </td>
                  <td className="rt numeric">{d.hours}</td>
                  <td className="rt numeric">{d.compliance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Use case AI có tác động" sub="Đã duyệt / pilot · giờ tiết kiệm ước tính">
          <table className="table">
            <thead><tr><th>Use case</th><th>Tác động</th><th className="rt">Giờ/th</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {aiUseCases.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td><Badge tone={u.impact === "Cao" ? "green" : "gray"}>{u.impact}</Badge></td>
                  <td className="rt numeric">{u.hours}</td>
                  <td><Badge tone={u.status === "approved" ? "green" : "amber"}>{u.status === "approved" ? "Đã duyệt" : "Pilot"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ai-flag section-gap" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <Sparkles size={15} /><span>AI Adoption Agent: phòng Học thuật có AI ratio thấp (22%) — đề xuất 2 use case mẫu để nhân rộng.</span>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
