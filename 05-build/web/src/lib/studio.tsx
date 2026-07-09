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

const SS_KEY = "nhg-studio-session";
const VER_KEY = "nhg-studio-version";

interface StudioCtx {
  session: StudioSession | null;
  ready: boolean;
  login: (tenantCode: string, email: string) => Promise<void>;
  logout: () => void;
  versionId: string | null;
  setVersionId: (id: string | null) => void;
  /** fetch đã gắn sẵn session hiện tại */
  call: <T>(path: string, init?: Parameters<typeof apiFetch>[2]) => Promise<T>;
}

const Ctx = createContext<StudioCtx | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const [versionId, setVersionIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(SS_KEY);
      if (s) setSession(JSON.parse(s));
      const v = sessionStorage.getItem(VER_KEY);
      if (v) setVersionIdState(v);
    } catch {}
    setReady(true);
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
    <T,>(path: string, init?: Parameters<typeof apiFetch>[2]) =>
      apiFetch<T>(session, path, init),
    [session],
  );

  const value = useMemo(
    () => ({ session, ready, login, logout, versionId, setVersionId, call }),
    [session, ready, login, logout, versionId, setVersionId, call],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio phải nằm trong StudioProvider");
  return ctx;
}
