import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { talentStats, flightRisks, successionGaps } from "@/lib/mock";
import { UserCog, Sparkles, Grid3x3 } from "lucide-react";

const sg: Record<string, { tone: string; label: string }> = {
  on: { tone: "green", label: "Đủ" }, watch: { tone: "amber", label: "Mỏng" }, off: { tone: "red", label: "Thiếu" },
};

export default function TalentPage() {
  return (
    <AppShell crumb={{ section: "Điều hành", page: "Rủi ro nhân tài" }}>
      <div className="page-head">
        <div className="eyebrow">Rủi ro nhân tài · Talent Intelligence</div>
        <h1>Nhân tài &amp; rủi ro con người</h1>
        <p>Phát hiện sớm: ai giỏi sắp nghỉ, vị trí chủ chốt thiếu người kế nhiệm. AI gợi ý — người quyết định.</p>
      </div>

      <div className="grid g4">
        {talentStats.map((s) => (
          <Card key={s.l}><div className="stat"><div className={`v ${s.tone} numeric`}>{s.v}</div><div className="l">{s.l}</div></div></Card>
        ))}
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card title={<><UserCog size={16} color="var(--nhg-danger)" /> Flight risk — rủi ro nghỉ việc</>} sub="Nhân sự giỏi có nguy cơ rời đi — cần hành động giữ chân">
          <table className="table">
            <thead><tr><th>Nhân sự</th><th style={{ width: 130 }}>Mức rủi ro</th><th>Lý do</th><th>Hành động đề xuất</th></tr></thead>
            <tbody>
              {flightRisks.map((f) => (
                <tr key={f.person}>
                  <td><b>{f.person}</b><div className="muted tiny">{f.role}</div></td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><Progress value={f.risk} tone={f.risk >= 70 ? "danger" : "warn"} /></div>
                      <span className="tiny numeric muted">{f.risk}</span>
                    </div>
                  </td>
                  <td className="muted tiny">{f.why}</td>
                  <td className="tiny">{f.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ai-flag section-gap" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <Sparkles size={15} /><span>Talent Risk Agent: 3 high performer cùng nhóm Tuyển sinh có tín hiệu rủi ro — kiểm tra chính sách đãi ngộ nhóm này.</span>
          </div>
        </Card>

        <Card title="Khoảng trống kế nhiệm" sub="Vị trí chủ chốt & độ sẵn sàng">
          <table className="table">
            <thead><tr><th>Vị trí</th><th className="rt">Now</th><th className="rt">1 năm</th><th>Tình trạng</th></tr></thead>
            <tbody>
              {successionGaps.map((g) => (
                <tr key={g.role}>
                  <td>{g.role}</td>
                  <td className="rt numeric">{g.readyNow}</td>
                  <td className="rt numeric">{g.ready1y}</td>
                  <td><Badge tone={sg[g.status].tone}>{sg[g.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link className="btn ghost sm section-gap" href="/hr/talent-matrix"><Grid3x3 size={15} /> Xem ma trận nhân tài 9-box</Link>
        </Card>
      </div>
    </AppShell>
  );
}
