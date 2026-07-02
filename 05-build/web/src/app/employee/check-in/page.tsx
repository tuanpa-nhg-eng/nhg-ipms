import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { myCheckin } from "@/lib/mock";
import { CalendarCheck, Check, AlertCircle, Sparkles } from "lucide-react";

export default function MyCheckinPage() {
  const c = myCheckin;
  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Cập nhật tiến độ" }}>
      <div className="page-head">
        <div className="eyebrow">Cập nhật tiến độ · Continuous Check-in</div>
        <h1>Check-in {c.period}</h1>
        <p>Trao đổi tiến độ định kỳ thay vì chờ cuối năm — cập nhật goal, nêu blocker, đính kèm bằng chứng.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <Card title={<><CalendarCheck size={16} color="var(--nhg-primary)" /> Cập nhật mục tiêu</>} sub="Tiến độ từng goal trong kỳ này">
          {c.goals.map((g) => (
            <div key={g.name} style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 5 }}>
                <b style={{ fontSize: 13 }}>{g.name}</b>
                <span className="tiny numeric muted">{g.progress}%</span>
              </div>
              <Progress value={g.progress} tone={g.progress < 80 ? "warn" : undefined} />
              <input
                defaultValue={g.note}
                placeholder="Ghi chú tiến độ…"
                style={{ width: "100%", marginTop: 8, fontFamily: "inherit", fontSize: 12.5, padding: "8px 11px",
                  borderRadius: 9, border: "1px solid var(--nhg-border-default)",
                  background: "var(--nhg-bg-canvas)", color: "var(--nhg-text-primary)" }}
              />
            </div>
          ))}
          <hr className="hr" />
          <div className="card-sub" style={{ marginBottom: 6 }}>Blocker / điểm nghẽn</div>
          <div className="ai-flag" style={{ marginBottom: 12 }}><AlertCircle size={15} /><span>{c.blocker}</span></div>
          <button className="btn primary sm"><Check size={15} /> Nộp check-in {c.period}</button>
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          <div className="ai-panel">
            <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Check-in Assistant</b>
              <span className="ai-chip" style={{ marginLeft: "auto" }}>AI</span></div>
            <div className="ai-draft">
              Goal “Data hygiene CRM” chậm 2 kỳ liên tiếp — gợi ý nêu rõ blocker dữ liệu IT trong check-in
              để quản lý hỗ trợ escalate.
            </div>
          </div>
          <Card title="Lịch sử check-in" sub="Các kỳ gần đây">
            <table className="table">
              <thead><tr><th>Kỳ</th><th>Trạng thái</th><th className="rt">On-track</th></tr></thead>
              <tbody>
                {c.history.map((h) => (
                  <tr key={h.period}>
                    <td>{h.period}</td>
                    <td><Badge tone="info">{h.status}</Badge></td>
                    <td className="rt numeric">{h.on}/{h.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
