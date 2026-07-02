import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { devStats, skillGaps, coachingPlan } from "@/lib/mock";
import { Rocket, GraduationCap, Sparkles, Check, Circle, UserRound } from "lucide-react";

const statusMap: Record<string, { tone: string; label: string }> = {
  done: { tone: "green", label: "Hoàn thành" },
  in_progress: { tone: "info", label: "Đang học" },
  planned: { tone: "amber", label: "Dự kiến" },
};

function Levels({ cur, target }: { cur: number; target: number }) {
  return (
    <div className="row" style={{ gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{
          width: 16, height: 8, borderRadius: 3,
          background: n <= cur ? "var(--nhg-primary)" : n <= target ? "var(--nhg-primary-subtle)" : "var(--nhg-bg-muted)",
          border: n === target ? "1px solid var(--nhg-primary)" : "none",
        }} />
      ))}
    </div>
  );
}

export default function DevelopmentPage() {
  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Kế hoạch phát triển" }}>
      <div className="page-head">
        <div className="eyebrow">Development Plan · từ review Quý 3/2026</div>
        <h1>Kế hoạch phát triển của tôi</h1>
        <p>Biến điểm chưa đạt thành lộ trình phát triển: gap → learning (iLMS) → coaching → bằng chứng tiến bộ.</p>
      </div>

      <div className="grid g4">
        {devStats.map((s) => (
          <Card key={s.l}><div className="stat"><div className="v green numeric">{s.v}</div><div className="l">{s.l}</div></div></Card>
        ))}
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="grid" style={{ gap: 16 }}>
          <Card title={<><GraduationCap size={16} color="var(--nhg-primary)" /> Skill &amp; competency gap</>} sub="Mức hiện tại → mục tiêu · nối khoá học iLMS">
            <table className="table">
              <thead><tr><th>Năng lực</th><th style={{ width: 130 }}>Cấp độ</th><th>Khoá học (iLMS)</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {skillGaps.map((g) => (
                  <tr key={g.competency}>
                    <td><b>{g.competency}</b><div className="muted tiny">L{g.cur} → L{g.target}</div></td>
                    <td><Levels cur={g.cur} target={g.target} /></td>
                    <td className="muted tiny">{g.course}</td>
                    <td><Badge tone={statusMap[g.status].tone}>{statusMap[g.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={<><Rocket size={16} color="var(--nhg-primary)" /> Kế hoạch coaching 30-60-90</>} sub="Mục tiêu phát triển theo mốc">
            <div className="timeline">
              {coachingPlan.map((p, i) => (
                <div key={i} className="tl-item">
                  <div className="row between">
                    <div className="t">{p.phase} — {p.goal}</div>
                    {p.done
                      ? <Badge tone="green"><Check size={12} /> Đạt</Badge>
                      : <Badge tone="gray"><Circle size={11} /> Đang làm</Badge>}
                  </div>
                  <div className="m">{p.action}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="ai-panel">
            <div className="ai-head"><Sparkles size={16} color="#6D28A8" /> <b>Coaching Agent</b>
              <span className="ai-chip" style={{ marginLeft: "auto" }}>AI · gợi ý</span></div>
            <p className="tiny muted" style={{ marginBottom: 10 }}>Gợi ý learning &amp; coaching — không quyết định promotion/PIP.</p>
            <div className="ai-draft">
              Gap lặp lại 2 kỳ: <b>Data hygiene CRM</b>. Ưu tiên hoàn thành khoá CRM Data trong 30 ngày —
              tác động trực tiếp 1 KPI đang dưới ngưỡng. Đề xuất ghép mentor là 1 senior có điểm data hygiene cao.
            </div>
            <button className="btn primary sm"><Check size={15} /> Thêm vào kế hoạch</button>
          </div>

          <Card title={<><UserRound size={16} color="var(--nhg-primary)" /> Mentor được đề xuất</>} sub="Ghép theo năng lực còn thiếu">
            <div className="row" style={{ gap: 12 }}>
              <div className="avatar">MT</div>
              <div>
                <b style={{ fontSize: 13 }}>Mai Trang</b>
                <div className="muted tiny">Senior Tuyển sinh · Data hygiene 97%</div>
              </div>
              <button className="btn ghost sm" style={{ marginLeft: "auto" }}>Mời mentor</button>
            </div>
          </Card>

          <Card>
            <div className="row between">
              <span className="tiny muted">Liên kết với <b>iLMS</b> &amp; tín hiệu <b>TalentOS</b></span>
              <Badge tone="info">Đã nối</Badge>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
