import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { policies } from "@/lib/mock";
import { ShieldCheck, Plus, FileText } from "lucide-react";

export default function PolicyPage() {
  return (
    <AppShell crumb={{ section: "HR / B1", page: "Quản trị chính sách" }}>
      <div className="page-head">
        <div className="eyebrow">Quản trị chính sách · Policy Management</div>
        <h1>Chính sách &amp; governance của iPMS</h1>
        <p>Quản lý phiên bản các chính sách: phân loại dữ liệu, AI guardrails, rating/calibration, evidence, đãi ngộ.</p>
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone="green">{policies.filter((p) => p.status === "active").length} đang hiệu lực</Badge>
          <Badge tone="amber">{policies.filter((p) => p.status === "review").length} đang review</Badge>
        </div>
        <button className="btn primary sm"><Plus size={15} /> Thêm chính sách</button>
      </div>

      <Card title={<><ShieldCheck size={16} color="var(--nhg-primary)" /> Danh mục chính sách</>} sub="Chủ quản · phiên bản · trạng thái — mọi thay đổi có audit">
        <table className="table">
          <thead><tr><th>Chính sách</th><th>Chủ quản</th><th>Phiên bản</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.name}>
                <td><span className="row" style={{ gap: 8 }}><FileText size={15} color="var(--nhg-text-tertiary)" /> <b>{p.name}</b></span></td>
                <td><Badge tone="gray">{p.owner}</Badge></td>
                <td className="numeric muted">{p.version}</td>
                <td><Badge tone={p.status === "active" ? "green" : "amber"}>{p.status === "active" ? "Hiệu lực" : "Đang review"}</Badge></td>
                <td className="rt"><button className="btn ghost sm">Mở</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="section-gap">
        <div className="row" style={{ gap: 8 }}>
          <ShieldCheck size={16} color="var(--nhg-primary)" />
          <span className="tiny muted">Theo Strategic Context: <b>data classification</b> (Public/Internal/Confidential/Restricted) + <b>AI guardrails</b> + <b>human-in-the-loop</b> là bắt buộc cho mọi nền tảng NHG.</span>
        </div>
      </Card>
    </AppShell>
  );
}
