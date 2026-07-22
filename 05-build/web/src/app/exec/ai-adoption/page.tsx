"use client";
/**
 * [Trục A — L5] Ứng dụng AI — nối `GET /ai/economics` + `/ai/learning/stats` (đã có
 * sẵn từ trục Learning Loop, gần như miễn phí để dùng lại).
 *
 * [I6] Hai endpoint này gác bằng `ai:eval` — vai `exec_viewer` KHÔNG có quyền đó, và
 * điều đó là đúng: quản trị AI (ngưỡng, chi phí, chất lượng gợi ý) là việc của nhóm
 * cấu hình/quản trị, không phải bảng điều khiển điều hành. Khi thiếu quyền, màn nói
 * rõ và chỉ đường tới người có quyền — KHÔNG cấp thêm quyền cho vừa giao diện.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Lock, DollarSign, ThumbsUp, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card, Progress } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import type { MeResponse } from "@/lib/api";

interface EconomicsRow {
  agent: string;
  calls: number;
  tokensInP50?: number; tokensOutP50?: number;
  latencyMsP50?: number; latencyMsP95?: number;
  costUsd?: number;
  projection?: Record<string, number>;
  basis?: string;
  estimated?: boolean;
}
interface Economics { agents: EconomicsRow[]; totalCostUsd?: number; note?: string }
interface LearningStats {
  agents: Array<{
    agent: string; accepted: number; acceptedWithEdits: number;
    rejected: number; expired: number; total: number;
  }>;
}

export default function AiAdoptionPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [eco, setEco] = useState<Economics | null>(null);
  const [learn, setLearn] = useState<LearningStats | null>(null);
  const [denied, setDenied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await call<MeResponse>("/me");
      setMe(m);
      if (!m.permissions?.includes("ai:eval")) { setDenied(true); return; }
      const [e, l] = await Promise.all([
        call<Economics>("/ai/economics").catch(() => null),
        call<LearningStats>("/ai/learning/stats").catch(() => null),
      ]);
      setEco(e); setLearn(l); setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell crumb={{ section: "Điều hành", page: "Ứng dụng AI" }}>
      <div className="page-head">
        <div className="eyebrow">AI Adoption · chất lượng &amp; chi phí</div>
        <h1>Ứng dụng AI trong nền tảng</h1>
        <p>Người dùng chấp nhận gợi ý AI tới đâu, và mỗi lượt gọi tốn bao nhiêu.</p>
      </div>

      {loading && <Card><span className="muted tiny">Đang tải…</span></Card>}
      {err && <div className="studio-msg err" style={{ marginBottom: 14 }}>{err}</div>}

      {!loading && denied && (
        <Card>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Lock size={18} />
            <div>
              <b style={{ fontSize: 13 }}>Bạn không có quyền xem số liệu quản trị AI</b>
              <p className="tiny muted" style={{ margin: "6px 0 10px", lineHeight: 1.7 }}>
                Quyền <b>ai:eval</b> thuộc nhóm quản trị cấu hình chứ không thuộc vai điều hành.
                Đây là thiết kế phân quyền, không phải lỗi: ngưỡng chất lượng và ngân sách AI
                do người vận hành hệ thống nắm.
              </p>
              <Link className="btn ghost sm" href="/studio/ai-governance">
                Mở trang Quản trị AI (cần đăng nhập tài khoản có quyền) <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </Card>
      )}

      {!loading && !denied && (
        <>
          <div className="grid g4">
            <Card><div className="stat">
              <div className="v numeric">{eco?.agents?.length ?? 0}</div><div className="l">Tác vụ AI đang chạy</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">{eco?.agents?.reduce((a, x) => a + (x.calls ?? 0), 0) ?? 0}</div>
              <div className="l">Lượt gọi</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v green numeric">
                ${(eco?.totalCostUsd ?? 0).toFixed(2)}
              </div>
              <div className="l">Chi phí thực</div>
            </div></Card>
            <Card><div className="stat">
              <div className="v numeric">
                {learn?.agents?.reduce((a, x) => a + x.total, 0) ?? 0}
              </div>
              <div className="l">Tín hiệu học</div>
            </div></Card>
          </div>

          <div className="grid section-gap" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Card title={<><ThumbsUp size={16} color="var(--nhg-primary)" /> Mức chấp nhận gợi ý</>}
              sub="Người dùng nhận nguyên / sửa rồi nhận / bỏ">
              {(!learn || learn.agents.length === 0) && (
                <span className="tiny muted">Chưa có tín hiệu học nào được ghi nhận.</span>
              )}
              {learn?.agents.map((a) => {
                const good = a.accepted + a.acceptedWithEdits;
                const pct = a.total ? (good / a.total) * 100 : 0;
                return (
                  <div key={a.agent} style={{ marginBottom: 12 }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <span className="tiny">{a.agent}</span>
                      <span className="tiny numeric muted">{good}/{a.total}</span>
                    </div>
                    <Progress value={pct} tone={pct < 50 ? "danger" : pct < 75 ? "warn" : undefined} />
                    <div className="muted tiny" style={{ marginTop: 3 }}>
                      nhận nguyên {a.accepted} · sửa rồi nhận {a.acceptedWithEdits} ·
                      bỏ {a.rejected} · hết hạn {a.expired}
                    </div>
                  </div>
                );
              })}
            </Card>

            <Card title={<><DollarSign size={16} color="var(--nhg-primary)" /> Chi phí theo tác vụ</>}
              sub={eco?.note ?? "Số ước tính — nhãn rõ ràng, không trộn với chi phí thực"}>
              {(!eco || eco.agents.length === 0) && (
                <span className="tiny muted">Chưa có lượt gọi AI nào được ghi nhận.</span>
              )}
              {eco && eco.agents.length > 0 && (
                <table className="table">
                  <thead>
                    <tr><th>Tác vụ</th><th className="rt">Lượt</th><th className="rt">Độ trễ P95</th>
                      <th className="rt">Chi phí</th></tr>
                  </thead>
                  <tbody>
                    {eco.agents.map((a) => (
                      <tr key={a.agent}>
                        <td className="tiny">
                          {a.agent}
                          {a.estimated && <Badge tone="gray">ước tính</Badge>}
                        </td>
                        <td className="rt numeric">{a.calls}</td>
                        <td className="rt numeric">{a.latencyMsP95 != null ? `${a.latencyMsP95}ms` : "—"}</td>
                        <td className="rt numeric">${(a.costUsd ?? 0).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <hr className="hr" />
              <Link className="btn ghost sm" href="/studio/ai-governance">
                <Bot size={14} /> Quản trị AI đầy đủ
              </Link>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
