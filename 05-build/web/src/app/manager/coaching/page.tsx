import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { coachingNotes } from "@/lib/mock";
import { MessageSquareText, Sparkles, Plus, CalendarClock } from "lucide-react";

export default function CoachingPage() {
  return (
    <AppShell crumb={{ section: "Quản lý", page: "Ghi chú coaching" }}>
      <div className="page-head">
        <div className="eyebrow">Ghi chú coaching · Coaching Notes</div>
        <h1>Coaching &amp; phát triển đội ngũ</h1>
        <p>Ghi lại các buổi 1:1, chủ đề, cam kết &amp; lịch theo dõi — biến quản lý thành coaching liên tục.</p>
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone="green">{coachingNotes.length} ghi chú tháng này</Badge>
          <Badge tone="amber">2 follow-up sắp tới</Badge>
        </div>
        <button className="btn primary sm"><Plus size={15} /> Ghi chú mới</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card title={<><MessageSquareText size={16} color="var(--nhg-primary)" /> Nhật ký coaching</>} sub="Theo từng thành viên">
          <div className="timeline">
            {coachingNotes.map((n, i) => (
              <div key={i} className="tl-item">
                <div className="row between">
                  <div className="t">{n.person} — <span style={{ color: "var(--nhg-primary)" }}>{n.topic}</span></div>
                  <span className="tiny numeric muted">{n.date}</span>
                </div>
                <div className="m" style={{ marginBottom: 4 }}>{n.note}</div>
                <span className="badge gray"><CalendarClock size={12} /> Follow-up: {n.followup}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="ai-panel">
          <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Coaching Agent</b>
            <span className="ai-chip" style={{ marginLeft: "auto" }}>AI · gợi ý</span></div>
          <p className="tiny muted" style={{ marginBottom: 10 }}>Gợi ý câu hỏi &amp; hành động — quyết định thuộc quản lý.</p>
          <div className="card-sub">Gợi ý cho buổi 1:1 với Lê Thu Hà</div>
          <div className="ai-draft">“Tuần này việc nào làm em mất nhiều năng lượng nhất? Ta có thể bỏ/uỷ quyền việc nào?”</div>
          <div className="card-sub">Theo dõi cam kết</div>
          <div className="ai-flag" style={{ background: "rgba(109,40,168,.1)", color: "#6D28A8" }}>
            <CalendarClock size={15} /><span>Follow-up với Phạm Quốc Anh đến hạn hôm nay (blocker ngân sách).</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
