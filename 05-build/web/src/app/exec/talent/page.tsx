"use client";
/**
 * [Trục A — L5] Rủi ro nhân tài — phân bố hạng/điểm thật theo chu kỳ.
 *
 * Bản mock cũ có "nguy cơ nghỉ việc" (flight risk) và "khoảng trống kế nhiệm" với tên
 * người cụ thể kèm % rủi ro. Hệ thống KHÔNG có mô hình dự đoán nghỉ việc, không có dữ
 * liệu kế nhiệm. Dự đoán ai sắp nghỉ là loại số dễ bị dùng cho quyết định nhân sự nhất
 * — bịa ra là hại thật. Chỉ hiển thị thứ đo được, và nêu rõ phần chưa có.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { UserCog, Construction, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { ReviewCycleRow, ReviewRow } from "@/lib/api";

interface ReviewListRow extends ReviewRow {
  reviewee: { id: string; fullName: string; employeeCode: string } | null;
}

interface Overview {
  goals: { total: number; byStatus: Record<string, number> };
  atRisk: Array<{
    id: string; nameVi: string; status: string; healthScore: number | null;
    owner: { id: string; fullName: string; employeeCode: string } | null;
  }>;
}

export default function TalentPage() {
  const { call } = useStudio();
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [reviews, setReviews] = useState<ReviewListRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cy, ov] = await Promise.all([
        call<ReviewCycleRow[]>("/review-cycles"),
        call<Overview>("/exec/overview").catch(() => null),
      ]);
      setCycles(cy); setOverview(ov);
      const use = cycleId || cy.find((c) => c.status === "open")?.id || cy[0]?.id || "";
      if (!cycleId && use) setCycleId(use);
      if (use) {
        const list = await call<{ reviews: ReviewListRow[] }>(`/reviews?cycleId=${use}`);
        setReviews(list.reviews);
      }
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call, cycleId]);
  useEffect(() => { void load(); }, [load]);

  const dist = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reviews) {
      const k = r.finalRating ?? r.proposedRating;
      if (k) m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reviews]);
  const rated = dist.reduce((a, [, n]) => a + n, 0);

  /** Người có nhiều mục tiêu chệch hướng — tín hiệu ĐO ĐƯỢC, không phải dự đoán. */
  const strained = useMemo(() => {
    const m = new Map<string, { name: string; code: string; n: number }>();
    for (const g of overview?.atRisk ?? []) {
      if (!g.owner) continue;
      const cur = m.get(g.owner.id) ?? { name: g.owner.fullName, code: g.owner.employeeCode, n: 0 };
      cur.n += 1;
      m.set(g.owner.id, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [overview]);

  return (
    <AppShell crumb={{ section: "Điều hành", page: "Rủi ro nhân tài" }}>
      <div className="page-head">
        <div className="eyebrow">Talent Risk · tín hiệu đo được</div>
        <h1>Rủi ro nhân tài</h1>
        <p>Phân bố kết quả đánh giá và những người đang gánh nhiều việc chệch hướng.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 300 }}>
              <label>Chu kỳ</label>
              <select className="studio-input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
              </select>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><UserCog size={16} color="var(--nhg-primary)" /> Phân bố kết quả đánh giá</>}
                sub={`${rated}/${reviews.length} phiếu đã có hạng`}>
                {dist.length === 0 && (
                  <span className="tiny muted">
                    Chưa phiếu nào có hạng trong chu kỳ này.
                  </span>
                )}
                {dist.map(([k, n]) => (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span className="tiny"><b>Hạng {k}</b></span>
                      <span className="tiny numeric muted">{n} người ({rated ? Math.round((n / rated) * 100) : 0}%)</span>
                    </div>
                    <Progress value={rated ? (n / rated) * 100 : 0} />
                  </div>
                ))}
              </Card>

              <Card
                title={<><TriangleAlert size={16} color="var(--nhg-warning)" /> Đang gánh nhiều việc chệch hướng</>}
                sub="Đếm từ mục tiêu thật — dấu hiệu cần hỗ trợ, không phải đánh giá con người"
              >
                {strained.length === 0 && <span className="tiny muted">Không có ai đang trong tình trạng này.</span>}
                {strained.map((s) => (
                  <div key={s.code} className="row between" style={{ padding: "7px 0" }}>
                    <div>
                      <b style={{ fontSize: 12.5 }}>{s.name}</b>
                      <div className="muted tiny">{s.code}</div>
                    </div>
                    <Badge tone={s.n >= 2 ? "red" : "amber"}>{s.n} mục tiêu</Badge>
                  </div>
                ))}
              </Card>
            </div>

            <Card title={<><Construction size={16} color="var(--nhg-text-secondary)" /> Chưa xây dựng</>}
              sub="Cố ý không hiển thị số dự đoán">
              <p className="tiny muted" style={{ margin: 0, lineHeight: 1.8 }}>
                Bản trước có <b>“nguy cơ nghỉ việc”</b> và <b>“khoảng trống kế nhiệm”</b> kèm tên
                người và tỷ lệ phần trăm. Hệ thống không có mô hình dự đoán nghỉ việc và không có
                dữ liệu kế nhiệm — những con số đó là dựng sẵn.
              </p>
              <hr className="hr" />
              <p className="tiny muted" style={{ margin: 0, lineHeight: 1.8 }}>
                Đây là loại số dễ được dùng cho quyết định nhân sự nhất, nên hiển thị số bịa
                gây hại thật. Muốn có thì cần: dữ liệu lịch sử nghỉ việc, mô hình được kiểm định,
                và chính sách nói rõ ai được xem, dùng vào việc gì.
              </p>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
