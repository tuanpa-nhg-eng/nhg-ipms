"use client";
/**
 * StudioProvider — phiên làm việc Configuration Studio (nối API thật, khác phần
 * mock còn lại của app): session dev-token + config version đang chọn.
 * Session giữ ở sessionStorage (đóng tab là hết — token dev 8h không nên nằm lâu).
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from "react";
import { apiFetch, devLogin, StudioSession } from "./api";
import { getImpersonation, onImpersonationChange } from "./impersonation";

const SS_KEY = "nhg-studio-session";
const VER_KEY = "nhg-studio-version";

interface StudioCtx {
  session: StudioSession | null;
  ready: boolean;
  login: (tenantCode: string, email: string) => Promise<void>;
  logout: () => void;
  versionId: string | null;
  setVersionId: (id: string | null) => void;
  /**
   * fetch đã gắn sẵn session hiện tại — [Trục B L4] khi có phiên đóng vai active
   * (sessionStorage riêng, xem lib/impersonation.ts), TỰ ĐỘNG dùng token đóng vai thay vì
   * session gốc. Mọi trang gọi `call()` (không riêng /admin/users) đều thấy đúng những gì
   * người bị đóng vai thấy — đây là cách "browse cả app dưới góc nhìn của họ" hoạt động,
   * không cần sửa từng trang riêng lẻ.
   */
  call: <T>(path: string, init?: Parameters<typeof apiFetch>[2]) => Promise<T>;
  /** [J4] true khi đang trong một phiên đóng vai — trang gọi để ẩn hành động không hợp lý
   *  (vd không hiện nút "Đóng vai" MỚI trong khi đang đóng vai người khác). */
  impersonating: boolean;
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [versionId, setVersionIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SS_KEY);
      if (s) setSession(JSON.parse(s));
      const v = sessionStorage.getItem(VER_KEY);
      if (v) setVersionIdState(v);
    } catch {}
    setImpersonating(!!getImpersonation());
    setReady(true);
    return onImpersonationChange(() => setImpersonating(!!getImpersonation()));
  }, []);

  const login = useCallback(async (tenantCode: string, email: string) => {
    const s = await devLogin(tenantCode, email);
    sessionStorage.setItem(SS_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SS_KEY);
    sessionStorage.removeItem(VER_KEY);
    setSession(null);
    setVersionIdState(null);
  }, []);

  const setVersionId = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem(VER_KEY, id);
    else sessionStorage.removeItem(VER_KEY);
    setVersionIdState(id);
  }, []);

  const call = useCallback(
    <T,>(path: string, init?: Parameters<typeof apiFetch>[2]) => {
      const imp = getImpersonation();
      const effective: StudioSession | null = imp
        ? { token: imp.token, tenantId: imp.tenantId, tenantCode: session?.tenantCode ?? "", email: imp.targetEmail }
        : session;
      return apiFetch<T>(effective, path, init);
    },
    [session],
  );

  const value = useMemo(
    () => ({ session, ready, login, logout, versionId, setVersionId, call, impersonating }),
    [session, ready, login, logout, versionId, setVersionId, call, impersonating],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio phải nằm trong StudioProvider");
  return ctx;
}
