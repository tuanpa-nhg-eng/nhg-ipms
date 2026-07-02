import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge } from "@/components/ui";
import { reviewData } from "@/lib/mock";
import { Sparkles, TriangleAlert, Check, X, ShieldCheck, ThumbsUp, ThumbsDown } from "lucide-react";

export default function ReviewPage() {
  const d = reviewData;
  return (
    <AppShell crumb={{ section: "Quản lý", page: "Review" }}>
      <div className="page-head">
        <div className="eyebrow">Manager Review · {d.cycle}</div>
        <h1>Đánh giá hiệu suất — {d.reviewee}</h1>
        <p>{d.position} · Human-led, AI-assisted, evidence-based</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div className="grid" style={{ gap: 16 }}>
          <Card title="Bảng điểm theo KPI" sub="Điểm = mức đạt → bậc thang → nhân tỷ trọng (engine §7)">
            <table className="table">
              <thead>
                <tr><th>KPI</th><th>Nguồn</th><th className="rt">Tỷ trọng</th><th className="rt">Đạt</th><th className="rt">Điểm</th></tr>
              </thead>
              <tbody>
                {d.items.map((it) => (
                  <tr key={it.kpi}>
                    <td><b>{it.kpi}</b></td>
                    <td><Badge tone={it.src === "system" ? "info" : "gray"}>{it.src === "system" ? "System" : "Manual"}</Badge></td>
                    <td className="rt numeric">{it.weight}%</td>
                    <td className="rt numeric">{it.pct}%</td>
                    <td className="rt numeric"><b>{it.raw}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <hr className="hr" />
            <div className="row between">
              <div className="row" style={{ gap: 10 }}>
                <span className="muted tiny">Điểm tổng đề xuất</span>
                <span className="numeric" style={{ fontSize: 22, fontWeight: 800, color: "var(--nhg-primary)" }}>{d.proposedScore}</span>
                <Badge tone="green">Hạng IPC: {d.ipc}</Badge>
              </div>
              <span className="badge amber"><TriangleAlert size={13} /> Rating cuối do người chốt</span>
            </div>
          </Card>

          <Card title="Nhận xét của quản lý" sub="Có thể chỉnh sửa nội dung AI soạn nháp bên phải">
            <textarea
              defaultValue={d.aiDraft}
              rows={6}
              style={{
                width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, padding: 12,
                borderRadius: 10, border: "1px solid var(--nhg-border-default)",
                background: "var(--nhg-bg-canvas)", color: "var(--nhg-text-primary)", resize: "vertical",
              }}
            />
            <div className="row between" style={{ marginTop: 12 }}>
              <span className="muted tiny"><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Mọi thay đổi rating được audit-log</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost sm">Lưu nháp</button>
                <button className="btn primary sm"><Check size={15} /> Chốt rating (người duyệt)</button>
              </div>
            </div>
          </Card>
        </div>

        {/* AI panel */}
        <div className="ai-panel">
          <div className="ai-head">
            <Sparkles size={18} color="#6D28A8" /> <b>Đề xuất AI</b>
            <span className="ai-chip" style={{ marginLeft: "auto" }}>Review Drafting · confidence 0.82</span>
          </div>
          <p className="tiny muted" style={{ marginBottom: 10 }}>AI soạn nháp &amp; phát hiện bias — KHÔNG chốt rating.</p>

          <div className="card-sub" style={{ marginTop: 4 }}>Điểm mạnh (đề xuất)</div>
          {d.aiStrengths.map((s, i) => (
            <div key={i} className="ai-draft" style={{ margin: "0 0 6px" }}>
              <div className="row between">
                <span>{s}</span>
                <span className="row" style={{ gap: 6 }}>
                  <ThumbsUp size={14} color="var(--nhg-primary)" /><ThumbsDown size={14} color="var(--nhg-text-tertiary)" />
                </span>
              </div>
            </div>
          ))}

          <div className="card-sub" style={{ marginTop: 12 }}>Điểm cần cải thiện (đề xuất)</div>
          {d.aiGaps.map((s, i) => (
            <div key={i} className="ai-draft" style={{ margin: "0 0 6px" }}>{s}</div>
          ))}

          <div className="card-sub" style={{ marginTop: 12 }}>Bias / chất lượng — cần người kiểm</div>
          {d.aiFlags.map((f, i) => (
            <div key={i} className="ai-flag"><TriangleAlert size={15} /><span>{f}</span></div>
          ))}

          <hr className="hr" />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary sm"><Check size={15} /> Chấp nhận tất cả</button>
            <button className="btn ghost sm"><X size={15} /> Bỏ qua</button>
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Mọi đề xuất chỉ vào hồ sơ khi người dùng <b>Accept</b> (ghi ai_suggestion + provenance).
          </p>
        </div>
      </div>
    </AppShell>
  );
}
