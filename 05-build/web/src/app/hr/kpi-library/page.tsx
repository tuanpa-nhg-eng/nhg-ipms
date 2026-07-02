import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { kpiCategories, scoreTiers } from "@/lib/mock";
import { BookMarked, Check, Plus, Sparkles } from "lucide-react";

export default function KpiLibraryPage() {
  const totalWeight = kpiCategories.reduce((a, c) => a + c.weight, 0);
  return (
    <AppShell crumb={{ section: "HR / B1", page: "Thư viện KPI" }}>
      <div className="page-head">
        <div className="eyebrow">KPI &amp; Scorecard Library</div>
        <h1>Scorecard — Chuyên viên Tuyển sinh</h1>
        <p>KPI Dictionary cha–con · tỷ trọng theo nhóm · bậc thang điểm cấu hình được (logic lõi §8).</p>
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={totalWeight === 100 ? "green" : "red"}>
            {totalWeight === 100 ? <Check size={12} /> : null} Tổng tỷ trọng: {totalWeight}%
          </Badge>
          <Badge tone="gray">Role family: Tuyển sinh</Badge>
          <Badge tone="gray">Chu kỳ: Quý</Badge>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm"><Sparkles size={14} /> AI gợi ý KPI</button>
          <button className="btn primary sm"><Plus size={15} /> Thêm tiêu chí</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
        <Card title={<><BookMarked size={16} color="var(--nhg-primary)" /> Cây tiêu chí (cha–con)</>} sub="Nhóm tiêu chí → KPI con · nguồn Manual/System · chiều xuôi/ngược">
          {/* weight bar */}
          <div className="wbar" style={{ marginBottom: 14 }}>
            {kpiCategories.map((c) => (
              <i key={c.group} style={{ width: `${c.weight}%`, background: c.color }} title={`${c.group} ${c.weight}%`} />
            ))}
          </div>

          {kpiCategories.map((c) => (
            <div key={c.group} style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
                  <b style={{ fontSize: 13 }}>{c.group}</b>
                </div>
                <Badge tone="gray">{c.weight}% nhóm</Badge>
              </div>
              <table className="table">
                <tbody>
                  {c.items.map((it) => (
                    <tr key={it.code}>
                      <td style={{ width: 64 }}><span className="muted tiny numeric">{it.code}</span></td>
                      <td>{it.name}</td>
                      <td style={{ width: 90 }}><Badge tone={it.method === "system" ? "info" : "gray"}>{it.method === "system" ? "System" : "Manual"}</Badge></td>
                      <td style={{ width: 90 }}><Badge tone={it.dir === "forward" ? "green" : "amber"}>{it.dir === "forward" ? "Xuôi ↑" : "Ngược ↓"}</Badge></td>
                      <td className="rt numeric" style={{ width: 50 }}>{it.weight}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          <Card title="Bậc thang điểm" sub="Ví dụ tiêu chí 25 điểm — cấu hình theo từng KPI">
            <table className="table">
              <thead><tr><th>Mức đạt</th><th className="rt">Điểm</th></tr></thead>
              <tbody>
                {scoreTiers.map((t) => (
                  <tr key={t.pct}><td>{t.pct}</td><td className="rt numeric"><b>{t.score}</b></td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Multi-rater & chu kỳ" sub="Cấu hình theo scorecard">
            <div className="row between" style={{ marginBottom: 8 }}><span className="muted tiny">Người chấm</span><Badge tone="gray">Self + Manager</Badge></div>
            <div className="row between" style={{ marginBottom: 8 }}><span className="muted tiny">Chế độ</span><Badge tone="info">Tuần tự</Badge></div>
            <div className="row between" style={{ marginBottom: 8 }}><span className="muted tiny">Chu kỳ</span><Badge tone="gray">Quý</Badge></div>
            <div className="row between"><span className="muted tiny">Giải trình/khiếu nại</span><Badge tone="green"><Check size={12} /> Bật</Badge></div>
            <hr className="hr" />
            <div className="row between"><span className="muted tiny">Map điểm → IPC → thưởng</span><Badge tone="amber">Có version + audit</Badge></div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
