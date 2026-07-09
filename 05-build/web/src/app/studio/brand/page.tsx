"use client";
/**
 * ① Brand Kit editor (Spec §13) — white-label runtime theming: sửa token trên DRAFT,
 * preview thấy ngay (CSS custom properties, không build lại); publish (SoD) xong
 * resolver public /brand-kit/resolve mới trả token mới cho toàn tenant.
 */
import { useEffect, useMemo, useState } from "react";
import { Palette, Save } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { BrandKitData, ConfigVersion } from "@/lib/api";

/** Token NHG DS cho phép override qua Brand Kit (giữ danh sách hẹp — an toàn). */
const EDITABLE_TOKENS: Array<{ key: string; label: string; fallback: string }> = [
  { key: "--nhg-primary", label: "Màu chính (primary)", fallback: "#037236" },
  { key: "--nhg-primary-hover", label: "Primary hover", fallback: "#025c2b" },
  { key: "--nhg-accent", label: "Màu nhấn (accent)", fallback: "#ED2024" },
];

export default function BrandKitPage() {
  const { call, versionId, setVersionId } = useStudio();
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const drafts = useMemo(() => versions.filter((v) => v.status === "draft" || v.status === "preview"), [versions]);
  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });

  useEffect(() => {
    call<ConfigVersion[]>("/config-versions").then(setVersions).catch(fail);
  }, [call]);

  useEffect(() => {
    if (!versionId) return;
    call<BrandKitData>(`/brand-kit?configVersionId=${versionId}`)
      .then((b) => {
        setDisplayName(b.displayName ?? "");
        setTokens((b.tokens ?? {}) as Record<string, string>);
      })
      .catch(fail);
  }, [versionId, call]);

  const save = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      await call("/brand-kit", {
        method: "PUT",
        // [F89] gửi cả chuỗi rỗng — BE hiểu "" = xoá tên (undefined mới là giữ nguyên)
        json: { configVersionId: versionId, displayName, tokens },
      });
      setMsg({ kind: "ok", text: "Đã lưu vào draft — publish (approver) để token có hiệu lực toàn tenant" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  // preview cục bộ: áp token lên đúng khối preview (không đụng app thật)
  const previewStyle = Object.fromEntries(
    EDITABLE_TOKENS.map((t) => [t.key, tokens[t.key] || t.fallback]),
  ) as React.CSSProperties;

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Brand Kit" }}>
      <div className="page-head">
        <div className="eyebrow">① Brand Kit — white-label</div>
        <h1>Thương hiệu tenant</h1>
        <p>Token ghi vào draft; hiệu lực thật sau khi <b>publish</b> (SoD). Trước đăng nhập app đọc qua resolver public.</p>
      </div>

      <div className="studio-toolbar">
        <div className="studio-field">
          <label>Config version (draft)</label>
          <select className="studio-select" value={versionId ?? ""}
            onChange={(e) => setVersionId(e.target.value || null)}>
            <option value="">— chọn —</option>
            {drafts.map((v) => <option key={v.id} value={v.id}>{v.label} ({v.status})</option>)}
          </select>
        </div>
        <button className="btn primary" disabled={busy || !versionId} onClick={() => void save()}>
          <Save size={15} /> Lưu vào draft
        </button>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <Card title={<><Palette size={15} /> Tokens</>} sub="Danh sách hẹp token cho phép override — an toàn a11y">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="studio-field">
              <label>Tên hiển thị (white-label)</label>
              <input className="studio-input" placeholder="Trường ABC — iPMS" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            {EDITABLE_TOKENS.map((t) => (
              <div key={t.key} className="studio-field">
                <label>{t.label} <code style={{ textTransform: "none" }}>{t.key}</code></label>
                <div className="row" style={{ gap: 8 }}>
                  <input type="color" value={tokens[t.key] || t.fallback}
                    onChange={(e) => setTokens({ ...tokens, [t.key]: e.target.value })}
                    style={{ width: 40, height: 34, border: "1px solid var(--nhg-border-default)", borderRadius: 8, background: "transparent" }} />
                  <input className="studio-input" style={{ flex: 1 }} value={tokens[t.key] ?? ""}
                    placeholder={t.fallback}
                    onChange={(e) => setTokens({ ...tokens, [t.key]: e.target.value })} />
                  {tokens[t.key] && (
                    <button className="btn ghost sm" onClick={() => {
                      const next = { ...tokens };
                      delete next[t.key];
                      setTokens(next);
                    }}>Mặc định</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Preview trực tiếp" sub="Áp token lên khối mẫu — publish xong toàn app đổi theo">
          <div style={previewStyle}>
            <div className="card" style={{ borderColor: "var(--nhg-primary)" }}>
              <div style={{ fontWeight: 700, color: "var(--nhg-primary)", marginBottom: 6 }}>
                {displayName || "NHG iPMS"}
              </div>
              <p style={{ fontSize: 12.5, marginBottom: 10 }}>
                Scorecard Q3 — Chuyên viên Tuyển sinh · <Badge tone="green">FINAL</Badge>
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm">Hành động chính</button>
                <button className="btn accent sm">Cảnh báo</button>
                <button className="btn ghost sm">Phụ</button>
              </div>
              <div className="progress" style={{ marginTop: 12 }}>
                <span style={{ width: "72%", background: "var(--nhg-primary)" }} />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
