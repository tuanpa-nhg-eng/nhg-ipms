import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { teamCheckins } from "@/lib/mock";
import { Users, Sparkles, MessageSquare } from "lucide-react";

const statusMap: Record<string, { tone: string; label: string }> = {
  submitted: { tone: "green", label: "Đã nộp" },
  reviewed: { tone: "info", label: "Đã review" },
  open: { tone: "amber", label: "Chưa nộp" },
};
const loadMap: Record<string, { tone: string; label: string }> = {
  low: { tone: "gray", label: "Tải thấp" },
  ok: { tone: "green", label: "Cân bằng" },
  high: { tone: "red", label: "Quá tải" },
};

export default function TeamPage() {
  const submitted = teamCheckins.filter((t) => t.status !== "open").length;
  const overloaded = teamCheckins.filter((t) => t.load === "high").length;
  return (
    <AppShell crumb={{ section: "Quản lý", page: "Team Check-in" }}>
      <div className="page-head">
        <div className="eyebrow">Team Check-in · Tháng 7/2026</div>
        <h1>Check-in &amp; sức tải đội ngũ</h1>
        <p>Nhịp liên tục thay vì chấm cuối năm — tách “bận” khỏi “tạo giá trị”, phát hiện quá tải sớm.</p>
      </div>

      <div className="grid g4">
        <Card><div className="stat"><div className="v green numeric">{submitted}/{teamCheckins.length}</div><div className="l">Đã nộp check-in</div></div></Card>
        <Card><div className="stat"><div className="v numeric">{teamCheckins.reduce((a, t) => a + t.onTrack, 0)}</div><div className="l">Goal đúng tiến độ</div></div></Card>
        <Card><div className="stat"><div className="v red numeric">{overloaded}</div><div className="l">Nhân sự quá tải</div></div></Card>
        <Card><div className="stat"><div className="v numeric">3</div><div className="l">Blocker đang mở</div></div></Card>
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
        <Card title={<><Users size={16} color="var(--nhg-primary)" /> Bảng check-in đội</>} sub="Trạng thái nộp · goal on-track · blocker · sức tải (heatmap)">
          <table className="table">
            <thead>
              <tr><th>Thành viên</th><th>Check-in</th><th style={{ width: 150 }}>On-track</th><th>Sức tải</th><th>Blocker</th></tr>
            </thead>
            <tbody>
              {teamCheckins.map((m) => (
                <tr key={m.name}>
                  <td><b>{m.name}</b><div className="muted tiny">{m.role}</div></td>
                  <td><Badge tone={statusMap[m.status].tone}>{statusMap[m.status].label}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><Progress value={(m.onTrack / m.goals) * 100} tone={m.onTrack / m.goals < 0.5 ? "danger" : m.onTrack / m.goals < 0.8 ? "warn" : undefined} /></div>
                      <span className="tiny numeric muted">{m.onTrack}/{m.goals}</span>
                    </div>
                  </td>
                  <td><Badge tone={loadMap[m.load].tone}>{loadMap[m.load].label}</Badge></td>
                  <td className="muted tiny">{m.blocker || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="ai-panel">
          <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Check-in Assistant</b>
            <span className="ai-chip" style={{ marginLeft: "auto" }}>AI</span></div>
          <p className="tiny muted" style={{ marginBottom: 10 }}>Tóm tắt &amp; gợi câu hỏi coaching — người quyết định.</p>
          <div className="ai-draft">
            <b>Cảnh báo tải:</b> Lê Thu Hà &amp; Phạm Quốc Anh đang quá tải (2 chiến dịch / chờ ngân sách).
            Blocker “phụ thuộc phê duyệt” lặp lại 2 tuần — nên escalate.
          </div>
          <div className="card-sub">Gợi ý câu hỏi 1:1</div>
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <MessageSquare size={15} /><span>“Việc nào có thể hoãn/uỷ quyền để giảm tải tuần này?”</span>
          </div>
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <MessageSquare size={15} /><span>“Anh cần tôi hỗ trợ gì để gỡ blocker ngân sách?”</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
