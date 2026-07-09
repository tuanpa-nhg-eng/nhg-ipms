"use client";
/**
 * Configuration Studio — khu vực nối API THẬT (khác các màn mock còn lại).
 * Gate: chưa có phiên → form dev-login (dev-token, API phải bật ALLOW_DEV_TOKEN).
 * Production: thay bằng OIDC Entra (TDD §11) — form này biến mất.
 */
import "reactflow/dist/style.css";
import "./studio.css";
import { FormEvent, ReactNode, useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui";
import { StudioProvider, useStudio } from "@/lib/studio";

function LoginCard() {
  const { login } = useStudio();
  const [tenantCode, setTenantCode] = useState("H.01");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // khớp pattern email seed: prefix@<code bỏ dấu chấm ĐẦU TIÊN, thường>.nhg.local
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
        title={<><KeyRound size={15} /> Đăng nhập Studio (dev)</>}
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
              <input className="studio-input" value={email} placeholder={seedEmail("designer")}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy || !email}>
              <LogIn size={15} /> Vào
            </button>
          </div>
        </form>
        <div className="quick">
          {(["designer", "approver", "admin"] as const).map((p) => (
            <button key={p} className="btn ghost sm" disabled={busy}
              onClick={() => void doLogin(seedEmail(p))}>
              {p}@ ({p === "designer" ? "soạn" : p === "approver" ? "duyệt" : "tenant admin"})
            </button>
          ))}
        </div>
        {err && <div className="studio-msg err">{err}</div>}
      </Card>
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { session, ready } = useStudio();
  if (!ready) return null;
  if (!session) {
    return (
      <AppShell crumb={{ section: "Configuration Studio", page: "Đăng nhập" }}>
        <LoginCard />
      </AppShell>
    );
  }
  return <>{children}</>;
}

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <Gate>{children}</Gate>
    </StudioProvider>
  );
}
