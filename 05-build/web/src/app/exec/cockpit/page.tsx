import { AppShell } from "@/components/shell/AppShell";
import { Card, Stat, Badge, Progress, statusTone, statusLabel } from "@/components/ui";
import { execStats, opcoScores, goalsAtRisk } from "@/lib/mock";
import { Sparkles, TriangleAlert, ArrowUpRight } from "lucide-react";

export default function CockpitPage() {
  return (
    <AppShell crumb={{ section: "Điều hành", page: "Tổng quan điều hành" }}>
      <div className="page-head">
        <div className="eyebrow">Tổng quan điều hành · Group Performance Cockpit</div>
        <h1>Tổng quan thực thi chiến lược — H.01</h1>
        <p>Một màn hình trả lời: chiến lược đang được thực thi hay chỉ báo cáo? · Quý 3/2026</p>
      </div>

      <div className="grid g4">
        {execStats.map((s) => (
          <Stat key={s.l} value={s.v} label={s.l} delta={s.d} dir={s.dir} tone={s.tone} />
        ))}
      </div>

      <div className="grid g2 section-gap">
        <Card title="OpCo Scorecard" sub="Điểm hiệu suất & check-in compliance theo đơn vị">
          <table className="table">
            <thead>
              <tr><th>Đơn vị</th><th className="rt">Điểm</th><th>Trạng thái</th><th className="rt">Check-in</th></tr>
            </thead>
            <tbody>
              {opcoScores.map((o) => (
                <tr key={o.code}>
                  <td><b>{o.code}</b> <span className="muted tiny">{o.name}</span></td>
                  <td className="rt numeric"><b>{o.score}</b></td>
                  <td><Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge></td>
                  <td className="rt numeric">{o.checkin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          className="ai-panel"
          title={<><Sparkles size={16} color="#6D28A8" /> <span style={{ color: "#6D28A8" }}>Executive Briefing</span> <span className="ai-chip">AI · cần người duyệt</span></>}
          sub="Tóm tắt do Executive Briefing Agent — không thay quyết định"
        >
          <div className="ai-draft">
            Tuần này có <b>3 goal mới rơi vào nhóm at-risk</b>, tập trung ở khối K-12 (retention giáo viên)
            và Y tế (NPS bệnh nhân). Tỷ lệ chuyển đổi tuyển sinh UNI dưới ngưỡng 2 tuần liên tục — tác động
            trực tiếp doanh thu. Đề xuất đưa <b>3 quyết định</b> vào họp điều hành: (1) hỗ trợ retention K-12,
            (2) review phễu tuyển sinh UNI, (3) phê duyệt thêm nguồn lực data hygiene CRM.
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary sm">Chấp nhận đưa vào agenda</button>
            <button className="btn ghost sm">Chỉnh sửa</button>
          </div>
        </Card>
      </div>

      <div className="card section-gap" id="risk">
        <div className="card-title"><TriangleAlert size={16} color="var(--nhg-danger)" /> Goal-at-Risk Dashboard</div>
        <div className="card-sub">Goal lệch chuẩn cần xử lý trong 30 ngày — phát hiện sớm theo BU</div>
        <table className="table">
          <thead>
            <tr><th>Mục tiêu</th><th>Chủ trì</th><th>BU</th><th style={{ width: 160 }}>Health</th><th>Hạn</th><th>Lý do</th></tr>
          </thead>
          <tbody>
            {goalsAtRisk.map((g) => (
              <tr key={g.name}>
                <td><b>{g.name}</b></td>
                <td className="muted">{g.owner}</td>
                <td><Badge tone="gray">{g.bu}</Badge></td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <div style={{ flex: 1 }}><Progress value={g.health} tone={g.health < 50 ? "danger" : "warn"} /></div>
                    <span className="tiny numeric muted">{g.health}</span>
                  </div>
                </td>
                <td className="numeric">{g.due}</td>
                <td className="muted tiny">{g.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="hr" />
        <a className="row tiny" style={{ color: "var(--nhg-primary)", fontWeight: 600 }} href="#">
          Xem toàn bộ governance exception <ArrowUpRight size={14} />
        </a>
      </div>
    </AppShell>
  );
}
