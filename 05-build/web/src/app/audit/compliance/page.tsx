import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { complianceStats, complianceChecks, complianceExceptions } from "@/lib/mock";
import { ShieldCheck, TriangleAlert, Check } from "lucide-react";

const sev: Record<string, { tone: string; label: string }> = {
  high: { tone: "red", label: "Ưu tiên" }, med: { tone: "amber", label: "Theo dõi" }, low: { tone: "gray", label: "Thấp" },
};

export default function CompliancePage() {
  return (
    <AppShell crumb={{ section: "Kiểm toán / BOC", page: "Tuân thủ" }}>
      <div className="page-head">
        <div className="eyebrow">Tuân thủ · Compliance Dashboard</div>
        <h1>Tuân thủ &amp; governance iPMS</h1>
        <p>Theo dõi các quy tắc bất biến: rating có evidence, output AI gắn nhãn, quyết định có người duyệt, audit đầy đủ.</p>
      </div>

      <div className="grid g4">
        {complianceStats.map((s) => (
          <Card key={s.l}><div className="stat"><div className={`v ${s.tone} numeric`}>{s.v}</div><div className="l">{s.l}</div></div></Card>
        ))}
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card title={<><ShieldCheck size={16} color="var(--nhg-primary)" /> Checklist governance</>} sub="Tỷ lệ tuân thủ từng quy tắc (mục tiêu 100%)">
          {complianceChecks.map((c) => (
            <div key={c.item} style={{ marginBottom: 12 }}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <span className="tiny">{c.pass >= c.target ? <Check size={13} color="var(--nhg-success)" style={{ verticalAlign: "-2px" }} /> : <TriangleAlert size={13} color="var(--nhg-warning)" style={{ verticalAlign: "-2px" }} />} {c.item}</span>
                <span className="tiny numeric muted">{c.pass}%</span>
              </div>
              <Progress value={c.pass} tone={c.pass < c.target ? "warn" : undefined} />
            </div>
          ))}
        </Card>

        <Card title={<><TriangleAlert size={16} color="var(--nhg-danger)" /> Ngoại lệ cần xử lý</>} sub="Governance exception — chủ trì &amp; hạn">
          <table className="table">
            <thead><tr><th>Vụ việc</th><th>Mức</th><th>Hạn</th></tr></thead>
            <tbody>
              {complianceExceptions.map((e, i) => (
                <tr key={i}>
                  <td>{e.case}<div className="muted tiny">Chủ trì: {e.owner}</div></td>
                  <td><Badge tone={sev[e.sev].tone}>{sev[e.sev].label}</Badge></td>
                  <td className="numeric">{e.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ai-flag section-gap"><TriangleAlert size={15} /><span>2 review thiếu evidence — chặn finalize cho tới khi bổ sung.</span></div>
        </Card>
      </div>

      <Card className="section-gap">
        <span className="tiny muted"><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Phù hợp <b>Bộ luật Lao động 2019</b> (tiêu chí + bằng chứng + lịch sử phản hồi) &amp; <b>NIST AI RMF</b> (trustworthiness). Nguồn cho BOC / B5.</span>
      </Card>
    </AppShell>
  );
}
