"use client";
/**
 * [Trục B — L6] "Cấu hình đơn vị" — locale mặc định · cadence check-in · ngưỡng nhắc ·
 * quy tắc thông báo cấp đơn vị (whitelist key trên tenant.settings, đã chốt ở L1).
 * Gom link tới cấu hình NGHIỆP VỤ đã có (KPI Library · Review Cycle · Policy) thay vì
 * làm lại — đây KHÔNG phải màn thay thế những màn đó.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Save, ArrowRight, BookMarked, CalendarCog, ShieldCheck, Lock } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { MeResponse } from "@/lib/api";

const CADENCES = ["weekly", "monthly", "quarterly", "yearly"] as const;
const CADENCE_LABEL: Record<string, string> = {
  weekly: "Hằng tuần", monthly: "Hằng tháng", quarterly: "Hằng quý", yearly: "Hằng năm",
};

export default function AdminConfigPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [locale, setLocale] = useState<"vi" | "en">("vi");
  const [cadence, setCadence] = useState<string>("monthly");
  const [threshold, setThreshold] = useState<number>(3);
  const [notifyCheckin, setNotifyCheckin] = useState(true);
  const [notifyReview, setNotifyReview] = useState(true);

  const can = (p: string) => !!me?.permissions?.includes(p);
  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  useEffect(() => {
    void (async () => {
      try {
        const [m, c] = await Promise.all([
          call<MeResponse>("/me"),
          call<Record<string, unknown>>("/admin/tenant-config").catch(() => ({} as Record<string, unknown>)),
        ]);
        setMe(m);
        setCfg(c);
        if (typeof c.defaultLocale === "string") setLocale(c.defaultLocale as "vi" | "en");
        if (typeof c.checkinCadence === "string") setCadence(c.checkinCadence);
        if (typeof c.reminderThresholdDays === "number") setThreshold(c.reminderThresholdDays);
        if (typeof c.notifyOnCheckinDue === "boolean") setNotifyCheckin(c.notifyOnCheckinDue);
        if (typeof c.notifyOnReviewFinalized === "boolean") setNotifyReview(c.notifyOnReviewFinalized);
      } catch (e) { fail(e); }
    })();
  }, [call]);

  const save = () => {
    setBusy(true); setMsg(null);
    call<Record<string, unknown>>("/admin/tenant-config", {
      method: "PATCH",
      json: {
        patch: {
          defaultLocale: locale, checkinCadence: cadence, reminderThresholdDays: threshold,
          notifyOnCheckinDue: notifyCheckin, notifyOnReviewFinalized: notifyReview,
        },
      },
    })
      .then((r) => { setCfg(r); setMsg({ kind: "ok", text: "Đã lưu cấu hình đơn vị" }); })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <AppShell crumb={{ section: "Quản trị đơn vị", page: "Cấu hình đơn vị" }}>
      <div className="page-head">
        <div className="eyebrow">Áp dụng cho toàn tenant</div>
        <h1>Cấu hình đơn vị</h1>
        <p>Locale mặc định · nhịp check-in · ngưỡng nhắc việc · quy tắc thông báo cấp đơn vị.</p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      {!can("tenant.config:read") ? (
        <Card title={<><SlidersHorizontal size={15} /> Cấu hình đơn vị</>}>
          <span className="row tiny muted" style={{ gap: 6 }}>
            <Lock size={13} /> Cần quyền tenant.config:read
          </span>
        </Card>
      ) : (
        <Card title={<><SlidersHorizontal size={15} /> Thiết lập chung</>}
          sub="Key ngoài whitelist bị từ chối ở tầng API (422) — không phải nơi nhét cấu hình tuỳ ý.">
          <div className="studio-field">
            <label>Locale mặc định cho người dùng mới</label>
            <select className="studio-select" value={locale} onChange={(e) => setLocale(e.target.value as "vi" | "en")}
              disabled={!can("tenant.config:update")}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="studio-field">
            <label>Nhịp check-in mặc định</label>
            <select className="studio-select" value={cadence} onChange={(e) => setCadence(e.target.value)}
              disabled={!can("tenant.config:update")}>
              {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="studio-field">
            <label>Ngưỡng nhắc việc (ngày trước hạn)</label>
            <input className="studio-input" type="number" min={0} max={90} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))} disabled={!can("tenant.config:update")} />
          </div>
          <div className="studio-field">
            <label>
              <input type="checkbox" checked={notifyCheckin} onChange={(e) => setNotifyCheckin(e.target.checked)}
                disabled={!can("tenant.config:update")} style={{ marginRight: 6 }} />
              Thông báo khi đến hạn check-in
            </label>
          </div>
          <div className="studio-field">
            <label>
              <input type="checkbox" checked={notifyReview} onChange={(e) => setNotifyReview(e.target.checked)}
                disabled={!can("tenant.config:update")} style={{ marginRight: 6 }} />
              Thông báo khi đánh giá được chốt hạng
            </label>
          </div>
          {can("tenant.config:update") ? (
            <button className="btn primary sm" disabled={busy} onClick={save}>
              <Save size={13} /> Lưu cấu hình
            </button>
          ) : (
            <span className="row tiny muted" style={{ gap: 6 }}><Lock size={13} /> Cần tenant.config:update để sửa</span>
          )}
          <div style={{ fontSize: 11, color: "var(--nhg-text-secondary)", marginTop: 8 }}>
            Đã lưu: {JSON.stringify(cfg)}
          </div>
        </Card>
      )}

      <div style={{ height: 12 }} />
      <Card title="Cấu hình nghiệp vụ liên quan" sub="Gom link — không làm lại những màn đã có.">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Link className="btn ghost sm" href="/hr/kpi-library"><BookMarked size={13} /> Thư viện KPI <ArrowRight size={12} /></Link>
          <Link className="btn ghost sm" href="/hr/review-cycle"><CalendarCog size={13} /> Chu kỳ đánh giá <ArrowRight size={12} /></Link>
          <Link className="btn ghost sm" href="/hr/policy"><ShieldCheck size={13} /> Quản trị chính sách <ArrowRight size={12} /></Link>
        </div>
      </Card>
    </AppShell>
  );
}
