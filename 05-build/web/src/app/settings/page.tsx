"use client";
/**
 * [Trục B — L5] User Settings — 5 mục theo thiết kế §3③, vào menu avatar (KHÔNG sidebar).
 *
 * - Hồ sơ: đọc từ /me (đồng bộ HRIS) — READ-ONLY, không bịa trường "tên hiển thị" tách biệt
 *   khỏi hồ sơ nhân sự khi schema không có cột đó (nguyên tắc trục A: không có nguồn thật
 *   thì nói thẳng, không dựng UI giả).
 * - Tuỳ chọn: VI/EN · sáng/tối · mật độ — NỐI THẲNG vào ThemeProvider/LangProvider hiện có
 *   (đổi là thấy ngay) + lưu server-side (app_user.preferences) để đổi máy vẫn giữ.
 * - Thông báo: ma trận sự kiện × kênh.
 * - Bảo mật: TRUNG THỰC về hiện trạng — dev-token, chưa MFA, chưa liệt kê phiên đăng nhập.
 *   Không dựng ô MFA giả.
 * - Quyền của tôi: role + scope + ai cấp + khi nào (GET /me/access) + [J13] "ai đã đóng vai
 *   tôi" — cam kết trust-by-design §0.7.
 */
import { useEffect, useState } from "react";
import {
  UserRound, SlidersHorizontal, Bell, ShieldAlert, KeyRound, Info, Eye,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useI18n } from "@/lib/i18n";
import { applyDensity, getDensity, type Density } from "@/lib/density";
import { MeAccessResponse, MeResponse, NotificationSettingRow } from "@/lib/api";

const TABS = [
  ["profile", "Hồ sơ", UserRound],
  ["preferences", "Tuỳ chọn", SlidersHorizontal],
  ["notifications", "Thông báo", Bell],
  ["security", "Bảo mật", ShieldAlert],
  ["access", "Quyền của tôi", KeyRound],
] as const;

const EVENT_LABEL: Record<string, string> = {
  "review.finalized": "Đánh giá được chốt hạng",
  "checkin.due": "Đến hạn check-in",
  "task.feedback": "Góp ý tác vụ được phản hồi",
  "authoring.grant": "Được cấp/thu quyền soạn tác vụ",
};
const CHANNEL_LABEL: Record<string, string> = { in_app: "Trong ứng dụng", email: "Email" };

export default function SettingsPage() {
  const { call } = useStudio();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useI18n();

  const [tab, setTab] = useState<(typeof TABS)[number][0]>("profile");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [access, setAccess] = useState<MeAccessResponse | null>(null);
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [notifs, setNotifs] = useState<NotificationSettingRow[]>([]);
  const [density, setDensityState] = useState<Density>("comfortable");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  useEffect(() => {
    void (async () => {
      try {
        const [m, a, p, n] = await Promise.all([
          call<MeResponse>("/me"),
          call<MeAccessResponse>("/me/access"),
          call<Record<string, unknown>>("/me/settings"),
          call<NotificationSettingRow[]>("/me/notifications"),
        ]);
        setMe(m);
        setAccess(a);
        setPrefs(p);
        setNotifs(n);
        setDensityState(getDensity());
      } catch (e) { fail(e); }
    })();
  }, [call]);

  // [F189 — Reviewer đối kháng] Khoá optimistic — version đọc từ `prefs` gần nhất (mỗi PATCH
  // trả về version mới, setPrefs cập nhật lại — click kế tiếp đọc đúng version hiện hành).
  const saveLocale = (v: "vi" | "en") => {
    setLang(v);
    void call("/me/settings", { method: "PATCH", json: { patch: { locale: v }, version: prefs.version } })
      .then((r: any) => setPrefs(r)).catch(fail);
  };
  const saveTheme = (v: "light" | "dark") => {
    setTheme(v);
    void call("/me/settings", { method: "PATCH", json: { patch: { theme: v }, version: prefs.version } })
      .then((r: any) => setPrefs(r)).catch(fail);
  };
  const saveDensity = (v: Density) => {
    setDensityState(v);
    applyDensity(v);
    void call("/me/settings", { method: "PATCH", json: { patch: { density: v }, version: prefs.version } })
      .then((r: any) => setPrefs(r)).catch(fail);
  };

  const toggleNotif = (eventKey: string, channel: string, enabled: boolean) => {
    setBusy(true); setMsg(null);
    call<NotificationSettingRow[]>("/me/notifications", {
      method: "PATCH", json: { items: [{ eventKey, channel, enabled }] },
    })
      .then((r) => { setNotifs(r); setMsg({ kind: "ok", text: "Đã lưu" }); })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <AppShell crumb={{ section: "Cài đặt tài khoản", page: TABS.find(([k]) => k === tab)?.[1] ?? "" }}>
      <div className="page-head">
        <div className="eyebrow">Tuỳ chọn cá nhân — không ảnh hưởng người khác</div>
        <h1>Cài đặt tài khoản</h1>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([key, label, Icon]) => (
          <button key={key} className={`btn sm ${tab === key ? "primary" : "ghost"}`} onClick={() => setTab(key)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Card title={<><UserRound size={15} /> Hồ sơ</>}
          sub="Đồng bộ từ hồ sơ nhân sự (HRIS qua /admin/users) — read-only. Liên hệ quản trị viên đơn vị để cập nhật.">
          <table className="table">
            <tbody>
              <tr><td style={{ width: 160, color: "var(--nhg-text-secondary)" }}>Họ tên</td><td>{me?.fullName ?? "—"}</td></tr>
              <tr><td style={{ color: "var(--nhg-text-secondary)" }}>Mã nhân viên</td><td style={{ fontFamily: "ui-monospace, monospace" }}>{me?.employeeCode ?? "—"}</td></tr>
              <tr><td style={{ color: "var(--nhg-text-secondary)" }}>Email đăng nhập</td><td>{me?.email ?? "—"}</td></tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "preferences" && (
        <Card title={<><SlidersHorizontal size={15} /> Tuỳ chọn</>}
          sub="Đổi là thấy ngay trên toàn ứng dụng; lưu server-side — đổi máy vẫn giữ nguyên.">
          <div className="studio-field">
            <label>Ngôn ngữ</label>
            <select className="studio-select" value={lang} onChange={(e) => saveLocale(e.target.value as "vi" | "en")}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="studio-field">
            <label>Giao diện</label>
            <select className="studio-select" value={theme} onChange={(e) => saveTheme(e.target.value as "light" | "dark")}>
              <option value="light">Sáng</option>
              <option value="dark">Tối</option>
            </select>
          </div>
          <div className="studio-field">
            <label>Mật độ hiển thị</label>
            <select className="studio-select" value={density} onChange={(e) => saveDensity(e.target.value as Density)}>
              <option value="comfortable">Thoải mái</option>
              <option value="compact">Gọn</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: "var(--nhg-text-secondary)" }}>
            Đã lưu: {JSON.stringify(prefs)}
          </div>
        </Card>
      )}

      {tab === "notifications" && (
        <Card title={<><Bell size={15} /> Thông báo</>} sub="Không có dòng nào nghĩa là BẬT (mặc định an toàn cho người mới).">
          <table className="table">
            <thead><tr><th>Sự kiện</th><th>Kênh</th><th className="rt">Bật</th></tr></thead>
            <tbody>
              {notifs.map((n) => (
                <tr key={`${n.eventKey}-${n.channel}`}>
                  <td>{EVENT_LABEL[n.eventKey] ?? n.eventKey}</td>
                  <td>{CHANNEL_LABEL[n.channel] ?? n.channel}</td>
                  <td className="rt">
                    <button className={`btn sm ${n.enabled ? "primary" : "ghost"}`} disabled={busy}
                      onClick={() => toggleNotif(n.eventKey, n.channel, !n.enabled)}>
                      {n.enabled ? "Bật" : "Tắt"}
                    </button>
                  </td>
                </tr>
              ))}
              {notifs.length === 0 && (
                <tr><td colSpan={3} style={{ color: "var(--nhg-text-secondary)" }}>Đang tải…</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "security" && (
        <Card title={<><ShieldAlert size={15} /> Bảo mật</>}>
          <div className="ai-flag" style={{ marginBottom: 10 }}>
            <Info size={15} />
            <span>
              Màn này nói THẬT hiện trạng, không dựng ô giả cho thứ chưa có (nguyên tắc trục A).
            </span>
          </div>
          <table className="table">
            <tbody>
              <tr>
                <td style={{ width: 220, color: "var(--nhg-text-secondary)" }}>Phương thức đăng nhập</td>
                <td>Dev-token nội bộ (email + tenant) — <b>chưa phải Entra ID/SSO</b></td>
              </tr>
              <tr>
                <td style={{ color: "var(--nhg-text-secondary)" }}>Xác thực 2 bước (MFA)</td>
                <td><Badge tone="amber">Chưa có</Badge> — cần Azure Entra tenant, ngoài phạm vi trục này</td>
              </tr>
              <tr>
                <td style={{ color: "var(--nhg-text-secondary)" }}>Phiên đăng nhập đang mở</td>
                <td><Badge tone="amber">Chưa liệt kê được</Badge> — JWT hiện không có bảng phiên riêng để thu hồi từng thiết bị</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "access" && (
        <>
          <Card title={<><KeyRound size={15} /> Quyền của tôi</>} sub="Vai · phạm vi · ai cấp · khi nào.">
            <table className="table">
              <thead><tr><th>Vai</th><th>Phạm vi</th><th>Ai cấp</th><th>Khi nào</th></tr></thead>
              <tbody>
                {(access?.roles ?? []).map((r, i) => (
                  <tr key={i}>
                    <td><Badge tone="info">{r.roleCode}</Badge></td>
                    <td style={{ fontSize: 12 }}>{r.scopeType === "tenant" ? "Toàn tenant" : r.scopeType === "org_unit" ? "Một đơn vị" : "Chính mình"}</td>
                    <td style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)" }}>{r.grantedBy?.email ?? "seed"}</td>
                    <td style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)" }}>{new Date(r.grantedAt).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
                {(access?.roles.length ?? 0) === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>Đang tải…</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--nhg-text-secondary)" }}>
              Danh sách quyền hiệu lực: {(access?.permissions ?? []).join(", ") || "—"}
            </div>
          </Card>

          <div style={{ height: 12 }} />
          <Card title={<><Eye size={15} /> Ai đã đóng vai tôi</>}
            sub="[Trục B L4 — J13] Minh bạch hai chiều — mọi lần một quản trị viên xem thay bạn đều hiện ở đây.">
            <table className="table">
              <thead><tr><th>Người thực hiện</th><th>Lý do</th><th>Bắt đầu</th><th>Kết thúc</th></tr></thead>
              <tbody>
                {(access?.impersonatedBy ?? []).map((x, i) => (
                  <tr key={i}>
                    <td>{x.actorEmail ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{x.reason}</td>
                    <td style={{ fontSize: 11.5 }}>{new Date(x.startedAt).toLocaleString("vi-VN")}</td>
                    <td style={{ fontSize: 11.5 }}>{x.endedAt ? new Date(x.endedAt).toLocaleString("vi-VN") : <Badge tone="amber">đang diễn ra</Badge>}</td>
                  </tr>
                ))}
                {(access?.impersonatedBy.length ?? 0) === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>Chưa từng có ai đóng vai bạn.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}
