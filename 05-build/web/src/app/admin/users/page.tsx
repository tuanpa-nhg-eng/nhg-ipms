"use client";
/**
 * [Trục B — L2] "Người dùng & Vai trò" — màn quan trọng nhất của trục. Trước trục B,
 * KHÔNG một màn nào tạo được người dùng/gán được vai/sửa được cơ cấu; sản phẩm chạy
 * đúng cho 12 tài khoản seed sẵn. Đây là nơi H.01 tự thêm người vào được TỪ GIAO DIỆN.
 *
 * Bất biến giữ nguyên từ hợp đồng API (L1):
 *  - J4: hộp thoại gán vai chỉ liệt kê role mà GET /admin/roles TRẢ VỀ — không tự đoán
 *    theo role code, không hiện lựa chọn sẽ bị 403.
 *  - J5: hireDate/seniorityMonths chỉ xuất hiện khi BE trả (scope tenant) — không suy
 *    diễn giá trị rỗng thành "0 tháng"; ẩn hẳn ô đó nếu BE không gửi trường.
 *  - I4 (khuôn "Xuất bảng lương"): khoá tài khoản / thu hồi vai là nút NGUY HIỂM — accent
 *    + xác nhận 2 bước, không xác nhận bằng window.confirm (không audit được thao tác đó).
 *  - I3: nút khoá kèm LÝ DO khi caller không đủ quyền hoặc thao tác không hợp lệ (tự khoá
 *    chính mình, tự gán vai cho mình) — không để bấm rồi ăn 403 từ máy chủ.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, Search, ShieldPlus, ShieldMinus, Lock, LockOpen,
  RefreshCw, Save, Info, ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Card } from "@/components/ui";
import { useStudio } from "@/lib/studio";
import {
  AdminRoleOption, AdminUserListResponse, AdminUserRow, EffectiveAccessResponse,
  MeResponse, OrgUnit,
} from "@/lib/api";

const STATUS_TONE: Record<string, string> = { active: "green", disabled: "red" };

export default function AdminUsersPage() {
  const { call, session } = useStudio();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [capped, setCapped] = useState(false);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [roleOptions, setRoleOptions] = useState<AdminRoleOption[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [access, setAccess] = useState<EffectiveAccessResponse | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // bộ lọc
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // form sửa hồ sơ
  const [editFullName, setEditFullName] = useState("");
  const [editOrgUnitId, setEditOrgUnitId] = useState("");
  const [editManagerId, setEditManagerId] = useState("");

  // form gán vai
  const [grantRoleCode, setGrantRoleCode] = useState("");
  const [grantScopeType, setGrantScopeType] = useState<"tenant" | "org_unit" | "self">("self");
  const [grantScopeId, setGrantScopeId] = useState("");

  // form tạo mới — "1 bước" theo kế hoạch: hồ sơ + phòng + quản lý + vai trò khởi tạo.
  // Vai trò khởi tạo là LỆNH THỨ HAI dưới mui xe (POST /admin/users/:id/roles ngay sau
  // khi tạo) — L1 cố ý KHÔNG gộp gán vai vào chính POST /admin/users (hai việc khác permission,
  // khác audit action) nhưng người dùng trải nghiệm như MỘT bước.
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newOrgUnitId, setNewOrgUnitId] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");

  // xác nhận 2 bước (khuôn I4) — reset khi đổi người đang chọn
  const [disableArmed, setDisableArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);

  const fail = (e: unknown) => setMsg({ kind: "err", text: (e as Error).message });
  const can = (p: string) => !!me?.permissions?.includes(p);
  const hasTenantScope = useMemo(
    () => me?.scopes?.some((s) => s.scopeType === "tenant") ?? false,
    [me],
  );
  // [J4] org_unit trong phạm vi CHÍNH NGƯỜI GỌI — hộp chọn scope gán vai không hiện
  // đơn vị mà API sẽ từ chối (org_admin chỉ thấy phòng của mình).
  const myOrgUnitIds = useMemo(
    () => new Set((me?.scopes ?? []).filter((s) => s.scopeType === "org_unit" && s.scopeId).map((s) => s.scopeId as string)),
    [me],
  );
  const scopeOrgOptions = hasTenantScope ? orgUnits : orgUnits.filter((u) => myOrgUnitIds.has(u.id));

  const orgLabel = useCallback(
    (id?: string | null) => {
      if (!id) return "—";
      const u = orgUnits.find((x) => x.id === id);
      return u ? `${u.nameVi} (${u.code})` : id;
    },
    [orgUnits],
  );
  const personLabel = useCallback(
    (personId?: string | null) => {
      if (!personId) return "—";
      const p = users.find((x) => x.personId === personId);
      return p ? `${p.fullName} (${p.employeeCode})` : personId;
    },
    [users],
  );

  // Trả về entries vừa nạp — callers cần dữ liệu MỚI NGAY (vd cập nhật `selected` sau khi
  // sửa) không thể dựa vào `users` trong closure vì setState không đồng bộ.
  const reloadUsers = useCallback(async (): Promise<AdminUserRow[]> => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (orgFilter) params.set("orgUnitId", orgFilter);
    if (statusFilter) params.set("status", statusFilter);
    const r = await call<AdminUserListResponse>(`/admin/users?${params.toString()}`);
    setUsers(r.entries);
    setCapped(r.capped);
    return r.entries;
  }, [call, q, orgFilter, statusFilter]);

  const reloadAll = useCallback(async () => {
    try {
      const [m, org] = await Promise.all([
        call<MeResponse>("/me"),
        call<OrgUnit[]>("/org-units"),
      ]);
      setMe(m);
      setOrgUnits(org);
      await reloadUsers();
      // roles cấp được — chỉ ai giữ role:read mới gọi được, tránh 403 vô ích trên màn
      if (m.permissions?.includes("role:read")) {
        setRoleOptions(await call<AdminRoleOption[]>("/admin/roles"));
      }
    } catch (e) { fail(e); }
  }, [call, reloadUsers]);
  useEffect(() => { void reloadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reloadUsers().catch(fail); }, [q, orgFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setMsg(null); setBusy(true);
    try { await fn(); setMsg({ kind: "ok", text: ok }); return true; }
    catch (e) { fail(e); return false; }
    finally { setBusy(false); }
  };

  const selectUser = async (u: AdminUserRow) => {
    setSelected(u);
    setDisableArmed(false); setRevokeArmed(null);
    setEditFullName(u.fullName);
    setEditOrgUnitId(u.orgUnitId ?? "");
    setEditManagerId(u.managerId ?? "");
    setGrantRoleCode(""); setGrantScopeType("self"); setGrantScopeId("");
    setAccess(null);
    if (!u.appUserId) return;
    try {
      setAccess(await call<EffectiveAccessResponse>(`/admin/users/${u.appUserId}/effective-access`));
    } catch (e) { fail(e); }
  };

  // Nạp lại access CỦA NGƯỜI ĐANG CHỌN — dùng appUserId chốt tại thời điểm gọi (tham số,
  // không đọc `selected` qua closure) để tránh race nếu người dùng đổi lựa chọn giữa lúc chờ.
  const refreshAccess = async (appUserId: string) => {
    try { setAccess(await call<EffectiveAccessResponse>(`/admin/users/${appUserId}/effective-access`)); }
    catch (e) { fail(e); }
  };

  const saveProfile = () => {
    if (!selected?.appUserId) return;
    const appUserId = selected.appUserId;
    void act(async () => {
      const updated = await call<AdminUserRow>(`/admin/users/${appUserId}`, {
        method: "PATCH",
        json: {
          fullName: editFullName || undefined,
          orgUnitId: editOrgUnitId || undefined,
          managerId: editManagerId || null,
          version: selected.version,
        },
      });
      setSelected(updated); // BE trả ĐÚNG shape AdminUserRow (whitelist J5) — không tự suy
      await reloadUsers();
    }, "Đã lưu hồ sơ");
  };

  const doDisable = () => {
    if (!selected?.appUserId) return;
    const appUserId = selected.appUserId;
    if (!disableArmed) { setDisableArmed(true); return; }
    void act(async () => {
      await call(`/admin/users/${appUserId}/disable`, { method: "POST" });
      setDisableArmed(false);
      setSelected((p) => (p ? { ...p, status: "disabled" } : p));
      await reloadUsers();
    }, "Đã khoá tài khoản");
  };
  const doEnable = () => {
    if (!selected?.appUserId) return;
    const appUserId = selected.appUserId;
    void act(async () => {
      await call(`/admin/users/${appUserId}/enable`, { method: "POST" });
      setSelected((p) => (p ? { ...p, status: "active" } : p));
      await reloadUsers();
    }, "Đã mở khoá tài khoản");
  };

  const doGrant = () => {
    if (!selected?.appUserId || !grantRoleCode) return;
    const appUserId = selected.appUserId;
    void act(async () => {
      await call(`/admin/users/${appUserId}/roles`, {
        method: "POST",
        json: {
          roleCode: grantRoleCode, scopeType: grantScopeType,
          ...(grantScopeType === "org_unit" ? { scopeId: grantScopeId } : {}),
        },
      });
      setGrantRoleCode(""); setGrantScopeId("");
      await refreshAccess(appUserId);
    }, "Đã gán vai");
  };

  const doRevoke = (userRoleId: string) => {
    if (!selected?.appUserId) return;
    const appUserId = selected.appUserId;
    if (revokeArmed !== userRoleId) { setRevokeArmed(userRoleId); return; }
    void act(async () => {
      await call(`/admin/users/${appUserId}/roles/${userRoleId}`, { method: "DELETE" });
      setRevokeArmed(null);
      await refreshAccess(appUserId);
    }, "Đã thu hồi vai");
  };

  const doCreate = () => {
    if (!newCode || !newName || !newEmail) return;
    const roleCode = newRoleCode; // chốt tại thời điểm bấm — form sẽ reset ngay sau khi tạo
    void act(async () => {
      const created = await call<{ appUserId: string; email: string }>("/admin/users", {
        method: "POST",
        json: {
          employeeCode: newCode, fullName: newName, email: newEmail,
          orgUnitId: newOrgUnitId || undefined, managerId: newManagerId || undefined,
        },
      });
      setShowCreate(false);
      setNewCode(""); setNewName(""); setNewEmail(""); setNewOrgUnitId(""); setNewManagerId(""); setNewRoleCode("");
      await reloadUsers();
      // [Vai trò khởi tạo — "1 bước" theo kế hoạch] Lệnh THỨ HAI ngay sau khi tạo. Nếu bước
      // này lỗi (vd role không nằm trong danh mục cấp được), người vẫn đã được TẠO thành
      // công — ném lỗi RÕ RÀNG để `act()` báo đúng, không lẫn vào một msg "thành công" đè lên.
      if (roleCode) {
        try {
          await call(`/admin/users/${created.appUserId}/roles`, {
            method: "POST", json: { roleCode, scopeType: "self" },
          });
        } catch (e) {
          throw new Error(`Đã tạo ${created.email} NHƯNG gán vai '${roleCode}' thất bại: ${(e as Error).message} — gán tay ở panel chi tiết.`);
        }
      }
    }, `Đã tạo — đăng nhập bằng email ${newEmail} (chưa có mật khẩu, dev-token nội bộ cho tới khi có Entra ID)`);
  };

  const isSelf = (u: AdminUserRow) => !!session?.userId && u.appUserId === session.userId;

  return (
    <AppShell crumb={{ section: "Quản trị đơn vị", page: "Người dùng & Vai trò" }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Trục B · onboard người thật từ giao diện, không chạm terminal</div>
          <h1>Người dùng &amp; Vai trò</h1>
          <p>Tạo hồ sơ · cấp tài khoản · gán vai theo phạm vi · khoá/mở khoá. Mọi thao tác được ghi vết kiểm toán.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" disabled={busy} onClick={() => void reloadUsers().catch(fail)}>
            <RefreshCw size={13} /> Làm mới
          </button>
          {can("user:invite") ? (
            <button className="btn primary sm" disabled={busy} onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={14} /> Tạo người dùng
            </button>
          ) : (
            <span className="row tiny muted" style={{ gap: 6 }}><Lock size={13} /> Cần user:invite</span>
          )}
        </div>
      </div>

      {msg && <div className={`studio-msg ${msg.kind}`}>{msg.text}</div>}

      {showCreate && (
        <Card title={<><UserPlus size={15} /> Tạo người dùng mới</>}
          sub="Chưa gửi email mời (chưa có SMTP) — người này đăng nhập bằng email + dev-token nội bộ cho tới khi có Entra ID.">
          <div className="studio-toolbar" style={{ flexWrap: "wrap" }}>
            <div className="studio-field">
              <label>Mã nhân viên</label>
              <input className="studio-input" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="H.01-NV099" />
            </div>
            <div className="studio-field">
              <label>Họ tên</label>
              <input className="studio-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
            <div className="studio-field" style={{ flex: 1 }}>
              <label>Email đăng nhập</label>
              <input className="studio-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="a.nguyen@h01.nhg.local" />
            </div>
            <div className="studio-field">
              <label>Phòng</label>
              <select className="studio-select" value={newOrgUnitId} onChange={(e) => setNewOrgUnitId(e.target.value)}>
                <option value="">— chưa xếp phòng —</option>
                {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>)}
              </select>
            </div>
            <div className="studio-field">
              <label>Người quản lý</label>
              <select className="studio-select" value={newManagerId} onChange={(e) => setNewManagerId(e.target.value)}>
                <option value="">— không có —</option>
                {users.map((u) => <option key={u.personId} value={u.personId}>{u.fullName} ({u.employeeCode})</option>)}
              </select>
            </div>
            <div className="studio-field">
              {/* [J4] vai KHỞI TẠO — cùng khuôn "chỉ hiện role được phép cấp" như panel gán vai */}
              <label>Vai khởi tạo (tuỳ chọn — gán ngay scope &quot;chính người này&quot;)</label>
              <select className="studio-select" value={newRoleCode} onChange={(e) => setNewRoleCode(e.target.value)}>
                <option value="">— để sau, gán ở panel chi tiết —</option>
                {roleOptions.map((r) => <option key={r.code} value={r.code}>{r.nameVi ?? r.code}</option>)}
              </select>
            </div>
            <button className="btn primary sm" disabled={busy || !newCode || !newName || !newEmail} onClick={() => void doCreate()}>
              Tạo
            </button>
          </div>
        </Card>
      )}

      <div className="studio-grid">
        {/* Cột trái: bộ lọc + bảng */}
        <div>
          <Card title={<><Users size={15} /> Danh sách</>}
            sub={capped ? "⚠ Danh sách vượt trần hiển thị — thu hẹp bộ lọc để thấy đủ." : undefined}>
            <div className="studio-toolbar" style={{ marginBottom: 10 }}>
              <div className="studio-field" style={{ flex: 1 }}>
                <label><Search size={11} /> Tìm tên / mã / email</label>
                <input className="studio-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="vd: Nguyễn, H.01-EMP1…" />
              </div>
              <div className="studio-field">
                <label>Phòng</label>
                <select className="studio-select" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                  <option value="">Tất cả (trong phạm vi của bạn)</option>
                  {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>)}
                </select>
              </div>
              <div className="studio-field">
                <label>Trạng thái</label>
                <select className="studio-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
            <table className="table">
              <thead><tr><th>Họ tên</th><th>Mã NV</th><th>Phòng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.personId}
                    className={selected?.personId === u.personId ? "row-selected" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => void selectUser(u)}>
                    <td>{u.fullName}{isSelf(u) && <span style={{ color: "var(--nhg-text-secondary)", fontSize: 11 }}> (bạn)</span>}</td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{u.employeeCode}</td>
                    <td style={{ fontSize: 12 }}>{orgLabel(u.orgUnitId)}</td>
                    <td><Badge tone={STATUS_TONE[u.status] ?? "gray"}>{u.status}</Badge></td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>
                    Không có người dùng nào khớp bộ lọc — hoặc ngoài phạm vi quản trị của bạn.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Cột phải: panel chi tiết */}
        <div>
          {!selected ? (
            <Card title={<><Info size={15} /> Chi tiết</>}>
              <p className="tiny muted">Chọn một người ở bảng bên trái để xem hồ sơ và quản lý vai trò.</p>
            </Card>
          ) : (
            <>
              <Card title={<>{selected.fullName}</>} sub={`${selected.employeeCode} · ${selected.email ?? "—"}`}>
                <div className="studio-field">
                  <label>Họ tên</label>
                  <input className="studio-input" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} disabled={!can("user:write")} />
                </div>
                <div className="studio-field">
                  <label>Phòng</label>
                  <select className="studio-select" value={editOrgUnitId} onChange={(e) => setEditOrgUnitId(e.target.value)} disabled={!can("user:write")}>
                    <option value="">— chưa xếp phòng —</option>
                    {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>)}
                  </select>
                </div>
                <div className="studio-field">
                  <label>Người quản lý</label>
                  <select className="studio-select" value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} disabled={!can("user:write")}>
                    <option value="">— không có —</option>
                    {users.filter((u) => u.personId !== selected.personId).map((u) => (
                      <option key={u.personId} value={u.personId}>{u.fullName} ({u.employeeCode})</option>
                    ))}
                  </select>
                </div>
                {/* [J5] chỉ hiện khi BE thực sự gửi trường — scope tenant mới thấy */}
                {"hireDate" in selected && (
                  <div className="studio-field">
                    <label>Ngày vào làm · thâm niên</label>
                    <div className="tiny muted">{selected.hireDate ?? "—"} · {selected.seniorityMonths ?? "—"} tháng</div>
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  {can("user:write") && (
                    <button className="btn primary sm" disabled={busy} onClick={() => void saveProfile()}>
                      <Save size={13} /> Lưu hồ sơ
                    </button>
                  )}
                  {can("user:deactivate") ? (
                    isSelf(selected) ? (
                      <span className="row tiny muted" style={{ gap: 6 }}>
                        <ShieldAlert size={13} /> Không tự khoá chính mình — sẽ không ai mở lại được
                      </span>
                    ) : selected.status === "active" ? (
                      <>
                        <button className={`btn sm ${disableArmed ? "accent" : "ghost"}`} disabled={busy} onClick={doDisable}>
                          <Lock size={13} /> {disableArmed ? "Xác nhận khoá tài khoản" : "Khoá tài khoản…"}
                        </button>
                        {disableArmed && <button className="btn ghost sm" onClick={() => setDisableArmed(false)}>Huỷ</button>}
                      </>
                    ) : (
                      <button className="btn ghost sm" disabled={busy} onClick={doEnable}>
                        <LockOpen size={13} /> Mở khoá
                      </button>
                    )
                  ) : (
                    <span className="row tiny muted" style={{ gap: 6 }}><Lock size={13} /> Cần user:deactivate</span>
                  )}
                </div>
              </Card>

              <div style={{ height: 12 }} />
              <Card title={<><ShieldPlus size={15} /> Vai trò</>}
                sub="Scope · ai cấp · khi nào. Thu hồi có hiệu lực ngay (token đang dùng bị chặn ở request kế tiếp).">
                <table className="table">
                  <thead><tr><th>Vai</th><th>Phạm vi</th><th>Ai cấp</th><th></th></tr></thead>
                  <tbody>
                    {(access?.roles ?? []).map((r) => (
                      <tr key={r.userRoleId}>
                        <td><Badge tone="info">{r.roleCode}</Badge></td>
                        <td style={{ fontSize: 12 }}>
                          {r.scopeType === "tenant" ? "Toàn tenant" : r.scopeType === "org_unit" ? orgLabel(r.scopeId) : "Chính mình"}
                        </td>
                        <td style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)" }}>
                          {r.grantedBy?.email ?? "seed"} · {new Date(r.grantedAt).toLocaleDateString("vi-VN")}
                        </td>
                        <td>
                          {can("role:revoke") && (
                            <div className="row" style={{ gap: 6 }}>
                              <button className={`btn sm ${revokeArmed === r.userRoleId ? "accent" : "ghost"}`} disabled={busy}
                                onClick={() => doRevoke(r.userRoleId)}>
                                <ShieldMinus size={12} /> {revokeArmed === r.userRoleId ? "Xác nhận thu hồi" : "Thu hồi"}
                              </button>
                              {revokeArmed === r.userRoleId && (
                                <button className="btn ghost sm" onClick={() => setRevokeArmed(null)}>Huỷ</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(access?.roles.length ?? 0) === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--nhg-text-secondary)" }}>Chưa có vai nào.</td></tr>
                    )}
                  </tbody>
                </table>

                {can("role:assign") && !isSelf(selected) && (
                  <div className="dept-reopen" style={{ marginTop: 12 }}>
                    <div className="dept-reopen-head"><ShieldPlus size={14} /> Gán vai mới</div>
                    <div className="studio-field">
                      {/* [J4] CHỈ liệt kê role mà GET /admin/roles trả về — không tự đoán */}
                      <label>Vai (chỉ hiện vai bạn ĐƯỢC PHÉP cấp)</label>
                      <select className="studio-select" value={grantRoleCode} onChange={(e) => setGrantRoleCode(e.target.value)}>
                        <option value="">— chọn vai —</option>
                        {roleOptions.map((r) => <option key={r.code} value={r.code}>{r.nameVi ?? r.code}</option>)}
                      </select>
                    </div>
                    <div className="studio-field">
                      <label>Phạm vi</label>
                      <select className="studio-select" value={grantScopeType}
                        onChange={(e) => setGrantScopeType(e.target.value as typeof grantScopeType)}>
                        <option value="self">Chính người nhận</option>
                        <option value="org_unit">Một phòng</option>
                        {hasTenantScope && <option value="tenant">Toàn tenant</option>}
                      </select>
                    </div>
                    {grantScopeType === "org_unit" && (
                      <div className="studio-field">
                        <label>Phòng</label>
                        <select className="studio-select" value={grantScopeId} onChange={(e) => setGrantScopeId(e.target.value)}>
                          <option value="">— chọn phòng —</option>
                          {scopeOrgOptions.map((u) => <option key={u.id} value={u.id}>{u.nameVi} ({u.code})</option>)}
                        </select>
                      </div>
                    )}
                    <button className="btn primary sm" disabled={busy || !grantRoleCode || (grantScopeType === "org_unit" && !grantScopeId)}
                      onClick={() => void doGrant()}>
                      <ShieldPlus size={13} /> Gán vai
                    </button>
                    {roleOptions.length === 0 && (
                      <div style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)", marginTop: 6 }}>
                        Bạn không giữ đủ quyền của bất kỳ vai nào ngoài chính vai của mình — không cấp được vai cho người khác.
                      </div>
                    )}
                  </div>
                )}
                {isSelf(selected) && (
                  <div style={{ fontSize: 11.5, color: "var(--nhg-text-secondary)", marginTop: 10 }}>
                    Không tự gán/thu hồi vai cho chính mình.
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
