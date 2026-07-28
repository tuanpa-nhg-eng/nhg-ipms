"use client";
/**
 * [Trục B L4 — J13] Banner đóng vai — cố định TOÀN MÀN, KHÔNG TẮT ĐƯỢC (không có nút đóng
 * nào ngoài "Thoát" — thứ THỰC SỰ kết thúc phiên, không phải chỉ ẩn UI). Mount MỘT LẦN ở
 * root layout (cùng khuôn `CopilotMount`/`AgentPanel`): đọc thẳng sessionStorage, không qua
 * `useStudio()`, để hiện được trên MỌI trang kể cả trang ngoài cây StudioProvider.
 */
import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { endImpersonation, getImpersonation, ImpersonationState, onImpersonationChange } from "@/lib/impersonation";

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ImpersonationBanner() {
  const [imp, setImp] = useState<ImpersonationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0); // buộc re-render mỗi giây để đếm ngược

  useEffect(() => {
    setImp(getImpersonation());
    const off = onImpersonationChange(() => setImp(getImpersonation()));
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => { off(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    // Đẩy nội dung xuống khi banner hiện — style toàn cục, không cần khoan qua AppShell.
    document.body.classList.toggle("nhg-impersonating", !!imp);
    return () => document.body.classList.remove("nhg-impersonating");
  }, [imp]);

  if (!imp) return null;

  const exit = async () => {
    setBusy(true);
    await endImpersonation();
    // reload cứng — chắc chắn MỌI phần của app (kể cả state cục bộ trong các trang đang mở)
    // quay lại đúng phiên gốc, không cần liệt kê từng nơi tự đọc session để tự cập nhật.
    window.location.reload();
  };

  return (
    <div className="impersonation-banner" role="alert">
      <ShieldAlert size={16} />
      <span>
        Bạn đang xem với tư cách <b>{imp.targetEmail}</b> · CHỈ ĐỌC · còn {timeLeft(imp.expiresAt)}
      </span>
      <button className="btn accent sm" disabled={busy} onClick={() => void exit()}>
        <LogOut size={13} /> {busy ? "Đang thoát…" : "Thoát"}
      </button>
    </div>
  );
}
