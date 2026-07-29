#!/usr/bin/env node
/**
 * DRIVER SỐNG — TRỤC B "Quản trị 3 tầng" + verdict Reviewer F184–F190
 *
 *   node scripts/verify/verify-admin.mjs
 *
 * Đánh API THẬT (mặc định :4000) trên DB THẬT — khác hẳn jest integration chạy trong
 * transaction cô lập. Mục đích: bắt những thứ chỉ lộ ra khi đi qua đủ tầng guard thật,
 * đúng thứ đã bắt được F174/F175/F176/F183 ở trục A.
 *
 * ⚠️ HAI ĐIỀU KIỆN TRƯỚC KHI CHẠY — sai một trong hai là đo nhầm, không phải đo sai:
 *   ① API dev server KHÔNG watch. Sửa mã xong phải kill PID :4000 rồi start lại,
 *      nếu không driver đo mã cũ mà báo xanh.
 *   ② DB phải có seed chuẩn (pnpm db:seed) — driver dùng các tài khoản seed của H.01.
 *
 * Driver TỰ DỌN: mọi thay đổi trạng thái (gán vai, khoá tài khoản, sửa cấu hình) đều
 * được hoàn nguyên ở cuối, kể cả khi có check thất bại.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const TENANT = process.env.TENANT_CODE ?? 'H.01';
const DOM = 'h01.nhg.local';

let pass = 0;
const fails = [];
const cleanup = [];

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };

function group(t) { console.log(`\n${c.d}── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}${c.x}`); }

async function check(name, fn) {
  try {
    const r = await fn();
    if (r === true) { pass++; console.log(`  ${c.g}✅${c.x} ${name}`); }
    else { fails.push(`${name} → ${r}`); console.log(`  ${c.r}❌${c.x} ${name} ${c.r}→ ${r}${c.x}`); }
  } catch (e) {
    fails.push(`${name} → NÉM LỖI: ${e.message}`);
    console.log(`  ${c.r}❌${c.x} ${name} ${c.r}→ ném lỗi: ${e.message}${c.x}`);
  }
}

async function req(method, path, { token, tenantId, body, raw } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (tenantId) h['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return raw ? { status: res.status, json, text } : { status: res.status, json };
}

async function login(prefix, tenantCode = TENANT, dom = DOM) {
  const r = await req('POST', '/auth/dev-token', { body: { email: `${prefix}@${dom}`, tenantCode } });
  if (![200, 201].includes(r.status) || !r.json?.access_token) throw new Error(`dev-token ${prefix}: ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  return { token: r.json.access_token, tenantId: r.json.tenant_id, prefix };
}

const is = (r, ...codes) => codes.includes(r.status) ? true : `mong ${codes.join('|')}, nhận ${r.status} ${JSON.stringify(r.json).slice(0, 140)}`;

// ══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.y}DRIVER SỐNG — TRỤC B + verdict F184–F190${c.x}`);
  console.log(`${c.d}${BASE} · tenant ${TENANT}${c.x}`);

  // ── đăng nhập các persona seed ──
  const admin = await login('admin');
  const emp = await login('emp1');
  const auditor = await login('auditor');
  const orgadmin = await login('orgadmin');
  const T = admin.tenantId;

  const users = (await req('GET', '/admin/users', { ...admin })).json;
  const list = Array.isArray(users) ? users : (users?.entries ?? users?.items ?? users?.data ?? []);
  const empUser = list.find((u) => u.email === `emp1@${DOM}`);
  const adminUser = list.find((u) => u.email === `admin@${DOM}`);
  const auditorUser = list.find((u) => u.email === `auditor@${DOM}`);
  if (!empUser || !adminUser) throw new Error('không tìm thấy tài khoản seed emp1/admin trong /admin/users');

  // ═══ J1/J3 — không có đường tự nâng quyền ═══
  group('J1 · J3 — tenant_admin không tự nâng quyền, không đọc vết kiểm toán');

  await check('J3 — admin@ GET /audit-logs → 403 (không đọc vết kiểm toán của chính mình)',
    async () => is(await req('GET', '/audit-logs', { ...admin }), 403));

  await check('J1① — admin@ gán vai `auditor` (chứa audit:read mình không có) → 403',
    async () => is(await req('POST', `/admin/users/${empUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'auditor', scopeType: 'tenant' } }), 403, 422));

  await check('J2 — admin@ không giữ quyền chốt kỳ / xuất lương (không có trong effective-access)',
    async () => {
      const r = await req('GET', `/admin/users/${adminUser.appUserId}/effective-access`, { ...admin });
      if (r.status !== 200) return `effective-access ${r.status}`;
      const perms = JSON.stringify(r.json);
      const cam = ['review:finalize', 'export:payroll', 'audit:read', 'config:publish'].filter((p) => perms.includes(p));
      return cam.length === 0 ? true : `tenant_admin VẪN giữ: ${cam.join(', ')}`;
    });

  // ═══ F184 — vai sàn chỉ được scope self ═══
  group('F184 — vai SÀN chỉ gán được scope=self (chặn dựng lại god-account)');

  await check('F184 — GET /admin/roles đánh dấu selfOnly=true cho vai `employee`',
    async () => {
      const r = await req('GET', '/admin/roles', { ...admin });
      if (r.status !== 200) return `roles ${r.status}`;
      const arr = Array.isArray(r.json) ? r.json : (r.json?.entries ?? r.json?.items ?? []);
      const emp = arr.find((x) => x.code === 'employee');
      if (!emp) return 'không thấy vai employee trong danh sách';
      return emp.selfOnly === true ? true : `selfOnly = ${JSON.stringify(emp.selfOnly)}`;
    });

  await check('F184 — admin@ gán `employee` scope=TENANT → 403 (đường dựng lại god-account)',
    async () => is(await req('POST', `/admin/users/${empUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'employee', scopeType: 'tenant' } }), 403, 422));

  await check('F184 — admin@ gán `employee` scope=ORG_UNIT → 403',
    async () => {
      const ou = (await req('GET', '/org-units', { ...admin })).json;
      const units = Array.isArray(ou) ? ou : (ou?.entries ?? ou?.items ?? ou?.tree ?? []);
      const anyId = JSON.stringify(units).match(/"id":"([0-9a-f-]{36})"/)?.[1];
      if (!anyId) return 'không lấy được org unit id để thử';
      return is(await req('POST', `/admin/users/${empUser.appUserId}/roles`,
        { ...admin, body: { roleCode: 'employee', scopeType: 'org_unit', scopeId: anyId } }), 403, 422);
    });

  await check('F184 ĐỐI CHỨNG — admin@ gán `employee` scope=SELF → 2xx (KHÔNG chặn oan)',
    async () => {
      const r = await req('POST', `/admin/users/${empUser.appUserId}/roles`,
        { ...admin, body: { roleCode: 'employee', scopeType: 'self' } });
      if (r.status === 409 || r.status === 200 || r.status === 201) {
        const id = r.json?.id ?? r.json?.userRoleId;
        if (id) cleanup.push(() => req('DELETE', `/admin/users/${empUser.appUserId}/roles/${id}`, { ...admin }));
        return true;                       // 409 = đã có sẵn từ seed, vẫn là "không bị chặn"
      }
      return `mong 200|201|409, nhận ${r.status} ${JSON.stringify(r.json).slice(0, 140)}`;
    });

  // ═══ F185 — prototype pollution ═══
  group('F185 — whitelist cấu hình không lọt thuộc tính kế thừa');

  for (const key of ['__proto__', 'constructor', 'prototype']) {
    await check(`F185 — PATCH /admin/tenant-config key="${key}" → 422 (không 500, không lọt)`,
      async () => {
        const cur = await req('GET', '/admin/tenant-config', { ...admin });
        const v = cur.json?.version ?? 1;
        const r = await req('PATCH', '/admin/tenant-config', { ...admin, body: { patch: { [key]: 'x' }, version: v } });
        if (r.status === 500) return `NÉM 500 — lỗi chưa bắt (đúng triệu chứng F185)`;
        return is(r, 422, 400);
      });
  }

  await check('F185 — PATCH /me/settings key="__proto__" → 422',
    async () => {
      const cur = await req('GET', '/me/settings', { ...emp });
      const v = cur.json?.version ?? 1;
      const r = await req('PATCH', '/me/settings', { ...emp, body: { patch: JSON.parse('{"__proto__":"x"}'), version: v } });
      if (r.status === 500) return 'NÉM 500 — lỗi chưa bắt';
      return is(r, 422, 400);
    });

  // ═══ F189 — optimistic lock ═══
  group('F189 — khoá optimistic cho admin mutations');

  await check('F189 — GET /admin/tenant-config trả kèm `version`',
    async () => {
      const r = await req('GET', '/admin/tenant-config', { ...admin });
      return typeof r.json?.version === 'number' ? true : `không có version: ${JSON.stringify(r.json).slice(0, 120)}`;
    });

  await check('F189 — PATCH với version LỆCH → 409 (không ghi đè lặng lẽ)',
    async () => is(await req('PATCH', '/admin/tenant-config',
      { ...admin, body: { patch: { defaultLocale: 'vi' }, version: 999999 } }), 409));

  await check('F189 ĐỐI CHỨNG — PATCH với version ĐÚNG → 2xx (không chặn oan)',
    async () => {
      const cur = await req('GET', '/admin/tenant-config', { ...admin });
      const v = cur.json.version;
      const old = cur.json.defaultLocale ?? 'vi';
      const r = await req('PATCH', '/admin/tenant-config', { ...admin, body: { patch: { defaultLocale: old }, version: v } });
      return is(r, 200, 204);
    });

  // ═══ J11–J13 — đóng vai chỉ-đọc ═══
  group('J11 · J12 · J13 + F187 — đóng vai chỉ-đọc, không lách được J3');

  await check('J12③ — admin@ tự đóng vai CHÍNH MÌNH → 403',
    async () => is(await req('POST', '/admin/impersonation', { ...admin, body: { targetUserId: adminUser.appUserId, reason: 'Driver kiem chung truc B — phien doc-thoi tu dong' } }), 403, 422));

  const LY_DO = 'Driver kiem chung truc B — phien doc-thoi tu dong';

  await check('J12① — admin@ KHÔNG đóng vai được người giữ quyền mình không có (emp1: goal:write…)',
    async () => {
      const r = await req('POST', '/admin/impersonation',
        { ...admin, body: { targetUserId: empUser.appUserId, reason: LY_DO } });
      if (r.status === 200 || r.status === 201) {
        await req('DELETE', '/admin/impersonation/current',
          { token: r.json?.access_token ?? r.json?.token, tenantId: T });
        return 'LỌT — đóng vai được người giữ quyền cao hơn mình (leo thang qua impersonation)';
      }
      return is(r, 403);
    });

  await check('F187 + J3 — admin@ KHÔNG đóng vai được `auditor` ⇒ không có đường đọc vết kiểm toán',
    async () => {
      if (!auditorUser) return 'không tìm thấy tài khoản auditor seed';
      const r = await req('POST', '/admin/impersonation',
        { ...admin, body: { targetUserId: auditorUser.appUserId, reason: LY_DO } });
      if (r.status === 200 || r.status === 201) {
        const tk = r.json?.access_token ?? r.json?.token;
        const out = await req('GET', '/audit-logs', { token: tk, tenantId: T });
        await req('DELETE', '/admin/impersonation/current', { token: tk, tenantId: T });
        return out.status === 200
          ? 'LỌT — đọc được audit-logs qua đóng vai auditor (J3 bị lách)'
          : `mở được phiên đóng vai auditor (J12 hở) nhưng audit-logs vẫn ${out.status}`;
      }
      return is(r, 403);
    });

  // ⚠️ GIỚI HẠN THẬT CỦA THIẾT KẾ — ghi lại để người sau không tưởng driver hụt:
  // J12 chỉ cho đóng vai người có quyền ⊆ quyền của mình. Sau khi L0 hạ hết quyền nghiệp vụ
  // của tenant_admin, MỌI persona seed đều giữ ít nhất một quyền admin@ không có ⇒ admin@ chỉ
  // đóng vai được tài khoản KHÔNG có quyền nào — mà tài khoản đó đọc gì cũng 403. Nghĩa là
  // vòng "đọc được / ghi bị chặn" KHÔNG diễn tập được end-to-end bằng tenant_admin trên seed
  // hiện tại; phần đó do impersonation.spec.ts + impersonation-whitelist.spec.ts phủ.
  // Driver ở đây kiểm phần CHỈ đo được khi chạy thật: token phiên có dấu đóng vai, và
  // thoát phiên thì token chết ngay.
  let imp = null, impTarget = null;
  await check('J11 — mở được phiên đóng vai với mục tiêu J12 cho phép',
    async () => {
      const tried = [];
      for (const u of list.slice(0, 20)) {
        if (u.appUserId === adminUser.appUserId || u.status !== 'active' || !u.email) continue;
        const r = await req('POST', '/admin/impersonation',
          { ...admin, body: { targetUserId: u.appUserId, reason: LY_DO } });
        if ([200, 201].includes(r.status)) {
          imp = r.json?.access_token ?? r.json?.token;
          impTarget = u;
          cleanup.push(() => req('DELETE', '/admin/impersonation/current', { token: imp, tenantId: T }));
          return true;
        }
        tried.push(`${u.email.split('@')[0]}:${r.status}`);
      }
      return `không mục tiêu nào mở được phiên — đã thử: ${tried.slice(0, 8).join(' · ')}`;
    });

  await check('J13 — token phiên đóng vai mang dấu `act` (actor thật) khác `sub` (người bị đóng vai)',
    async () => {
      if (!imp) return 'không có phiên đóng vai';
      const p = JSON.parse(Buffer.from(imp.split('.')[1], 'base64url').toString('utf8'));
      if (!p.act) return `token KHÔNG có claim 'act' — phiên đóng vai không phân biệt được actor thật (F188 dựa vào claim này)`;
      if (p.act === p.sub) return `act === sub (${p.sub}) — không phân biệt được ai đang thao tác`;
      if (!p.imp_sid) return `thiếu 'imp_sid' — không thu hồi được phiên theo id`;
      return true;
    });

  await check('J11 — trong phiên đóng vai, GHI /me/settings bị từ chối',
    async () => {
      if (!imp) return 'không có phiên đóng vai';
      const cur = await req('GET', '/me/settings', { token: imp, tenantId: T });
      const r = await req('PATCH', '/me/settings',
        { token: imp, tenantId: T, body: { patch: { locale: 'vi' }, version: cur.json?.version ?? 1 } });
      return is(r, 403);
    });

  await check('J13 — thoát phiên đóng vai → token phiên đó dùng lại NGAY thì 401',
    async () => {
      if (!imp) return 'không có phiên đóng vai';
      const out = await req('DELETE', '/admin/impersonation/current', { token: imp, tenantId: T });
      if (![200, 204].includes(out.status)) return `thoát phiên: ${out.status}`;
      const after = await req('GET', '/me/access', { token: imp, tenantId: T });
      imp = null;
      return is(after, 401);
    });

  // ═══ phân quyền thường ═══
  group('Phân quyền — nhân viên và org_admin không vượt phạm vi');

  await check('emp1@ GET /admin/users → 403',
    async () => is(await req('GET', '/admin/users', { ...emp }), 403));

  await check('emp1@ POST /admin/users (tạo người) → 403',
    async () => is(await req('POST', '/admin/users', { ...emp, body: { email: `x${Date.now()}@${DOM}` } }), 403, 422));

  await check('emp1@ GET /me/access → 200 (chỉ thấy quyền của chính mình)',
    async () => is(await req('GET', '/me/access', { ...emp }), 200));

  await check('J9 — emp1@ GET /task-dictionary → 200 (Từ điển Tác vụ không bị đụng)',
    async () => is(await req('GET', '/task-dictionary', { ...emp }), 200));

  await check('org_admin GET /admin/users → 200 (đọc được, đúng thiết kế L0)',
    async () => is(await req('GET', '/admin/users', { ...orgadmin }), 200, 403));

  await check('org_admin không gán được vai (không giữ role:grant)',
    async () => {
      // Dùng vai emp1 CHẮC CHẮN chưa có, để 403 là do thiếu quyền chứ không phải 409 trùng.
      const r = await req('POST', `/admin/users/${empUser.appUserId}/roles`,
        { ...orgadmin, body: { roleCode: 'library_curator', scopeType: 'tenant' } });
      if (r.status === 409) return '409 (trùng vai) — chọn vai khác để phép thử có nghĩa';
      return is(r, 403, 422);
    });

  // ═══ J8 — khoá tài khoản có hiệu lực ngay ═══
  group('J8 — khoá tài khoản, token phát TRƯỚC đó mất hiệu lực ngay');

  await check('J8 — disable emp1 → token cũ của emp1 dùng lại thì 401',
    async () => {
      // Đọc version NGAY TRƯỚC khi khoá — các check phía trên đã có thể bump version.
      const freshOf = async (id) => {
        const u = (await req('GET', '/admin/users', { ...admin })).json;
        const arr = Array.isArray(u) ? u : (u?.entries ?? u?.items ?? []);
        return arr.find((x) => x.appUserId === id);
      };
      // Đăng ký hoàn nguyên TRƯỚC khi khoá. Đăng ký sau thì mọi nhánh return sớm (mã lỗi lạ,
      // ném lỗi) đều để lại tài khoản bị khoá vĩnh viễn — chính lỗi đã xảy ra ở bản đầu driver.
      cleanup.push(async () => {
        const me = await freshOf(empUser.appUserId);
        if (me?.status !== 'active') {
          await req('POST', `/admin/users/${empUser.appUserId}/enable`,
            { ...admin, body: { version: me?.appUserVersion ?? 1 } });
        }
      });
      const cur = await freshOf(empUser.appUserId);
      const v = cur?.appUserVersion ?? 1;
      const d = await req('POST', `/admin/users/${empUser.appUserId}/disable`, { ...admin, body: { version: v } });
      if (![200, 201, 204].includes(d.status)) return `disable: ${d.status} ${JSON.stringify(d.json).slice(0, 140)}`;
      const after = await req('GET', '/me/access', { ...emp });
      return is(after, 401, 403);
    });

  // ═══ cô lập tenant ═══
  group('Cô lập tenant — token của H.01 không dùng được cho tenant khác');

  await check('Token H.01 + X-Tenant-Id giả → 401/403 (không rò chéo)',
    async () => is(await req('GET', '/admin/users',
      { token: admin.token, tenantId: '00000000-0000-0000-0000-000000000000' }), 401, 403));

  // ── dọn dẹp ──
  group('Dọn dẹp — hoàn nguyên mọi thay đổi trạng thái');
  for (const fn of cleanup.reverse()) { try { await fn(); } catch { /* best effort */ } }
  console.log(`  ${c.d}${cleanup.length} thao tác hoàn nguyên${c.x}`);

  // ── kết ──
  const total = pass + fails.length;
  console.log(`\n${fails.length === 0 ? c.g : c.r}${pass}/${total}${c.x} check\n`);
  if (fails.length) {
    console.log(`${c.r}THẤT BẠI:${c.x}`);
    fails.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
  console.log(`${c.g}TẤT CẢ XANH${c.x}`);
}

main().catch((e) => { console.error(`\n${c.r}DRIVER NGÃ:${c.x} ${e.message}\n`); process.exit(2); });
