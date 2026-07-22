"use client";
/**
 * [Trục A — L3] Coaching — dựng từ TÍN HIỆU THẬT thay vì nhật ký bịa.
 *
 * Bản mock cũ có "nhật ký coaching" với ngày/chủ đề/cam kết và nút "Ghi chú mới".
 * Hệ thống KHÔNG có bảng coaching_note — giữ nguyên sau khi nối API thật sẽ là một
 * nút bấm vào không lưu được gì. Thay bằng thứ có thật và dùng được ngay: những
 * người trong đội đang cần trò chuyện, kèm LÝ DO cụ thể lấy từ dữ liệu
 * (điểm nghẽn nêu trong check-in · mục tiêu chệch hướng · check-in chưa nộp).
 *
 * Nơi lưu trao đổi hiện có: ô nhận xét check-in ở màn "Đội của tôi" (có audit).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageSquareText, TriangleAlert, CalendarClock, ArrowRight, Construction, CircleCheck,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { GoalRow } from "@/lib/api";

interface TeamMember {
  id: string;
  employeeCode: string;
  fullName: string;
  checkin: { id: string; status: string; blocker?: string | null; periodKey: string } | null;
  review: { id: string; status: string; proposedRating?: string | null } | null;
  goalCounts: Record<string, number>;
}
interface TeamResponse { members: TeamMember[] }

interface Signal {
  personId: string;
  name: string;
  code: string;
  reason: string;
  severity: "high" | "medium";
  hint: string;
}

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CoachingPage() {
  const { call } = useStudio();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const periodKey = currentMonthKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, g] = await Promise.all([
        call<TeamResponse>(`/persons/team?periodKey=${periodKey}`),
        call<GoalRow[]>("/goals").catch(() => [] as GoalRow[]),
      ]);
      setMembers(t.members);
      setGoals(g);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call, periodKey]);
  useEffect(() => { void load(); }, [load]);

  const goalsByOwner = useMemo(() => {
    const m = new Map<string, GoalRow[]>();
    for (const g of goals) {
      const arr = m.get(g.ownerId) ?? [];
      arr.push(g);
      m.set(g.ownerId, arr);
    }
    return m;
  }, [goals]);

  const signals = useMemo<Signal[]>(() => {
    const out: Signal[] = [];
    for (const m of members) {
      if (m.checkin?.blocker) {
        out.push({
          personId: m.id, name: m.fullName, code: m.employeeCode,
          reason: `Nêu điểm nghẽn trong check-in ${m.checkin.periodKey}: “${m.checkin.blocker}”`,
          severity: "high",
          hint: "Hỏi cụ thể cần bạn gỡ gì, ai là người quyết, hạn đến khi nào.",
        });
      }
      const off = m.goalCounts.off_track ?? 0;
      const risk = m.goalCounts.at_risk ?? 0;
      if (off > 0) {
        const names = (goalsByOwner.get(m.id) ?? [])
          .filter((g) => g.status === "off_track").map((g) => g.nameVi).join(" · ");
        out.push({
          personId: m.id, name: m.fullName, code: m.employeeCode,
          reason: `${off} mục tiêu chệch hướng${names ? `: ${names}` : ""}`,
          severity: "high",
          hint: "Xem lại mục tiêu còn hợp lý không, hay cần đổi cách làm / giảm phạm vi.",
        });
      } else if (risk > 0) {
        out.push({
          personId: m.id, name: m.fullName, code: m.employeeCode,
          reason: `${risk} mục tiêu có rủi ro`,
          severity: "medium",
          hint: "Can thiệp sớm khi còn kịp — hỏi đâu là rào cản lớn nhất tuần này.",
        });
      }
      if (!m.checkin) {
        out.push({
          personId: m.id, name: m.fullName, code: m.employeeCode,
          reason: `Chưa nộp check-in kỳ ${periodKey}`,
          severity: "medium",
          hint: "Thường là dấu hiệu quá tải hoặc mục tiêu không còn liên quan — hỏi trước khi nhắc.",
        });
      }
    }
    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  }, [members, goalsByOwner, periodKey]);

  const high = signals.filter((s) => s.severity === "high").length;

  return (
    <AppShell crumb={{ section: "Trưởng phòng", page: "Coaching" }}>
      <div className="page-head">
        <div className="eyebrow">Coaching · kỳ {periodKey}</div>
        <h1>Ai cần bạn trò chuyện tuần này</h1>
        <p>Gợi ý từ dữ liệu thật của đội — điểm nghẽn đã nêu, mục tiêu chệch hướng, check-in vắng.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            <Badge tone={high ? "red" : "green"}>{high} việc cần ưu tiên</Badge>
            <Badge tone="gray">{members.length} thành viên</Badge>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <Card
              title={<><MessageSquareText size={16} color="var(--nhg-primary)" /> Danh sách cần trao đổi</>}
              sub="Mỗi mục kèm lý do lấy thẳng từ dữ liệu — không phải cảm tính"
            >
              {signals.length === 0 && (
                <div className="row" style={{ gap: 8, padding: "10px 0" }}>
                  <CircleCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Không có tín hiệu nào cần can thiệp. Cả đội đã nộp check-in và mục tiêu đang đúng nhịp.
                  </span>
                </div>
              )}
              <div className="timeline">
                {signals.map((s, i) => (
                  <div key={`${s.personId}-${i}`} className="tl-item">
                    <div className="row between">
                      <div className="t">
                        <b>{s.name}</b> <span className="muted">· {s.code}</span>
                      </div>
                      <Badge tone={s.severity === "high" ? "red" : "amber"}>
                        {s.severity === "high" ? "Ưu tiên" : "Theo dõi"}
                      </Badge>
                    </div>
                    <div className="m">{s.reason}</div>
                    <div className="row tiny muted" style={{ gap: 6, marginTop: 4 }}>
                      <TriangleAlert size={12} /> <span>{s.hint}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Link className="btn primary sm" style={{ marginTop: 12 }} href="/manager/team">
                Ghi nhận xét vào check-in <ArrowRight size={14} />
              </Link>
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><CalendarClock size={16} color="var(--nhg-primary)" /> Nơi lưu trao đổi</>} sub="Có vết kiểm toán">
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.7 }}>
                  Kết luận buổi trao đổi nên ghi vào <b>nhận xét check-in</b> của kỳ tương ứng —
                  nhân viên đọc được ngay ở màn của họ, và nội dung nằm trong hồ sơ kỳ đó thay vì
                  trôi trong tin nhắn.
                </p>
              </Card>

              <Card title={<><Construction size={16} color="var(--nhg-text-secondary)" /> Chưa xây dựng</>} sub="Nói rõ thay vì giả lập">
                <ul className="tiny muted" style={{ paddingLeft: 18, lineHeight: 1.9, margin: 0 }}>
                  <li>Nhật ký coaching riêng (chủ đề, cam kết, lịch theo dõi) — cần đối tượng dữ liệu riêng</li>
                  <li>Nhắc lịch 1:1 định kỳ</li>
                  <li>Gợi ý câu hỏi coaching bằng AI — hạ tầng đã có, chưa mở cho màn này</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
