import { Fragment } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { nineBox } from "@/lib/mock";
import { Grid3x3 } from "lucide-react";

const cellBg: Record<string, string> = {
  green: "var(--nhg-primary-subtle)", info: "var(--nhg-info-subtle)",
  amber: "var(--nhg-warning-subtle)", gray: "var(--nhg-bg-muted)", red: "var(--nhg-danger-subtle)",
};
const cellBd: Record<string, string> = {
  green: "var(--nhg-primary)", info: "var(--nhg-info)", amber: "var(--nhg-warning)",
  gray: "var(--nhg-border-strong)", red: "var(--nhg-danger)",
};

function Cell({ x, y }: { x: number; y: number }) {
  const c = nineBox[`${x}-${y}`];
  return (
    <div style={{
      background: cellBg[c.tone], border: `1px solid ${cellBd[c.tone]}`,
      borderRadius: 12, padding: 12, minHeight: 96, display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div className="row between">
        <b style={{ fontSize: 12 }}>{c.label}</b>
        <span className="badge gray">{c.names.filter((n) => n !== "—").length}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {c.names.map((n) => (
          <span key={n} className="tiny" style={{ background: "var(--nhg-surface-card)", border: "1px solid var(--nhg-border-subtle)", borderRadius: 6, padding: "2px 7px" }}>{n}</span>
        ))}
      </div>
    </div>
  );
}

export default function TalentMatrixPage() {
  const yLabels = ["Tiềm năng cao", "Tiềm năng TB", "Tiềm năng thấp"]; // y=2,1,0
  const xLabels = ["Hiệu suất thấp", "Hiệu suất TB", "Hiệu suất cao"]; // x=0,1,2
  return (
    <AppShell crumb={{ section: "HR / B1", page: "Ma trận nhân tài" }}>
      <div className="page-head">
        <div className="eyebrow">Ma trận nhân tài · 9-box</div>
        <h1>Talent Matrix — Hiệu suất × Tiềm năng</h1>
        <p>Phân nhóm nhân sự để ra quyết định phát triển, kế nhiệm, ghi nhận. AI gợi ý — hội đồng quyết định.</p>
      </div>

      <Card title={<><Grid3x3 size={16} color="var(--nhg-primary)" /> Lưới 9-box</>} sub="Trục dọc: tiềm năng · trục ngang: hiệu suất">
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr", gap: 10, alignItems: "stretch" }}>
          {[2, 1, 0].map((y, rowIdx) => (
            <Fragment key={`row-${y}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8 }}>
                <span className="tiny muted" style={{ textAlign: "right", fontWeight: 700 }}>{yLabels[rowIdx]}</span>
              </div>
              {[0, 1, 2].map((x) => <Cell key={`${x}-${y}`} x={x} y={y} />)}
            </Fragment>
          ))}
          <div />
          {xLabels.map((l) => (
            <div key={l} className="tiny muted" style={{ textAlign: "center", fontWeight: 700, paddingTop: 6 }}>{l}</div>
          ))}
        </div>
      </Card>

      <div className="grid g3 section-gap">
        <Card><div className="stat"><div className="v green numeric">3</div><div className="l">Ngôi sao &amp; tiềm năng cao</div></div></Card>
        <Card><div className="stat"><div className="v numeric">4</div><div className="l">Lõi vững — giữ &amp; phát triển</div></div></Card>
        <Card><div className="stat"><div className="v red numeric">1</div><div className="l">Cần hành động</div></div></Card>
      </div>
    </AppShell>
  );
}
