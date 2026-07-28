"use client";
/**
 * [Trục B — L3] "Cơ cấu tổ chức" — mốc demo của cả trục: sau màn này, một người thật
 * được tạo ở /admin/users → xếp vào phòng → gán người quản lý, TỪ GIAO DIỆN, không chạm
 * terminal. Đếm người/đơn vị, đổi tên/cha, gán quản lý, tạo/lưu trữ đơn vị.
 *
 * [F121 TRẢ NỢ] Chuyển phòng ở /admin/users tự thu hồi authoring_grant của phòng cũ —
 * hook nằm ở BE (admin-users.service.ts), không phải ở màn này; ghi chú ở đây để người
 * đọc màn Cơ cấu tổ chức biết luồng chuyển phòng có tác dụng phụ đã được xử lý.
 *
 * Bất biến giữ nguyên: J4 (không hiện hành động API sẽ 403 — nút Tạo/Lưu/Lưu trữ ẩn theo
 * can()) · cảnh báo tường minh `affectedGrants` khi đổi cha (không suy diễn im lặng).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, FolderTree, UserCog, Archive, Plus, RefreshCw, Save, Info, ShieldAlert, ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import { AdminUserListResponse, AdminUserRow, MeResponse, OrgTreeNode, OrgUnit } from "@/lib/api";

const ORG_LEVELS = ["group", "bu", "department", "team"] as const;
const LEVEL_LABEL: Record<string, string> = { group: "Tập đoàn", bu: "Khối", department: "Phòng", team: "Tổ" };

function flatten(node: OrgTreeNode, depth: number, out: Array<{ node: OrgTreeNode; depth: number }>) {
  out.push({ node, depth });
  for (const c of node.children) flatten(c, depth + 1, out);
}

export default function AdminOrgPage() {
  const { call } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tree, setTree] = useState<OrgTreeNode | null>(null);
  const [allUnits, setAllUnits] = useState<OrgUnit[]>([]);
  const [people, setPeople] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<OrgTreeNode | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [editNameVi, setEditNameVi] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [editManagerId, setEditManagerId] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newNameVi, setNewNameVi] = useState("");
  const [newLevel, setNewLevel] = useState<string>("team");
  const [newParentId, setNewParentId] = useState("");

  const [archiveArmed, setArchiveArmed] = useState(false);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });
  const can = (p: string) => !!me?.permissions?.includes(p);

  const rows = useMemo(() => {
    if (!tree) return [];
    const out: Array<{ node: OrgTreeNode; depth: number }> = [];
    flatten(tree, 0, out);
    return out;
  }, [tree]);

  const reload = useCallback(async () => {
    try {
      const [m, units, ppl] = await Promise.all([
        call<MeResponse>("/me"),
        call<OrgUnit[]>("/org-units"),
        call<AdminUserListResponse>("/admin/users?limit=200").catch(() => ({ entries: [], nextCursor: null, capped: false })),
      ]);
      setMe(m);
      setAllUnits(units);
      setPeople(ppl.entries);
      const root = units.find((u) => !u.parentId) ?? units[0];
      if (root) {
        const t = await call<OrgTreeNode>(`/org-units/${root.id}/tree`);
        setTree(t);
        // giữ lựa chọn hiện tại nếu còn tồn tại, không thì chọn root
        setSelected((prev) => {
          if (!prev) return t;
          const found = findNode(t, prev.id);
          return found ?? t;
        });
      }
    } catch (e) { fail(e); }
  }, [call]);
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const findNode = (node: OrgTreeNode, id: string): OrgTreeNode | null => {
    if (node.id === id) return node;
    for (const c of node.children) { const f = findNode(c, id); if (f) return f; }
    return null;
  };

  const selectNode = (node: OrgTreeNode) => {
    setSelected(node);
    setEditNameVi(node.nameVi);
    setEditNameEn(node.nameEn ?? "");
    setEditParentId(node.parentId ?? "");
    setEditManagerId(node.managerId ?? "");
    setArchiveArmed(false);
    setMsg(null);
  };

  const act = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ kind: "ok", text: ok }); return true; }
    catch (e) { fail(e); return false; }
    finally { setBusy(false); }
  };

  const savePatch = (patch: Record<string, unknown>, ok: string) => {
    if (!selected) return;
    void act(async () => {
      const r = await call<OrgUnit & { affectedGrants?: number }>(`/org-units/${selected.id}`, {
        method: "PATCH",
        json: { ...patch, version: selected.version },
      });
      if (typeof r.affectedGrants === "number" && r.affectedGrants > 0) {
        setMsg({
          kind: "ok",
          text: `${ok} — LƯU Ý: ${r.affectedGrants} vai đang cấp scope=đơn vị này. Di chuyển KHÔNG tự đổi phạm vi các vai đó (rà lại thủ công nếu cần).`,
        });
      }
      await reload();
    }, ok);
  };

  const saveProfile = () => savePatch({ nameVi: editNameVi, nameEn: editNameEn || undefined }, "Đã lưu đơn vị");
  const saveParent = () => savePatch({ parentId: editParentId || null }, "Đã đổi đơn vị cha");
  const saveManager = () => savePatch({ managerId: editManagerId || null }, "Đã gán người quản lý");

  const doArchive = () => {
    if (!selected) return;
    if (!archiveArmed) { setArchiveArmed(true); return; }
    void act(async () => {
      await call(`/org-units/${selected.id}`, { method: "DELETE" });
      setArchiveArmed(false);
      setSelected(null);
      await reload();
    }, "Đã lưu trữ đơn vị");
  };

  const doCreate = () => {
    if (!newCode || !newNameVi) return;
    void act(async () => {
      await call("/org-units", {
        method: "POST",
        json: { code: newCode, nameVi: newNameVi, level: newLevel, parentId: newParentId || undefined },
      });
      setShowCreate(false);
      setNewCode(""); setNewNameVi(""); setNewLevel("team"); setNewParentId("");
      await reload();
    }, `Đã tạo đơn vị ${newNameVi}`);
  };

  return (
    <AppShell crumb={{ section: "Quản trị đơn vị", page: "Cơ cấu tổ chức" }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">🎯 Mốc demo trục B · onboard người thật trọn vòng từ giao diện</div>
          <h1>Cơ cấu tổ chức</h1>
          <p>Đếm người theo đơn vị · đổi tên/cha · gán người quản lý · tạo/lưu trữ đơn vị.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" disabled={busy} onClick={() => void reload()}>
            <RefreshCw size={13} /> Làm mới
          </button>
          {can("org:write") ? (
            <button className="btn primary sm" disabled={busy} onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} /> Tạo đơn vị
            </button>
          ) : (
            <span className="row tiny muted" style={{ gap: 6 }}><ShieldAlert size={13} /> Cần org:write</span>
          )}
        </div>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      {showCreate && (
        <Card title={<><Plus size={15} /> Tạo đơn vị mới</>}>
          <div className="studio-toolbar" style={{ flexWrap: "wrap" }}>
            <div className="studio-field">
              <label>Mã đơn vị</label>
              <input className="studio-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="ADMISSIONS-2" />
            </div>
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Tên</label>
              <input className="studio-input" value={newNameVi} onChange={(e) => setNewNameVi(e.target.value)} placeholder="Phòng Tuyển sinh 2" />
            </div>
            <div className="studio-field">
              <label>Cấp</label>
              <select className="studio-select" value={newLevel} onChange={(e) => setNewLevel(e.target.value)}>
                {ORG_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
            </div>
            <div className="studio-field">
              <label>Đơn vị cha</label>
              <select className="studio-select" value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
                <option value="">— gốc —</option>
                {allUnits.map((u) => <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>)}
              </select>
            </div>
            <button className="btn primary sm" disabled={busy || !newCode || !newNameVi} onClick={() => void doCreate()}>
              Tạo
            </button>
          </div>
        </Card>
      )}

      <div className="studio-grid">
        <div>
          <Card title={<><FolderTree size={15} /> Cây tổ chức</>}>
            <table className="table">
              <thead><tr><th>Đơn vị</th><th className="rt">Người</th><th>Quản lý</th></tr></thead>
              <tbody>
                {rows.map(({ node, depth }) => (
                  <tr key={node.id}
                    className={selected?.id === node.id ? "row-selected" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => selectNode(node)}>
                    <td style={{ paddingLeft: 8 + depth * 18 }}>
                      {depth > 0 && <ChevronRight size={12} style={{ verticalAlign: "middle", opacity: .5 }} />}
                      {node.nameVi} <span className="tiny muted">({node.code})</span>
                    </td>
                    <td className="rt">
                      {node.personCount > 0 ? <Badge tone="info">{node.personCount}</Badge> : <span className="tiny muted">0</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{node.managerName ?? <span className="tiny muted">— chưa gán —</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="tiny muted">Đang tải cây tổ chức…</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          {!selected ? (
            <Card title={<><Info size={15} /> Chi tiết</>}>
              <p className="tiny muted">Chọn một đơn vị ở cây bên trái.</p>
            </Card>
          ) : (
            <>
              <Card title={<><Building2 size={15} /> {selected.nameVi}</>}
                sub={`${selected.code} · ${LEVEL_LABEL[selected.level] ?? selected.level} · ${selected.personCount} người`}>
                <div className="studio-field">
                  <label>Tên (VI)</label>
                  <input className="studio-input" value={editNameVi} onChange={(e) => setEditNameVi(e.target.value)} disabled={!can("orgunit:update")} />
                </div>
                <div className="studio-field">
                  <label>Tên (EN)</label>
                  <input className="studio-input" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} disabled={!can("orgunit:update")} />
                </div>
                {can("orgunit:update") && (
                  <button className="btn primary sm" disabled={busy} onClick={() => void saveProfile()}>
                    <Save size={13} /> Lưu tên
                  </button>
                )}

                <div style={{ height: 10 }} />
                <div className="studio-field">
                  <label>Đơn vị cha</label>
                  <select className="studio-select" value={editParentId} onChange={(e) => setEditParentId(e.target.value)} disabled={!can("orgunit:update")}>
                    <option value="">— gốc (không có cha) —</option>
                    {allUnits.filter((u) => u.id !== selected.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>
                    ))}
                  </select>
                </div>
                {can("orgunit:update") && (
                  <button className="btn ghost sm" disabled={busy || editParentId === (selected.parentId ?? "")} onClick={() => void saveParent()}>
                    Đổi đơn vị cha
                  </button>
                )}

                <div style={{ height: 10 }} />
                <div className="studio-field">
                  <label><UserCog size={12} /> Người quản lý</label>
                  <select className="studio-select" value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} disabled={!can("orgunit:update")}>
                    <option value="">— chưa gán —</option>
                    {people.map((p) => <option key={p.personId} value={p.personId}>{p.fullName} ({p.employeeCode})</option>)}
                  </select>
                </div>
                {can("orgunit:update") && (
                  <button className="btn ghost sm" disabled={busy || editManagerId === (selected.managerId ?? "")} onClick={() => void saveManager()}>
                    <UserCog size={13} /> Gán quản lý
                  </button>
                )}

                <div style={{ height: 14 }} />
                {can("orgunit:archive") ? (
                  selected.personCount > 0 || selected.children.length > 0 ? (
                    <span className="row tiny muted" style={{ gap: 6 }}>
                      <ShieldAlert size={13} /> Còn {selected.personCount} người / {selected.children.length} đơn vị con — không lưu trữ được
                    </span>
                  ) : (
                    <div className="row" style={{ gap: 8 }}>
                      <button className={`btn sm ${archiveArmed ? "accent" : "ghost"}`} disabled={busy} onClick={doArchive}>
                        <Archive size={13} /> {archiveArmed ? "Xác nhận lưu trữ" : "Lưu trữ đơn vị…"}
                      </button>
                      {archiveArmed && <button className="btn ghost sm" onClick={() => setArchiveArmed(false)}>Huỷ</button>}
                    </div>
                  )
                ) : (
                  <span className="row tiny muted" style={{ gap: 6 }}><ShieldAlert size={13} /> Cần orgunit:archive</span>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
