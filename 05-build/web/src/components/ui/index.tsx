import { ReactNode } from "react";

export function Card({ children, className = "", title, sub }:
  { children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`card ${className}`}>
      {title && <div className="card-title">{title}</div>}
      {sub && <div className="card-sub">{sub}</div>}
      {children}
    </div>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Stat({ value, label, delta, dir, tone = "" }:
  { value: string; label: string; delta?: string; dir?: "up" | "down"; tone?: string }) {
  return (
    <div className="card stat">
      <div className={`v ${tone}`}>{value}</div>
      <div className="l">{label}</div>
      {delta && <div className={`d ${dir ?? ""}`}>{delta}</div>}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "warn" | "danger" }) {
  return (
    <div className={`progress ${tone ?? ""}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function statusTone(s: string) {
  if (s === "on" || s === "done") return "green";
  if (s === "watch") return "amber";
  return "red";
}
export function statusLabel(s: string) {
  return { on: "Đúng tiến độ", watch: "Cần theo dõi", off: "Lệch chuẩn", done: "Hoàn thành" }[s] ?? s;
}
