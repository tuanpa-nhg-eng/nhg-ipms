"use client";
/**
 * [Trục B L4] Trạng thái phiên đóng vai — SessionStorage RIÊNG, tách khỏi phiên đăng nhập
 * thật (`nhg-studio-session`) để "Thoát" quay lại phiên gốc NGAY, không phải đăng nhập lại.
 *
 * Đọc trực tiếp sessionStorage (không qua React context `useStudio()`): banner phải hiện
 * TRÊN MỌI TRANG kể cả trang không nằm trong cây StudioProvider (mount ở root layout, cùng
 * khuôn `CopilotMount`/`AgentPanel` đã dùng cho đúng lý do này — xem ghi chú ở đó).
 */
import { API_BASE, ApiError } from "./api";

const SS_KEY = "nhg-impersonation-session";
const CHANGE_EVENT = "nhg-impersonation-changed";

export interface ImpersonationState {
  token: string;
  tenantId: string;
  targetEmail: string;
  expiresAt: string; // ISO — chỉ để HIỂN THỊ đếm ngược; server là nơi enforce TTL thật
  sessionId: string;
}

export function getImpersonation(): ImpersonationState | null {
  try {
    const s = sessionStorage.getItem(SS_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function setImpersonation(state: ImpersonationState | null) {
  if (state) sessionStorage.setItem(SS_KEY, JSON.stringify(state));
  else sessionStorage.removeItem(SS_KEY);
  // 'storage' event chỉ bắn sang tab KHÁC — cùng tab phải tự báo cho banner biết ngay.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Gọi bằng phiên THẬT (session gốc, không phải token đóng vai) — cần user:impersonate. */
export async function startImpersonation(
  callerSession: { token: string; tenantId: string },
  targetUserId: string,
  reason: string,
): Promise<ImpersonationState> {
  const res = await fetch(`${API_BASE}/admin/impersonation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${callerSession.token}`,
      "X-Tenant-Id": callerSession.tenantId,
    },
    body: JSON.stringify({ targetUserId, reason }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      if (Array.isArray(message)) message = message.join("; ");
    } catch {}
    throw new ApiError(res.status, String(message));
  }
  const body = await res.json();
  const state: ImpersonationState = {
    token: body.token, tenantId: callerSession.tenantId,
    targetEmail: body.targetEmail, expiresAt: body.expiresAt, sessionId: body.sessionId,
  };
  setImpersonation(state);
  return state;
}

/**
 * Kết thúc phiên. [Chủ đích] Luôn xoá state cục bộ dù gọi API thất bại (mất mạng…) — người
 * dùng không được phép bị KẸT trong banner vì một lỗi mạng; phiên phía server vẫn tự hết
 * hạn theo TTL 30 phút dù endpoint kết thúc sớm không gọi được.
 */
export async function endImpersonation(): Promise<void> {
  const cur = getImpersonation();
  if (!cur) return;
  try {
    await fetch(`${API_BASE}/admin/impersonation/current`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cur.token}`, "X-Tenant-Id": cur.tenantId },
    });
  } catch {
    // xem ghi chú đầu hàm — không để lỗi mạng khoá người dùng trong phiên
  } finally {
    setImpersonation(null);
  }
}

export function onImpersonationChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
