"use client";
/**
 * [Trục A — L2] Kế hoạch phát triển.
 *
 * TRUNG THỰC LÀ RÀNG BUỘC THIẾT KẾ: bản mock cũ hiển thị skill-gap theo cấp độ L1–L5,
 * khoá học iLMS, mentor được đề xuất và lộ trình 30-60-90. KHÔNG cái nào có nguồn dữ
 * liệu — hệ thống chưa có bảng năng lực, chưa nối iLMS, chưa có ghép mentor. Giữ lại
 * những khối đó sau khi nối API thật sẽ biến số bịa thành số trông-như-thật, nguy hiểm
 * hơn hẳn lúc còn là bản mock ai cũng biết là mock.
 *
 * Vì vậy trang này chỉ hiện thứ CÓ THẬT: phần "cần cải thiện" và "nhu cầu phát triển"
 * do quản lý ghi trong kỳ đánh giá. Phần chưa có nguồn được nêu rõ là chưa xây.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Rocket, AlertTriangle, Construction, FileCheck } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { ReviewCycleRow, ReviewRow } from "@/lib/api";

interface ReviewDetail extends ReviewRow {
  gaps?: string | null;
  strengths?: string | null;
  developmentNeeds?: string | null;
  managerAssessment?: string | null;
}

export default function DevelopmentPage() {
  const { call } = useStudio();
  const [details, setDetails] = useState<ReviewDetail[]>([]);
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cy] = await Promise.all([
        call<{ reviews: ReviewRow[] }>("/reviews").then((x) => x.reviews),
        call<ReviewCycleRow[]>("/review-cycles").catch(() => [] as ReviewCycleRow[]),
      ]);
      setCycles(cy);
      // Chi tiết chỉ nạp cho các kỳ đã có nhận xét quản lý — trước đó không có gì để nói.
      const relevant = list.filter((r) => r.status !== "draft").slice(0, 5);
      const ds = await Promise.all(
        relevant.map((r) => call<ReviewDetail>(`/reviews/${r.id}`).catch(() => null)),
      );
      setDetails(ds.filter(Boolean) as ReviewDetail[]);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const withContent = details.filter((d) => d.gaps || d.developmentNeeds);

  return (
    <AppShell crumb={{ section: "Nhân viên", page: "Kế hoạch phát triển" }}>
      <div className="page-head">
        <div className="eyebrow">Development · từ các kỳ đánh giá của bạn</div>
        <h1>Kế hoạch phát triển của tôi</h1>
        <p>Những điểm cần cải thiện được ghi nhận qua các kỳ đánh giá — nguồn để bàn với quản lý.</p>
      </div>

      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}
      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}

      {!loading && (
        <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          <div className="grid" style={{ gap: 16 }}>
            <Card
              title={<><AlertTriangle size={16} color="var(--nhg-warning)" /> Điểm cần cải thiện</>}
              sub="Do quản lý ghi trong kỳ đánh giá"
            >
              {withContent.length === 0 && (
                <span className="tiny muted">
                  Chưa có kỳ đánh giá nào ghi nhận điểm cần cải thiện. Mục này sẽ có nội dung
                  sau khi quản lý hoàn tất phần nhận xét.
                </span>
              )}
              {withContent.map((d) => (
                <div key={d.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--nhg-border-subtle)" }}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <b style={{ fontSize: 13 }}>{cycleById.get(d.cycleId)?.name ?? "Kỳ đánh giá"}</b>
                    <Badge tone={d.status === "final" ? "green" : "info"}>
                      {d.finalRating ?? d.proposedRating ?? d.status}
                    </Badge>
                  </div>
                  {d.gaps && <div className="ai-draft" style={{ marginTop: 0 }}>{d.gaps}</div>}
                  {d.developmentNeeds && (
                    <>
                      <div className="card-sub" style={{ margin: "10px 0 5px" }}>Nhu cầu phát triển</div>
                      <div className="ai-draft" style={{ marginTop: 0 }}>{d.developmentNeeds}</div>
                    </>
                  )}
                </div>
              ))}
              <Link className="btn ghost sm" href="/employee/review">
                <FileCheck size={15} /> Xem đánh giá đầy đủ
              </Link>
            </Card>
          </div>

          <div className="grid" style={{ gap: 16 }}>
            <Card title={<><Construction size={16} color="var(--nhg-text-secondary)" /> Chưa xây dựng</>} sub="Nói rõ để không ai lập kế hoạch dựa trên số không có thật">
              <p className="tiny muted" style={{ marginBottom: 10 }}>
                Các năng lực sau cần hệ thống dữ liệu riêng, hiện chưa có trong nền tảng:
              </p>
              <ul className="tiny muted" style={{ paddingLeft: 18, lineHeight: 1.9, margin: 0 }}>
                <li>Khung năng lực &amp; cấp độ (L1–L5) — cần bảng năng lực + đánh giá theo năng lực</li>
                <li>Khoá học iLMS — cần nối hệ đào tạo</li>
                <li>Ghép mentor — cần hồ sơ năng lực của người hướng dẫn</li>
                <li>Lộ trình 30-60-90 — cần đối tượng kế hoạch phát triển riêng</li>
              </ul>
            </Card>

            <Card>
              <div className="row" style={{ gap: 8 }}>
                <Rocket size={16} color="var(--nhg-primary)" />
                <span className="tiny muted">
                  Trong lúc chờ, cách dùng thực tế: mang phần &ldquo;cần cải thiện&rdquo; vào buổi
                  check-in tháng với quản lý và ghi lại thống nhất ở ghi chú tiến độ.
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
