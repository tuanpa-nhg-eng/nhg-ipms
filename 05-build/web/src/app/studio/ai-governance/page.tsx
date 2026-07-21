"use client";
/**
 * [Learning Loop L4 + Last-mile Lát 5] Quản trị AI — khép vòng PRD §14/§15/§16 +
 * checklist sẵn sàng bật AI thật (§9/§11):
 * ① Learning (tín hiệu Chấp nhận/Sửa/Bỏ per agent + field AI hay bị sửa — L0)
 * ② Eval readiness (pass-rate vs launch bar 🟢/🔴 + Model-Qualification Gate — L2/Lát4)
 * ③ Unit economics (token/latency P50/P95, cost thực, projection ×0.5/×1/×2 — L3)
 * ④ Egress Policy (dataClass→đích — Lát 2) ⑤ Checklist sẵn sàng Live (Lát 5)
 * Permission ai:eval (designer@/admin@). Mọi số chi phí là ƯỚC LƯỢNG (nhãn estimated).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, CheckCircle2, CircleDollarSign, GraduationCap, KeyRound, Languages,
  ListChecks, LogOut, RefreshCw, ShieldAlert, ShieldCheck, XCircle,
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
  models: string[]; servingModel: string; ready: boolean; liveQualified: boolean; reasons: string[];
  suites: Array<{ suiteId: string; name: string; latestRun: { pass: number; fail: number; model: string | null } | null }>;
}
interface LiveStatus { flagEnabled: boolean; hasApiKey: boolean; backend: "anthropic" | "mock" }
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
interface EgressPolicy { id: string; dataClass: string; destination: string; allowed: boolean; note?: string | null }

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const usd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(2)}`);
const MODEL_CHOICES = ["mock", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"];

export default function AiGovernancePage() {
  const { call, session, logout } = useStudio();
  const { lang, toggle } = useI18n();
  const L = (vi: string, en: string) => (lang === "vi" ? vi : en);

  const [learning, setLearning] = useState<{ totalSignals: number; agents: LearningAgent[] } | null>(null);
  const [readiness, setReadiness] = useState<{ agents: ReadinessAgent[]; liveStatus: LiveStatus } | null>(null);
  const [economics, setEconomics] = useState<EconomicsReport | null>(null);
  const [egress, setEgress] = useState<{ policies: EgressPolicy[]; dataClasses: string[]; destinations: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pickModel, setPickModel] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [l, r, e, g] = await Promise.all([
        call<{ totalSignals: number; agents: LearningAgent[] }>("/ai/learning/stats"),
        call<{ agents: ReadinessAgent[]; liveStatus: LiveStatus }>("/ai/eval/readiness"),
        call<EconomicsReport>("/ai/economics"),
        call<{ policies: EgressPolicy[]; dataClasses: string[]; destinations: string[] }>("/ai/egress-policies"),
      ]);
      setLearning(l);
      setReadiness(r);
      setEconomics(e);
      setEgress(g);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const qualify = useCallback(async (agent: string) => {
    setActionMsg(null);
    try {
      const q = await call<{ model: string; passRate: string }>(`/ai/eval/qualify/${agent}`, { method: "POST", json: {} });
      setActionMsg({ kind: "ok", text: L(`Đã qualify '${agent}' cho model ${q.model} (pass-rate ${q.passRate}).`, `Qualified '${agent}' for ${q.model} (pass-rate ${q.passRate}).`) });
      await load();
    } catch (e) {
      setActionMsg({ kind: "err", text: (e as Error).message });
    }
  }, [call, load, L]);

  const setServingModel = useCallback(async (agent: string) => {
    const model = pickModel[agent];
    if (!model) return;
    setActionMsg(null);
    try {
      await call(`/ai/eval/agent-model/${agent}`, { method: "PUT", json: { model } });
      setActionMsg({ kind: "ok", text: L(`Đã đổi model phục vụ '${agent}' sang ${model}.`, `Serving model for '${agent}' set to ${model}.`) });
      await load();
    } catch (e) {
      setActionMsg({ kind: "err", text: (e as Error).message });
    }
  }, [call, load, pickModel, L]);

  const setEgressAllowed = useCallback(async (dataClass: string, destination: string, allowed: boolean) => {
    setActionMsg(null);
    try {
      await call("/ai/egress-policies", { method: "PUT", json: { dataClass, destination, allowed } });
      await load();
    } catch (e) {
      setActionMsg({ kind: "err", text: (e as Error).message });
    }
  }, [call, load]);

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
      {actionMsg && <div className={`studio-msg ${actionMsg.kind}`}>{actionMsg.text}</div>}

      {/* ⑤ [Last-mile Lát 5] Checklist sẵn sàng bật AI thật */}
      {readiness && (
        <section className="aigov-section">
          <h2><ListChecks size={16} /> {L("Checklist sẵn sàng Live", "Live-readiness checklist")}</h2>
          <div className="aigov-cards">
            <div className={`aigov-card ${readiness.liveStatus.hasApiKey ? "ok" : "bad"}`}>
              <div className="aigov-card-head">
                <KeyRound size={14} />
                <span>ANTHROPIC_API_KEY</span>
                {readiness.liveStatus.hasApiKey
                  ? <span className="aigov-badge ok"><CheckCircle2 size={12} /> {L("đã cấp", "present")}</span>
                  : <span className="aigov-badge bad"><XCircle size={12} /> {L("chưa cấp", "missing")}</span>}
              </div>
              <div className="aigov-card-metrics">
                <span>{L("Đọc từ biến môi trường — không hiển thị giá trị.", "Read from env var — value never shown.")}</span>
              </div>
            </div>
            <div className={`aigov-card ${readiness.liveStatus.flagEnabled ? "ok" : "bad"}`}>
              <div className="aigov-card-head">
                <span>ai_gateway_live</span>
                {readiness.liveStatus.flagEnabled
                  ? <span className="aigov-badge ok"><CheckCircle2 size={12} /> ON</span>
                  : <span className="aigov-badge bad"><XCircle size={12} /> OFF</span>}
              </div>
              <div className="aigov-card-metrics">
                <span>{L("Backend hiện tại", "Current backend")}: <b className="mono">{readiness.liveStatus.backend}</b></span>
              </div>
            </div>
            <div className={`aigov-card ${readiness.agents.filter((a) => a.ready).length === readiness.agents.length && readiness.agents.length > 0 ? "ok" : "bad"}`}>
              <div className="aigov-card-head">
                <span>{L("Agent đạt bar", "Agents ready")}</span>
              </div>
              <div className="aigov-card-metrics">
                <span><b>{readiness.agents.filter((a) => a.ready).length}</b> / {readiness.agents.length}</span>
              </div>
            </div>
            <div className={`aigov-card ${readiness.agents.filter((a) => a.liveQualified).length === readiness.agents.length && readiness.agents.length > 0 ? "ok" : "bad"}`}>
              <div className="aigov-card-head">
                <ShieldCheck size={14} />
                <span>{L("Agent đã qualify model đang phục vụ", "Agents live-qualified")}</span>
              </div>
              <div className="aigov-card-metrics">
                <span><b>{readiness.agents.filter((a) => a.liveQualified).length}</b> / {readiness.agents.length}</span>
              </div>
            </div>
          </div>
          <div className="aigov-footnote">
            {L(
              "Đủ 4 mục xanh + Egress không chặn model đích ⇒ mới nên cân nhắc bật ai_gateway_live cho người dùng thật. Bất biến cứng: dữ liệu pii/confidential KHÔNG BAO GIỜ egress (self-host chưa triển khai) — không mục nào ở đây thay đổi được điều đó.",
              "All 4 green + Egress not blocking the target model ⇒ only then consider turning ai_gateway_live on for real users. Hard invariant: pii/confidential data NEVER egresses (no self-host yet) — nothing here changes that.",
            )}
          </div>
        </section>
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
                <span className="mono">{L("đã chạy", "ran")}: {a.models.join(", ") || "—"}</span>
              </div>
              <div className="aigov-card-metrics">
                <span>{L("model đang phục vụ", "serving model")}: <b className="mono">{a.servingModel}</b></span>
              </div>
              {a.reasons.length > 0 && (
                <ul className="aigov-reasons">
                  {a.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {/* [Last-mile Lát 4/5] Model-Qualification Gate — hành động admin */}
              <div className="aigov-card-actions">
                <button className="btn ghost sm" disabled={!a.ready} title={!a.ready ? L("Cần đạt bar trước", "Must meet bar first") : ""}
                  onClick={() => void qualify(a.agent)}>
                  {L("Qualify (chạy lại toàn bộ suite)", "Qualify (re-run all suites)")}
                </button>
                <select className="studio-select" style={{ maxWidth: 200 }} value={pickModel[a.agent] ?? ""}
                  onChange={(e) => setPickModel((p) => ({ ...p, [a.agent]: e.target.value }))}>
                  <option value="">{L("chọn model…", "pick model…")}</option>
                  {MODEL_CHOICES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn ghost sm" disabled={!pickModel[a.agent]} onClick={() => void setServingModel(a.agent)}>
                  {L("Đặt làm model phục vụ", "Set as serving model")}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="aigov-footnote">
          {L(
            "Cấm silent-swap: đổi model phục vụ CHỈ được chấp nhận khi model đích đã Qualify (chạy thật toàn bộ suite, đạt bar) — bar bị siết sau đó sẽ tự vô hiệu qualification cũ.",
            "Anti silent-swap: changing the serving model is ONLY accepted once the target model has been Qualified (real run of all suites, meeting the bar) — raising the bar later auto-invalidates stale qualifications.",
          )}
        </div>
      </section>

      {/* ④ [Last-mile Lát 2] Egress Policy — dataClass → đích */}
      <section className="aigov-section">
        <h2><ShieldAlert size={16} /> {L("Chính sách Egress", "Egress policy")}
          <span className="aigov-sub">{L("dữ liệu đi đâu — theo phân loại", "where data may go — by classification")}</span>
        </h2>
        {egress && (
          <div className="aigov-tablewrap">
            <table className="aigov-table">
              <thead>
                <tr>
                  <th>{L("Phân loại", "Data class")}</th><th>{L("Đích", "Destination")}</th>
                  <th>{L("Trạng thái", "Status")}</th><th>{L("Hành động", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {egress.dataClasses.flatMap((dc) => egress.destinations.filter((d) => d !== "mock").map((dest) => {
                  const sensitive = dc === "confidential" || dc === "pii";
                  const row = egress.policies.find((p) => p.dataClass === dc && p.destination === dest);
                  const allowed = sensitive ? false : (row?.allowed ?? true);
                  return (
                    <tr key={`${dc}-${dest}`}>
                      <td className="mono">{dc}</td>
                      <td className="mono">{dest}</td>
                      <td>
                        {sensitive
                          ? <span className="aigov-badge bad"><XCircle size={12} /> {L("LUÔN CHẶN (bất biến)", "ALWAYS BLOCKED (hard invariant)")}</span>
                          : allowed
                            ? <span className="aigov-badge ok"><CheckCircle2 size={12} /> {L("cho phép", "allowed")}</span>
                            : <span className="aigov-badge bad"><XCircle size={12} /> {L("chặn (tenant)", "blocked (tenant)")}</span>}
                      </td>
                      <td>
                        {sensitive ? "—" : (
                          <button className="btn ghost sm" onClick={() => void setEgressAllowed(dc, dest, !allowed)}>
                            {allowed ? L("Chặn", "Block") : L("Cho phép", "Allow")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}
        <div className="aigov-footnote">
          {L(
            "mock luôn được phép (không rời máy) — không hiển thị ở bảng này. pii/confidential chặn cứng trong code (self-host chưa triển khai), không sửa được qua UI.",
            "mock is always allowed (never leaves the machine) — not shown here. pii/confidential are hard-blocked in code (no self-host yet) and cannot be edited via this UI.",
          )}
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
