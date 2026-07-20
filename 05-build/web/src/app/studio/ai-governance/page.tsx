"use client";
/**
 * [Learning Loop L4] Quản trị AI — dashboard READ-ONLY khép vòng PRD §14/§15/§16:
 * ① Learning (tín hiệu Chấp nhận/Sửa/Bỏ per agent + field AI hay bị sửa — L0)
 * ② Eval readiness (pass-rate run mới nhất vs launch bar 🟢/🔴 — L2)
 * ③ Unit economics (token/latency P50/P95, cost thực = 0 trên mock, projection ×0.5/×1/×2 — L3)
 * Permission ai:eval (designer@/admin@). Mọi số chi phí là ƯỚC LƯỢNG (nhãn estimated).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, CheckCircle2, CircleDollarSign, GraduationCap, Languages, LogOut,
  RefreshCw, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { useStudio } from "@/lib/studio";
import { useI18n } from "@/lib/i18n";

interface LearningAgent {
  agent: string; accepted: number; acceptedWithEdits: number; rejected: number;
  expired: number; total: number; acceptRate: number | null; editRate: number | null;
  topEditedFields: Array<{ field: string; count: number }>;
}
interface ReadinessAgent {
  agent: string;
  bar: { minPassRate: number; minCases: number; note?: string | null } | null;
  cases: number; pass: number; fail: number; passRate: number | null;
  models: string[]; ready: boolean; liveQualified: boolean; reasons: string[];
  suites: Array<{ suiteId: string; name: string; latestRun: { pass: number; fail: number; model: string | null } | null }>;
}
interface EconomicsAgent {
  agent: string; calls: number; errors: number; actualCostUsd: number;
  callsPerMonth: number;
  tokens: { avgIn: number; avgOut: number; p50In: number | null; p95In: number | null; p50Out: number | null; p95Out: number | null };
  latencyMs: { p50: number | null; p95: number | null };
  projections: Array<{ model: string; estCostPerCallUsd: number; monthlyUsd: { half: number; base: number; double: number } }>;
}
interface EconomicsReport {
  windowDays: number; estimated: boolean; basis: string; totalActualCostUsd: number;
  agents: EconomicsAgent[];
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const usd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(2)}`);

export default function AiGovernancePage() {
  const { call, session, logout } = useStudio();
  const { lang, toggle } = useI18n();
  const L = (vi: string, en: string) => (lang === "vi" ? vi : en);

  const [learning, setLearning] = useState<{ totalSignals: number; agents: LearningAgent[] } | null>(null);
  const [readiness, setReadiness] = useState<{ agents: ReadinessAgent[] } | null>(null);
  const [economics, setEconomics] = useState<EconomicsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [l, r, e] = await Promise.all([
        call<{ totalSignals: number; agents: LearningAgent[] }>("/ai/learning/stats"),
        call<{ agents: ReadinessAgent[] }>("/ai/eval/readiness"),
        call<EconomicsReport>("/ai/economics"),
      ]);
      setLearning(l);
      setReadiness(r);
      setEconomics(e);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: L("Quản trị AI", "AI Governance") }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">{L("Learning loop · Eval · Unit economics — trên MOCK, chi phí thật 0đ", "Learning loop · Eval · Unit economics — on MOCK, real cost $0")}</div>
          <h1><Activity size={22} style={{ verticalAlign: "-4px" }} /> {L("Quản trị AI", "AI Governance")}</h1>
          <p>{L(
            "Vòng khép kín: người dùng Chấp nhận/Sửa/Bỏ gợi ý → golden set (curator duyệt, SoD) → eval vs launch bar → chi phí dự kiến khi bật live.",
            "Closed loop: users Accept/Edit/Dismiss suggestions → golden set (curator-approved, SoD) → eval vs launch bar → projected cost if going live.",
          )}</p>
        </div>
        <div className="dict-session">
          <span className="who"><b>{session?.email}</b></span>
          <button className="btn ghost sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={13} /> {L("Tải lại", "Refresh")}
          </button>
          <button className="btn ghost sm" onClick={toggle}><Languages size={13} /> {lang === "vi" ? "EN" : "VI"}</button>
          <button className="btn ghost sm" onClick={logout}><LogOut size={13} /> {L("Đổi phiên", "Switch")}</button>
        </div>
      </div>

      {err && (
        <div className="studio-msg err">
          {err} — {L("cần quyền ai:eval (đăng nhập designer@/admin@)", "requires ai:eval (login designer@/admin@)")}
        </div>
      )}

      {/* ① Learning — tín hiệu học từ HITL */}
      <section className="aigov-section">
        <h2><GraduationCap size={16} /> {L("Học từ người dùng", "Learning from users")}
          <span className="aigov-sub">{learning ? L(`${learning.totalSignals} tín hiệu`, `${learning.totalSignals} signals`) : "…"}</span>
        </h2>
        {learning && learning.agents.length === 0 && (
          <div className="aigov-empty">{L("Chưa có tín hiệu — dùng nút ✦ AI gợi ý trong Studio để tạo.", "No signals yet — use the ✦ AI suggest buttons in Studio.")}</div>
        )}
        {learning && learning.agents.length > 0 && (
          <div className="aigov-tablewrap">
            <table className="aigov-table">
              <thead>
                <tr>
                  <th>Agent</th><th>{L("Chấp nhận", "Accepted")}</th><th>{L("Sửa rồi nhận", "Edited")}</th>
                  <th>{L("Bỏ", "Rejected")}</th><th>{L("Hết hạn", "Expired")}</th>
                  <th>{L("Tỷ lệ nhận", "Accept rate")}</th><th>{L("AI hay sai ở", "Often edited")}</th>
                </tr>
              </thead>
              <tbody>
                {learning.agents.map((a) => (
                  <tr key={a.agent}>
                    <td className="mono">{a.agent}</td>
                    <td>{a.accepted}</td><td>{a.acceptedWithEdits}</td><td>{a.rejected}</td><td>{a.expired}</td>
                    <td><b>{pct(a.acceptRate)}</b></td>
                    <td>
                      {a.topEditedFields.length === 0 ? "—" : a.topEditedFields.map((f) => (
                        <span key={f.field} className="aigov-chip">{f.field} ×{f.count}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ② Eval readiness vs launch bar */}
      <section className="aigov-section">
        <h2><ShieldCheck size={16} /> {L("Sẵn sàng bật live (launch bar)", "Launch readiness")}</h2>
        <div className="aigov-cards">
          {(readiness?.agents ?? []).map((a) => (
            <div key={a.agent} className={`aigov-card ${a.ready ? "ok" : "bad"}`}>
              <div className="aigov-card-head">
                <span className="mono">{a.agent}</span>
                {a.ready
                  ? <span className="aigov-badge ok"><CheckCircle2 size={12} /> {L("đạt ngưỡng", "meets bar")}</span>
                  : <span className="aigov-badge bad"><XCircle size={12} /> {L("chưa đạt", "not ready")}</span>}
                {!a.liveQualified && (
                  <span className="aigov-badge warn"><ShieldAlert size={12} /> {L("chưa đủ điều kiện live", "not live-qualified")}</span>
                )}
              </div>
              <div className="aigov-card-metrics">
                <span><b>{pct(a.passRate)}</b> pass-rate</span>
                <span>{L("ngưỡng", "bar")} <b>{a.bar ? pct(a.bar.minPassRate) : "—"}</b></span>
                <span><b>{a.cases}</b> case ({L("cần", "need")} ≥{a.bar?.minCases ?? "—"})</span>
                <span className="mono">{a.models.join(", ") || "—"}</span>
              </div>
              {a.reasons.length > 0 && (
                <ul className="aigov-reasons">
                  {a.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ③ Unit economics */}
      <section className="aigov-section">
        <h2><CircleDollarSign size={16} /> {L("Chi phí đơn vị", "Unit economics")}
          <span className="aigov-sub">
            {economics ? `${L("cửa sổ", "window")} ${economics.windowDays}d · ${L("chi thật", "actual")} ${usd(economics.totalActualCostUsd)}` : "…"}
          </span>
        </h2>
        {economics && (
          <div className="aigov-basis">⚠ {L("Ước lượng", "Estimated")}: {economics.basis}</div>
        )}
        {economics && economics.agents.length > 0 && (
          <div className="aigov-tablewrap">
            <table className="aigov-table">
              <thead>
                <tr>
                  <th>Agent</th><th>{L("Lượt", "Calls")}</th><th>{L("Lỗi", "Err")}</th>
                  <th>tok in avg (p95)</th><th>tok out avg (p95)</th><th>latency p50/p95</th>
                  <th>{L("Chi thật", "Actual")}</th>
                  <th>{L("Dự kiến/tháng nếu live (×0.5 · ×1 · ×2)", "Proj./month if live (×0.5 · ×1 · ×2)")}</th>
                </tr>
              </thead>
              <tbody>
                {economics.agents.map((a) => {
                  const opus = a.projections.find((p) => p.model === "claude-opus-4-8") ?? a.projections[0];
                  return (
                    <tr key={a.agent}>
                      <td className="mono">{a.agent}</td>
                      <td>{a.calls}</td><td>{a.errors}</td>
                      <td>{a.tokens.avgIn} ({a.tokens.p95In ?? "—"})</td>
                      <td>{a.tokens.avgOut} ({a.tokens.p95Out ?? "—"})</td>
                      <td>{a.latencyMs.p50 ?? "—"}/{a.latencyMs.p95 ?? "—"}ms</td>
                      <td><b>{usd(a.actualCostUsd)}</b></td>
                      <td>
                        {opus ? (
                          <span title={opus.model} className="mono">
                            {usd(opus.monthlyUsd.half)} · <b>{usd(opus.monthlyUsd.base)}</b> · {usd(opus.monthlyUsd.double)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="aigov-footnote">
          {L("Projection theo giá niêm yết claude-opus-4-8 (model mặc định registry). RED-LINE giữ nguyên: chưa bật live, chưa chi đồng nào.",
             "Projection uses claude-opus-4-8 list price (default registry model). RED-LINE intact: live is off, real spend is $0.")}
        </div>
      </section>
    </AppShell>
  );
}
