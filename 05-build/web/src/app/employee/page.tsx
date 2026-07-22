"use client";
/**
 * [Trục A — L2] "Bàn làm việc của tôi" (work_item P1).
 *
 * Trang nhân viên mở đầu ngày: gom mọi việc đang chờ MÌNH làm. Cố ý KHÔNG có bảng
 * work_item mới — mọi mục đều suy ra từ dữ liệu đã có (check-in kỳ này, self-review
 * chưa nộp, goal chệch hướng, góp ý tác vụ đang mở). Thêm bảng chỉ để hiển thị lại
 * thứ suy ra được là tự tạo nguồn sự thật thứ hai phải đồng bộ.
 *
 * [RSC] Fetch CLIENT-SIDE. Cổng đăng nhập là client component nên children server-render
 * vẫn bị serialize vào payload — trang server-fetch sẽ gửi dữ liệu thật cho người
 * chưa đăng nhập. Mọi trang persona của trục này đều theo luật đó.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck, FileCheck, Target, MessageSquare, CircleCheck, ArrowRight, TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { CheckinRow, GoalRow, MeResponse, ReviewCycleRow, ReviewRow } from "@/lib/api";

/** Kỳ check-in hiện tại theo cadence tháng — cùng quy ước periodKey với BE (F37). */
function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Todo {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: "amber" | "red" | "info";
  icon: React.ReactNode;
}

export default function MyWorkbenchPage() {
  const { call, session } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const periodKey = currentMonthKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, g, c, r, cy] = await Promise.all([
        call<MeResponse | null>("/me"),
        call<GoalRow[]>("/goals"),
        call<CheckinRow[]>("/checkins"),
        call<{ reviews: ReviewRow[] }>("/reviews").then((x) => x.reviews),
        call<ReviewCycleRow[]>("/review-cycles").catch(() => [] as ReviewCycleRow[]),
      ]);
      setMe(m);
      setGoals(g);
      setCheckins(c);
      setReviews(r);
      setCycles(cy);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const cycleById = useMemo(
    () => new Map(cycles.map((c) => [c.id, c])), [cycles],
  );

  const todos = useMemo<Todo[]>(() => {
    const out: Todo[] = [];

    // ① Check-in kỳ này chưa nộp
    const thisPeriod = checkins.find((c) => c.periodKey === periodKey && c.cadence === "monthly");
    if (!thisPeriod && goals.length > 0) {
      out.push({
        id: "checkin",
        title: `Chưa nộp check-in kỳ ${periodKey}`,
        detail: `${goals.length} mục tiêu đang chờ bạn cập nhật tiến độ.`,
        href: "/employee/check-in", cta: "Nộp check-in", tone: "amber",
        icon: <CalendarCheck size={15} />,
      });
    }

    // ② Self-review chưa nộp (chỉ khi review còn ở draft — BE chặn self ở trạng thái khác)
    for (const r of reviews.filter((x) => x.status === "draft")) {
      out.push({
        id: `self-${r.id}`,
        title: "Chưa tự đánh giá",
        detail: `Chu kỳ ${cycleById.get(r.cycleId)?.name ?? r.cycleId.slice(0, 8)} đang mở phần tự đánh giá của bạn.`,
        href: "/employee/review", cta: "Viết tự đánh giá", tone: "amber",
        icon: <FileCheck size={15} />,
      });
    }

    // ③ Mục tiêu chệch hướng — off_track nặng hơn at_risk
    const off = goals.filter((g) => g.status === "off_track");
    const atRisk = goals.filter((g) => g.status === "at_risk");
    if (off.length > 0) {
      out.push({
        id: "off-track",
        title: `${off.length} mục tiêu đang chệch hướng`,
        detail: off.map((g) => g.nameVi).join(" · "),
        href: "/employee/my-goals", cta: "Xem mục tiêu", tone: "red",
        icon: <TriangleAlert size={15} />,
      });
    }
    if (atRisk.length > 0) {
      out.push({
        id: "at-risk",
        title: `${atRisk.length} mục tiêu có rủi ro`,
        detail: atRisk.map((g) => g.nameVi).join(" · "),
        href: "/employee/my-goals", cta: "Xem mục tiêu", tone: "amber",
        icon: <Target size={15} />,
      });
    }

    // ④ Quản lý đã nhận xét check-in — việc "đọc", không phải "làm", để tone info
    const reviewed = checkins.filter((c) => c.status === "reviewed" && c.managerComment);
    if (reviewed.length > 0) {
      out.push({
        id: "mgr-comment",
        title: "Quản lý đã nhận xét check-in của bạn",
        detail: reviewed[0].managerComment ?? "",
        href: "/employee/check-in", cta: "Xem nhận xét", tone: "info",
        icon: <MessageSquare size={15} />,
      });
    }
    return out;
  }, [checkins, goals, reviews, periodKey, cycleById]);

  const avgHealth = useMemo(() => {
    const vals = goals.map((g) => Number(g.healthScore)).filter((v) => Number.isFinite(v));
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [goals]);

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Bàn làm việc của tôi" }}>
      <div className="page-head">
        <div className="eyebrow">My Workbench · {periodKey}</div>
        <h1>Chào {me?.fullName ?? session?.email ?? "bạn"}</h1>
        <p>Những việc đang chờ bạn hôm nay — tổng hợp từ mục tiêu, check-in và chu kỳ đánh giá.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className="v numeric">{goals.length}</div><div className="l">Mục tiêu đang theo</div>
            </div></Card>
            <Card><div className="stat">
              <div className={`v numeric${avgHealth != null && avgHealth >= 70 ? " green" : ""}`}>
                {avgHealth ?? "—"}
              </div><div className="l">Sức khoẻ trung bình</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{checkins.length}</div><div className="l">Check-in đã nộp</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{todos.length}</div><div className="l">Việc cần làm</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <Card title="Việc cần làm" sub="Suy ra từ dữ liệu thật — không có hàng đợi riêng để lệch nhịp">
              {todos.length === 0 && (
                <div className="row" style={{ gap: 8, padding: "10px 0" }}>
                  <CircleCheck size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Không có việc nào đang chờ. Mục tiêu và check-in của bạn đều đang đúng nhịp.
                  </span>
                </div>
              )}
              {todos.map((t) => (
                <div key={t.id} className="row between" style={{
                  gap: 12, padding: "11px 0", borderBottom: "1px solid var(--nhg-border-subtle)",
                }}>
                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <span style={{ marginTop: 2 }}>{t.icon}</span>
                    <div>
                      <div className="row" style={{ gap: 8 }}>
                        <b style={{ fontSize: 13 }}>{t.title}</b>
                        <Badge tone={t.tone}>{t.tone === "red" ? "Gấp" : t.tone === "amber" ? "Cần làm" : "Để biết"}</Badge>
                      </div>
                      <div className="muted tiny" style={{ marginTop: 3 }}>{t.detail}</div>
                    </div>
                  </div>
                  <Link className="btn ghost sm" href={t.href}>{t.cta} <ArrowRight size={14} /></Link>
                </div>
              ))}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title="Mục tiêu của tôi" sub="Trạng thái do hệ thống tính từ tiến độ check-in">
                {goals.length === 0 && <span className="tiny muted">Chưa có mục tiêu nào được giao.</span>}
                {goals.map((g) => (
                  <div key={g.id} className="row between" style={{ padding: "7px 0" }}>
                    <span style={{ fontSize: 12.5 }}>{g.nameVi}</span>
                    <Badge tone={
                      g.status === "off_track" ? "red" : g.status === "at_risk" ? "amber" : "green"
                    }>
                      {g.healthScore != null ? Math.round(Number(g.healthScore)) : "—"}
                    </Badge>
                  </div>
                ))}
              </Card>

              <Card title="Tra cứu nhanh" sub="Tài nguyên tham chiếu toàn hàng">
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Link className="btn ghost sm" href="/dictionary">Từ điển Tác vụ</Link>
                  <Link className="btn ghost sm" href="/kpi-dictionary">Từ điển KPI</Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
