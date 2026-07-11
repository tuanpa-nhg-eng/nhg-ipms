"use client";
/**
 * StudioGate — cổng đăng nhập dùng chung cho các khu NỐI API THẬT (Configuration
 * Studio + Từ điển Tác vụ). Chưa có phiên → form dev-login (dev-token, API bật
 * ALLOW_DEV_TOKEN). Production: thay bằng OIDC Entra (TDD §11) — form này biến mất.
 * Dùng chung StudioProvider ⇒ session chia sẻ giữa /studio và /dictionary.
 */
import { FormEvent, ReactNode, useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui";
import { StudioProvider, useStudio } from "@/lib/studio";

type QuickRole = readonly [string, string];

const DEFAULT_QUICK: QuickRole[] = [
  ["designer", "soạn cấu hình"], ["approver", "duyệt cấu hình"],
  ["author", "BU soạn thư viện"], ["curator", "gác thư viện"],
  ["admin", "tenant admin"],
];

function LoginCard({ quickRoles }: { quickRoles: QuickRole[] }) {
  const { login } = useStudio();
  const [tenantCode, setTenantCode] = useState("H.01");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seedEmail = (prefix: string) =>
    `${prefix}@${tenantCode.toLowerCase().replace(".", "")}.nhg.local`;

  const doLogin = async (targetEmail: string) => {
    setErr(null);
    setBusy(true);
    try {
      await login(tenantCode.trim(), targetEmail.trim());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email) void doLogin(email);
  };

  return (
    <div className="studio-login">
      <Card
        title={<><KeyRound size={15} /> Đăng nhập (dev)</>}
        sub="Dev-token nội bộ — production sẽ dùng SSO Entra ID. Chọn nhanh vai trò seed hoặc nhập email."
      >
        <form onSubmit={onSubmit}>
          <div className="studio-toolbar">
            <div className="studio-field">
              <label>Tenant</label>
              <input className="studio-input" value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)} />
            </div>
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Email</label>
              <input className="studio-input" value={email} placeholder={seedEmail("emp1")}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy || !email}>
              <LogIn size={15} /> Vào
            </button>
          </div>
        </form>
        <div className="quick">
          {quickRoles.map(([p, label]) => (
            <button key={p} className="btn ghost sm" disabled={busy}
              onClick={() => void doLogin(seedEmail(p))}>
              {p}@ ({label})
            </button>
          ))}
        </div>
        {err && <div className="studio-msg err">{err}</div>}
      </Card>
    </div>
  );
}

function Gate({ children, section, quickRoles }: {
  children: ReactNode; section: string; quickRoles: QuickRole[];
}) {
  const { session, ready } = useStudio();
  if (!ready) return null;
  if (!session) {
    return (
      <AppShell crumb={{ section, page: "Đăng nhập" }}>
        <LoginCard quickRoles={quickRoles} />
      </AppShell>
    );
  }
  return <>{children}</>;
}

export function StudioGate({ children, section = "Configuration Studio", quickRoles = DEFAULT_QUICK }: {
  children: ReactNode; section?: string; quickRoles?: QuickRole[];
}) {
  return (
    <StudioProvider>
      <Gate section={section} quickRoles={quickRoles}>{children}</Gate>
    </StudioProvider>
  );
}
