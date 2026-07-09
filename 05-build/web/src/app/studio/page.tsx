"use client";
/**
 * Config Versions + Publish bar (Spec §13) — draft → diff → publish → rollback.
 * SoD hiển thị đúng lỗi API (designer publish → 403, người giữ cả 2 quyền → 409).
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, GitBranch, History, LogOut, Plus, Rocket, ScrollText, Undo2,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { ConfigVersion, DiffSummary } from "@/lib/api";

const STATUS_TONE: Record<string, string> = {
  draft: "amber", preview: "amber", published: "green", archived: "gray",
};

export default function StudioVersionsPage() {
  const { session, logout, call, versionId, setVersionId } = useStudio();
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setVersions(await call<ConfigVersion[]>("/config-versions"));
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }, [call]);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      await reload();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell crumb={{ section: "Configuration Studio", page: "Config Versions" }}>
      <div className="page-head">
        <div className="eyebrow">Config-as-Data (#1)</div>
        <h1>Phiên bản cấu hình</h1>
        <p>
          draft → diff → publish (SoD Designer ⟂ Approver) → rollback ·
          Phiên: <b>{session?.email}</b> @ {session?.tenantCode}
          <button className="btn ghost sm" style={{ marginLeft: 10 }} onClick={logout}>
            <LogOut size={13} /> Đổi phiên
          </button>
        </p>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="studio-grid">
        <Card title={<><History size={15} /> Danh sách version</>}>
          <div className="studio-toolbar">
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Label draft mới</label>
              <input className="studio-input" value={label}
                placeholder="vd: tuyen-sinh-2026-q3"
                onChange={(e) => setLabel(e.target.value)} />
            </div>
            <button className="btn primary sm" disabled={busy || !label}
              onClick={() => run(async () => {
                const v = await call<ConfigVersion>("/config-versions", { method: "POST", json: { label } });
                setVersionId(v.id);
                setLabel("");
              }, "Đã tạo draft — chọn làm version làm việc")}>
              <Plus size={14} /> Tạo draft
            </button>
          </div>

          <table className="table">
            <thead>
              <tr><th>Label</th><th>Trạng thái</th><th className="rt">v</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} style={versionId === v.id ? { background: "var(--nhg-primary-subtle)" } : undefined}>
                  <td>
                    <b>{v.label}</b>
                    {versionId === v.id && <Badge tone="green"><CheckCircle2 size={11} /> đang làm việc</Badge>}
                    {v.note && <div style={{ fontSize: 11, color: "var(--nhg-text-secondary)" }}>{v.note}</div>}
                  </td>
                  <td><Badge tone={STATUS_TONE[v.status] ?? "gray"}>{v.status}</Badge></td>
                  <td className="rt">{v.version}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {(v.status === "draft" || v.status === "preview") && (
                        <button className="btn ghost sm" onClick={() => setVersionId(v.id)}>
                          <GitBranch size={13} /> Chọn
                        </button>
                      )}
                      <button className="btn ghost sm" disabled={busy}
                        onClick={() => run(async () => setDiff(await call<DiffSummary>(`/config-versions/${v.id}/diff`)), "Đã tải diff")}>
                        <ScrollText size={13} /> Diff
                      </button>
                      {(v.status === "draft" || v.status === "preview") && (
                        <button className="btn primary sm" disabled={busy}
                          onClick={() => run(() => call(`/config-versions/${v.id}/publish`, {
                            method: "POST", json: { version: v.version },
                          }), `Đã publish '${v.label}'`)}>
                          <Rocket size={13} /> Publish
                        </button>
                      )}
                      {(v.status === "published" || v.status === "archived") && (
                        <button className="btn ghost sm" disabled={busy}
                          onClick={() => {
                            const l = window.prompt("Label cho draft rollback:", `${v.label}-rollback`);
                            if (l) void run(() => call(`/config-versions/${v.id}/rollback`, {
                              method: "POST", json: { label: l },
                            }), "Đã tạo draft rollback");
                          }}>
                          <Undo2 size={13} /> Rollback
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {versions.length === 0 && (
                <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>
                  Chưa có version — tạo draft đầu tiên để bắt đầu cấu hình.
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Diff / Change-set" sub={diff ? `${diff.configVersion.label} — ${diff.changes.length} thay đổi` : "Chọn Diff ở một version"}>
          {diff && (
            <>
              <table className="table">
                <thead><tr><th>Entity</th><th className="rt">create</th><th className="rt">update</th><th className="rt">khác</th></tr></thead>
                <tbody>
                  {Object.entries(diff.summary).map(([et, s]) => (
                    <tr key={et}>
                      <td>{et}</td>
                      <td className="rt">{s.create}</td>
                      <td className="rt">{s.update}</td>
                      <td className="rt">{s.delete + s.move}</td>
                    </tr>
                  ))}
                  {Object.keys(diff.summary).length === 0 && (
                    <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>Version chưa có thay đổi nào.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
