import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Progress } from "@/components/ui";
import { reviewCycle } from "@/lib/mock";
import { CalendarCog, Check, Circle, Play, Settings2 } from "lucide-react";

export default function ReviewCyclePage() {
  const c = reviewCycle;
  return (
    <AppShell crumb={{ section: "HR / B1", page: "Thiết lập chu kỳ" }}>
      <div className="page-head">
        <div className="eyebrow">Thiết lập chu kỳ · Review Cycle Setup</div>
        <h1>{c.name}</h1>
        <p>{c.scope} · kỳ {c.period}. Cấu hình quy tắc &amp; theo dõi tiến độ chạy chu kỳ đánh giá.</p>
      </div>

      <div className="grid g3">
        <Card><div className="stat"><div className="v green numeric">{c.progress.self}%</div><div className="l">Đã tự đánh giá</div></div></Card>
        <Card><div className="stat"><div className="v numeric">{c.progress.manager}%</div><div className="l">Quản lý đã đánh giá</div></div></Card>
        <Card><div className="stat"><div className="v numeric">{c.progress.calibrated}%</div><div className="l">Đã calibration</div></div></Card>
      </div>

      <div className="grid section-gap" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card title={<><CalendarCog size={16} color="var(--nhg-primary)" /> Tiến trình chu kỳ</>} sub="5 giai đoạn — giai đoạn hiện tại được tô đậm">
          <div className="timeline">
            {c.phases.map((p, i) => (
              <div key={i} className="tl-item">
                <div className="row between">
                  <div className="t" style={{ color: (p as any).active ? "var(--nhg-primary)" : undefined }}>
                    {p.phase}{(p as any).active ? " — đang chạy" : ""}
                  </div>
                  {p.done
                    ? <Badge tone="green"><Check size={12} /> Xong</Badge>
                    : (p as any).active
                      ? <Badge tone="info"><Play size={11} /> Hiện tại</Badge>
                      : <Badge tone="gray"><Circle size={11} /> Chờ</Badge>}
                </div>
                <div className="m">{p.date}</div>
              </div>
            ))}
          </div>
          <hr className="hr" />
          <div className="row between">
            <span className="muted tiny">Nhắc nhở tự động gửi tới nhóm chưa nộp.</span>
            <button className="btn primary sm"><Play size={15} /> Mở giai đoạn tiếp theo</button>
          </div>
        </Card>

        <Card title={<><Settings2 size={16} color="var(--nhg-primary)" /> Cấu hình chu kỳ</>} sub="Quy tắc áp dụng cho toàn chu kỳ">
          <table className="table">
            <tbody>
              {c.settings.map((s) => (
                <tr key={s.k}>
                  <td className="muted">{s.k}</td>
                  <td className="rt"><b>{s.v}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn ghost sm section-gap">Chỉnh cấu hình</button>
        </Card>
      </div>
    </AppShell>
  );
}
