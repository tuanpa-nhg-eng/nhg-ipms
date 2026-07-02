import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress, statusTone, statusLabel } from "@/components/ui";
import { myGoals, myEvidence } from "@/lib/mock";
import { Target, Paperclip, Sparkles, Check } from "lucide-react";

export default function MyGoalsPage() {
  const totalWeight = myGoals.reduce((a, g) => a + g.weight, 0);
  const weighted = myGoals.reduce((a, g) => a + (g.pct / 100) * (g.weight / 100) * 100, 0);

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Mục tiêu của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">My Goals · Quý 3/2026</div>
        <h1>Mục tiêu &amp; Bằng chứng của tôi</h1>
        <p>Hiểu rõ mình được đánh giá thế nào — mỗi KPI gắn nguồn dữ liệu &amp; bằng chứng.</p>
      </div>

      <div className="grid g4">
        <Card><div className="stat"><div className="v green numeric">{Math.round(weighted)}</div><div className="l">Điểm tạm tính (1–100)</div></div></Card>
        <Card><div className="stat"><div className="v numeric">{totalWeight}%</div><div className="l">Tổng tỷ trọng scorecard</div></div></Card>
        <Card><div className="stat"><div className="v green numeric">2/5</div><div className="l">KPI đã đạt mục tiêu</div></div></Card>
        <Card><div className="stat"><div className="v numeric">A</div><div className="l">Hạng IPC dự kiến</div></div></Card>
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <Card title={<><Target size={16} color="var(--nhg-primary)" /> Cây mục tiêu cá nhân</>} sub="KPI gắn Task Cell · nguồn System hoặc Manual">
          <table className="table">
            <thead>
              <tr><th>Mục tiêu / KPI</th><th>Nguồn</th><th className="rt">Mục tiêu</th><th className="rt">Thực tế</th><th style={{ width: 140 }}>Đạt</th><th className="rt">Tỷ trọng</th></tr>
            </thead>
            <tbody>
              {myGoals.map((g) => (
                <tr key={g.name}>
                  <td>
                    <b>{g.name}</b>
                    <div className="muted tiny">{g.kpi} · <Badge tone={statusTone(g.status)}>{statusLabel(g.status)}</Badge></div>
                  </td>
                  <td><Badge tone={g.method === "system" ? "info" : "gray"}>{g.method === "system" ? "System" : "Manual"}</Badge></td>
                  <td className="rt numeric">{g.target}</td>
                  <td className="rt numeric"><b>{g.actual}</b></td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><Progress value={g.pct} tone={g.pct < 70 ? "danger" : g.pct < 90 ? "warn" : undefined} /></div>
                      <span className="tiny numeric muted">{g.pct}%</span>
                    </div>
                  </td>
                  <td className="rt numeric">{g.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={<><Paperclip size={16} color="var(--nhg-primary)" /> Evidence Timeline</>} sub="Bằng chứng có nguồn + timestamp + trạng thái xác minh">
          <div className="timeline">
            {myEvidence.map((e, i) => (
              <div key={i} className={`tl-item${e.ai ? " ai" : ""}`}>
                <div className="t">{e.t}</div>
                <div className="m">{e.m}</div>
              </div>
            ))}
          </div>
          <hr className="hr" />
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <Sparkles size={15} />
            <span>Evidence Collector đề xuất gắn 38 bằng chứng — <a href="#" style={{ fontWeight: 700 }}>xem &amp; duyệt</a></span>
          </div>
          <button className="btn primary sm" style={{ marginTop: 8 }}><Check size={15} /> Nộp check-in tháng 7</button>
        </Card>
      </div>
    </AppShell>
  );
}
