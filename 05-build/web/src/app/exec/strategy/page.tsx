import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { strategyTree } from "@/lib/mock";
import { Network, Sparkles } from "lucide-react";

function tone(h: number) { return h < 50 ? "danger" : h < 70 ? "warn" : undefined; }
function kindBadge(k: string) {
  const map: Record<string, string> = { OKR: "green", KGI: "info", KPI: "gray" };
  return <Badge tone={map[k] ?? "gray"}>{k}</Badge>;
}

function Node({ node, depth }: { node: any; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 22, marginBottom: 8 }}>
      <div
        className="card"
        style={{
          padding: "11px 14px",
          borderLeft: `3px solid ${depth === 0 ? "var(--nhg-primary)" : depth === 1 ? "var(--nhg-info)" : "var(--nhg-border-strong)"}`,
        }}
      >
        <div className="row between">
          <div className="row" style={{ gap: 10 }}>
            {kindBadge(node.kind)}
            <b style={{ fontSize: 13 }}>{node.name}</b>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span className="muted tiny">{node.owner}</span>
            <span className="tiny numeric muted">Tỷ trọng {node.weight}%</span>
            <div style={{ width: 110 }}><Progress value={node.health} tone={tone(node.health)} /></div>
            <span className="tiny numeric" style={{ width: 26 }}>{node.health}</span>
          </div>
        </div>
      </div>
      {node.children?.map((c: any, i: number) => <Node key={i} node={c} depth={depth + 1} />)}
    </div>
  );
}

export default function StrategyPage() {
  return (
    <AppShell crumb={{ section: "Điều hành", page: "Phân rã mục tiêu" }}>
      <div className="page-head">
        <div className="eyebrow">Phân rã mục tiêu · Strategy Cascade</div>
        <h1>Cây mục tiêu OKR → KGI → KPI</h1>
        <p>Biến chiến lược thành mục tiêu đo được, cascade từ tập đoàn → đơn vị → vai trò. Đo cả 2 chiều.</p>
      </div>

      <div className="ai-panel">
        <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Strategy Cascade Agent</b>
          <span className="ai-chip" style={{ marginLeft: "auto" }}>AI · gợi ý</span></div>
        <div className="ai-draft" style={{ marginBottom: 0 }}>
          Phát hiện <b>1 alignment gap</b>: KGI “Mở rộng tuyển sinh +15%” (health 64) chưa có KPI nào phủ
          mảng <b>retention sau nhập học</b> — đề xuất bổ sung KPI để khép vòng. Goal “Lead-to-enrollment”
          đang kéo health KGI xuống.
        </div>
      </div>

      <div className="section-gap">
        <div className="card-title" style={{ marginBottom: 10 }}><Network size={16} color="var(--nhg-primary)" /> Cây mục tiêu H.01 · Quý 3/2026</div>
        {strategyTree.map((n, i) => <Node key={i} node={n} depth={0} />)}
      </div>
    </AppShell>
  );
}
