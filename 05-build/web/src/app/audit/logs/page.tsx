import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { auditLogs } from "@/lib/mock";
import { ScrollText, ShieldCheck, Sparkles, Download } from "lucide-react";

const actionTone: Record<string, string> = {
  "rating.approve": "green", "kpi.update": "amber", "goal.update": "amber",
  "evidence.verify": "info", "export.payroll": "red", "ai.suggest": "ai",
};

export default function AuditPage() {
  const aiCount = auditLogs.filter((l) => l.ai).length;
  return (
    <AppShell crumb={{ section: "Kiểm toán / BOC", page: "Audit Log" }}>
      <div className="page-head">
        <div className="eyebrow">Governance · Audit Trail</div>
        <h1>Audit Log — bất biến, truy vết đầy đủ</h1>
        <p>Mọi thay đổi KPI/goal/rating/evidence + mọi output AI đều được ghi log (append-only) cho BOC/B5.</p>
      </div>

      <div className="grid g4">
        <Card><div className="stat"><div className="v numeric">{auditLogs.length}</div><div className="l">Sự kiện hôm nay</div></div></Card>
        <Card><div className="stat"><div className="v numeric" style={{ color: "#6D28A8" }}>{aiCount}</div><div className="l">Hành động AI (gắn nhãn)</div></div></Card>
        <Card><div className="stat"><div className="v green numeric">100%</div><div className="l">Quyết định có người duyệt</div></div></Card>
        <Card><div className="stat"><div className="v numeric">1</div><div className="l">Export dữ liệu (kiểm soát)</div></div></Card>
      </div>

      <Card className="section-gap"
        title={<><ScrollText size={16} color="var(--nhg-primary)" /> Nhật ký kiểm toán</>}
        sub="append-only · không sửa/xoá · partition theo tháng">
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="gray">Tất cả</Badge><Badge tone="ai">AI</Badge><Badge tone="green">Phê duyệt</Badge><Badge tone="red">Export</Badge>
          </div>
          <button className="btn ghost sm"><Download size={14} /> Xuất cho BOC</button>
        </div>
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Chủ thể</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
          <tbody>
            {auditLogs.map((l, i) => (
              <tr key={i}>
                <td className="numeric muted tiny">{l.at}</td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    {l.ai && <Sparkles size={13} color="#6D28A8" />}
                    <b>{l.actor}</b>
                  </span>
                </td>
                <td><Badge tone={actionTone[l.action] ?? "gray"}>{l.action}</Badge></td>
                <td className="muted">{l.entity}</td>
                <td className="muted tiny">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="hr" />
        <span className="muted tiny"><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Nguồn tin cậy cho compliance &amp; Bộ luật Lao động 2019: tiêu chí + bằng chứng + lịch sử phản hồi.</span>
      </Card>
    </AppShell>
  );
}
