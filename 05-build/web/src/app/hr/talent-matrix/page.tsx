"use client";
/**
 * [Trục A — L4] Ma trận nhân tài (9-box) — dựng từ dữ liệu THẬT.
 *
 * TRỤC DỌC (hiệu suất) = điểm/hạng từ chu kỳ đánh giá — có thật.
 * TRỤC NGANG (tiềm năng) = KHÔNG CÓ trong hệ thống: chưa có bảng đánh giá tiềm năng,
 * cũng không có nguồn nào suy ra được. Bản mock cũ đặt sẵn tên người vào đủ 9 ô như
 * thể đã đánh giá — đó là bịa ở dạng nguy hiểm nhất vì 9-box thường dùng cho quyết
 * định thăng tiến/kế nhiệm.
 *
 * Cách xử lý: hiển thị TRUNG THỰC theo một trục (phân bố hiệu suất), nói rõ trục tiềm
 * năng chưa có và cần gì để có. Không tự chế điểm tiềm năng từ dữ liệu không liên quan.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3, Construction, Users } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { ReviewCycleRow, ReviewRow } from "@/lib/api";

interface ReviewListRow extends ReviewRow {
  reviewee: { id: string; fullName: string; employeeCode: string } | null;
}

/** Dải hiệu suất theo điểm cuối — ngưỡng hiển thị, không phải luật chấm điểm. */
const BANDS = [
  { key: "high", label: "Cao", min: 85, tone: "green" },
  { key: "mid", label: "Đạt", min: 70, tone: "info" },
  { key: "low", label: "Dưới ngưỡng", min: 0, tone: "amber" },
];

export default function TalentMatrixPage() {
  const { call } = useStudio();
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [reviews, setReviews] = useState<ReviewListRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cy = await call<ReviewCycleRow[]>("/review-cycles");
      setCycles(cy);
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

  const scored = useMemo(
    () => reviews.filter((r) => r.finalScore != null || r.finalRating || r.proposedRating),
    [reviews],
  );

  const byBand = useMemo(() => {
    const m: Record<string, ReviewListRow[]> = { high: [], mid: [], low: [] };
    for (const r of scored) {
      const s = r.finalScore != null ? Number(r.finalScore) : null;
      const band = s == null ? "mid" : BANDS.find((b) => s >= b.min)!.key;
      m[band].push(r);
    }
    return m;
  }, [scored]);

  return (
    <AppShell crumb={{ section: "HR", page: "Ma trận nhân tài" }}>
      <div className="page-head">
        <div className="eyebrow">Talent Matrix · phân bố hiệu suất</div>
        <h1>Ma trận nhân tài</h1>
        <p>Phân bố theo hiệu suất đã chấm trong chu kỳ — dữ liệu thật, không suy diễn.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <>
          <div className="studio-toolbar" style={{ marginBottom: 14 }}>
            <div className="studio-field" style={{ minWidth: 280 }}>
              <label>Chu kỳ</label>
              <select className="studio-input" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
              </select>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <Card
              title={<><Grid3x3 size={16} color="var(--nhg-primary)" /> Phân bố hiệu suất</>}
              sub={`${scored.length}/${reviews.length} phiếu đã có điểm hoặc hạng`}
            >
              {scored.length === 0 && (
                <span className="tiny muted">
                  Chưa phiếu nào được chấm điểm trong chu kỳ này — ma trận sẽ có dữ liệu sau khi
                  quản lý chạy tính điểm.
                </span>
              )}
              {BANDS.map((b) => (
                <div key={b.key} style={{ marginBottom: 14 }}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tone={b.tone}>{b.label}</Badge>
                      <span className="tiny muted">
                        {b.key === "high" ? "≥85 điểm" : b.key === "mid" ? "70–84 điểm" : "<70 điểm"}
                      </span>
                    </div>
                    <span className="tiny numeric muted">{byBand[b.key].length} người</span>
                  </div>
                  {byBand[b.key].length === 0 && <span className="tiny muted">—</span>}
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {byBand[b.key].map((r) => (
                      <span key={r.id} className="badge gray" style={{ fontSize: 11.5 }}>
                        {r.reviewee?.fullName ?? r.revieweeId.slice(0, 8)}
                        {r.finalScore != null && ` · ${Math.round(Number(r.finalScore))}`}
                        {(r.finalRating ?? r.proposedRating) && ` · ${r.finalRating ?? r.proposedRating}`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            <div className="grid" style={{ gap: 16 }}>
              <Card title={<><Construction size={16} color="var(--nhg-text-secondary)" /> Vì sao chưa có đủ 9 ô</>} sub="Nói rõ thay vì vẽ ma trận rỗng ruột">
                <p className="tiny muted" style={{ margin: 0, lineHeight: 1.8 }}>
                  Ma trận 9-box cần <b>hai</b> trục. Trục hiệu suất đã có (điểm chu kỳ đánh giá).
                  Trục <b>tiềm năng</b> hiện KHÔNG có nguồn nào trong hệ thống: chưa có đánh giá
                  tiềm năng, chưa có khung năng lực, và không có dữ liệu nào suy ra được một cách
                  trung thực.
                </p>
                <hr className="hr" />
                <div className="card-sub" style={{ marginBottom: 6 }}>Cần gì để bật đủ 9 ô</div>
                <ul className="tiny muted" style={{ paddingLeft: 18, lineHeight: 1.9, margin: 0 }}>
                  <li>Đối tượng đánh giá tiềm năng (ai chấm, theo tiêu chí nào, bao lâu một lần)</li>
                  <li>Quy trình hiệu chỉnh riêng cho tiềm năng — nếu không sẽ thành cảm tính</li>
                  <li>Chính sách sử dụng: 9-box dùng cho kế nhiệm hay cho lương thưởng</li>
                </ul>
              </Card>

              <Card>
                <div className="row" style={{ gap: 8 }}>
                  <Users size={16} color="var(--nhg-primary)" />
                  <span className="tiny muted">
                    Bạn chỉ thấy nhân sự trong phạm vi quản lý của mình — danh sách được lọc
                    ngay tại truy vấn phía máy chủ.
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
