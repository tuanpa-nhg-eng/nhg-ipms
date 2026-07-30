#!/usr/bin/env node
/**
 * DRIVER SỐNG — TRỤC C "Lớp bảo vệ niềm tin" · L0 sổ đăng ký dữ liệu + L1 kiểm soát xuất
 *
 *   node scripts/verify/verify-governance.mjs
 *
 * Đánh API THẬT (mặc định :4000) trên DB THẬT. Khác jest integration ở đúng chỗ quan trọng:
 * đi qua ĐỦ pipeline guard thật (Jwt → Tenant → Permission → Policy → Export) với token thật
 * do /auth/dev-token phát — đúng loại kiểm chứng đã bắt được F174/F175 ở trục A.
 *
 * ⚠️ HAI ĐIỀU KIỆN — sai một trong hai là ĐO NHẦM, không phải đo sai (bài học trục B ②):
 *   ① API dev server KHÔNG watch: sửa mã xong PHẢI kill PID :4000 rồi start lại.
 *   ② DB có seed chuẩn (pnpm db:seed) + đã migrate tới 20260730100000_export_log.
 *
 * Driver TỰ DỌN: mọi thay đổi trạng thái đăng ký hoàn nguyên TRƯỚC khi thao tác (bài học
 * trục B ③) — một nhánh return sớm không được để lại mức phân loại bị siết trong DB.
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

async function req(method, path, { token, tenantId, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (tenantId) h['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${BASE}${path}`, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

async function login(prefix, tenantCode = TENANT, dom = DOM) {
  const r = await req('POST', '/auth/dev-token', { body: { email: `${prefix}@${dom}`, tenantCode } });
  if (![200, 201].includes(r.status) || !r.json?.access_token) {
    throw new Error(`dev-token ${prefix}: ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }
  return { token: r.json.access_token, tenantId: r.json.tenant_id, prefix };
}

const is = (r, ...codes) => codes.includes(r.status)
  ? true
  : `mong ${codes.join('|')}, nhận ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;

const msgOf = (r) => String(r.json?.error?.message ?? r.json?.message ?? '');

// ══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.y}DRIVER SỐNG — TRỤC C L0 (sổ đăng ký) + L1 (kiểm soát xuất)${c.x}`);
  console.log(`${c.d}${BASE} · tenant ${TENANT}${c.x}`);

  const admin = await login('admin');
  const hr = await login('hr');
  const steward = await login('steward');
  const auditor = await login('auditor');
  const emp = await login('emp1');

  // ═══ L0 — sổ đăng ký dữ liệu ═══
  group('L0 — mọi đường dữ liệu tra được nhóm + mức phân loại');

  await check('GET /data-catalog: đủ ≥9 nhóm chuẩn, dòng nào cũng có chủ dữ liệu', async () => {
    const r = await req('GET', '/data-catalog', { ...admin });
    if (r.status !== 200) return is(r, 200);
    const e = r.json?.entries ?? [];
    if (e.length < 9) return `chỉ có ${e.length} nhóm`;
    const noOwner = e.filter((x) => !x.ownerRole);
    return noOwner.length === 0 ? true : `thiếu chủ dữ liệu: ${noOwner.map((x) => x.code).join(',')}`;
  });

  await check('Mức phân loại nhóm nhạy cảm đúng BRD §12 (lương + vận hành ngành = restricted)', async () => {
    const r = await req('GET', '/data-catalog', { ...admin });
    const by = Object.fromEntries((r.json?.entries ?? []).map((x) => [x.code, x.classification]));
    const want = {
      'payroll.reward': 'restricted', 'opco.operational': 'restricted',
      'review.result': 'confidential', 'objective.kpi': 'internal',
    };
    const bad = Object.entries(want).filter(([k, v]) => by[k] !== v).map(([k, v]) => `${k}: mong ${v}, có ${by[k]}`);
    return bad.length === 0 ? true : bad.join(' · ');
  });

  await check('Mã chưa đăng ký → 404 fail-closed (KHÔNG mặc định về internal)',
    async () => is(await req('GET', '/data-catalog/khong.ton.tai', { ...admin }), 404));

  await check('employee KHÔNG đọc được sổ; tenant_admin đọc mà KHÔNG ghi được', async () => {
    const e = await req('GET', '/data-catalog', { ...emp });
    if (e.status !== 403) return `employee: ${is(e, 403)}`;
    const w = await req('PUT', '/data-catalog/objective.kpi', { ...admin, body: { classification: 'confidential' } });
    return is(w, 403);
  });

  await check('data_steward KHÔNG nới lỏng được bản chuẩn (payroll.reward → internal = 422)', async () => {
    const r = await req('PUT', '/data-catalog/payroll.reward', { ...steward, body: { classification: 'internal' } });
    if (r.status !== 422) return is(r, 422);
    return msgOf(r).includes('siết chặt') ? true : `thông báo không nói lý do: ${msgOf(r)}`;
  });

  // ═══ L1 — kiểm soát xuất dữ liệu ═══
  group('L1 — một cổng duy nhất, ghi vết đủ bốn thông tin');

  await check('Sổ vết xuất: auditor đọc được, hrbp (người xuất) KHÔNG', async () => {
    const a = await req('GET', '/export-log', { ...auditor });
    if (a.status !== 200) return `auditor: ${is(a, 200)}`;
    const h = await req('GET', '/export-log', { ...hr });
    return is(h, 403);
  });

  /**
   * Ca lõi của lát: hrbp GIỮ `payroll:export` mà vẫn không xuất được, vì `review.result` là
   * `confidential` và `export:confidential` không nằm trong vai nào. Trước L1 đây là 200.
   */
  await check('hrbp có payroll:export nhưng THIẾU export:confidential → 403 (403 chứ không 422)', async () => {
    const cycles = await req('GET', '/review-cycles', { ...hr });
    const cid = (cycles.json?.entries ?? cycles.json ?? [])[0]?.id;
    const r = await req('GET', `/export/payroll?cycle=${cid ?? '00000000-0000-0000-0000-000000000000'}`, { ...hr });
    if (r.status !== 403) return is(r, 403);
    return msgOf(r).includes('export:confidential') ? true : `thông báo không nêu quyền cần: ${msgOf(r)}`;
  });

  await check('Đường xuất `internal` ra hệ ngoài: đi được VÀ sinh thêm đúng 1 dòng sổ vết', async () => {
    const before = (await req('GET', '/export-log?asset=system.log&limit=200', { ...auditor })).json?.total ?? 0;
    const d = await req('POST', '/integrations/outbox/dispatch', { ...hr, body: {} });
    if (![200, 201].includes(d.status)) return is(d, 200, 201);
    const after = await req('GET', '/export-log?asset=system.log&limit=200', { ...auditor });
    const n = after.json?.total ?? 0;
    if (n !== before + 1) return `sổ vết: ${before} → ${n} (mong +1)`;
    const top = after.json.entries[0];
    const missing = ['assetCode', 'classification', 'destination', 'recordCount']
      .filter((k) => top[k] === undefined || top[k] === null);
    if (missing.length) return `dòng vết thiếu thông tin: ${missing.join(',')}`;
    return top.classification === 'internal' && top.destinationKind === 'external_service'
      ? true : `dòng vết sai nội dung: ${JSON.stringify(top).slice(0, 160)}`;
  });

  /**
   * K3 sống: sổ đăng ký (L0) điều khiển cổng xuất (L1) trong cùng một phiên chạy. Không mock,
   * không restart. Đây là ca chứng minh hai lát nối thật vào nhau.
   */
  await check('[K3] steward siết system.log → restricted ⇒ đường xuất đó ĐÓNG ngay (403, nêu K3)', async () => {
    // Hoàn nguyên đăng ký TRƯỚC khi siết (bài học trục B ③).
    // ⚠️ Giới hạn thật, ghi ra để không ai tưởng đã sạch: API sổ đăng ký chỉ có PUT (đặt/siết),
    // KHÔNG có DELETE bản riêng của đơn vị. Nên hoàn nguyên = đặt lại 'internal' — bằng đúng
    // bản chuẩn tập đoàn, hành vi giống như trước, nhưng để lại MỘT dòng `data_asset` cấp
    // tenant trong DB. Vô hại (mức phân loại y nguyên), và jest `datacatalog.spec` dọn sạch
    // mọi bản riêng ở afterAll. Xoá bản riêng qua API là việc của lát sau nếu B5 cần.
    cleanup.push(async () => {
      await req('PUT', '/data-catalog/system.log', { ...steward, body: { classification: 'internal' } });
    });
    const up = await req('PUT', '/data-catalog/system.log', { ...steward, body: { classification: 'restricted' } });
    if (![200, 201].includes(up.status)) return `siết mức: ${is(up, 200, 201)}`;
    const d = await req('POST', '/integrations/outbox/dispatch', { ...hr, body: {} });
    if (d.status !== 403) return is(d, 403);
    return msgOf(d).includes('K3') ? true : `chặn nhưng không nêu K3: ${msgOf(d)}`;
  });

  await check('Sau khi nới lại về bản chuẩn, đường xuất mở lại (đối chứng: không chặn vĩnh viễn)', async () => {
    // `data_asset_no_loosen` chặn hạ mức xuống dưới bản chuẩn; system.log chuẩn là 'internal'
    // nên đưa về đúng 'internal' là hợp lệ.
    const back = await req('PUT', '/data-catalog/system.log', { ...steward, body: { classification: 'internal' } });
    if (![200, 201].includes(back.status)) return `nới lại: ${is(back, 200, 201)}`;
    return is(await req('POST', '/integrations/outbox/dispatch', { ...hr, body: {} }), 200, 201);
  });

  await check('[K2] route trông như đường xuất mà chưa khai @Exported → 403 (nếu tồn tại route như vậy)', async () => {
    // Driver không dựng được controller thăm dò trong process API đang chạy. Thay vào đó quét
    // các đường dẫn dạng xuất HAY GẶP: bất kỳ cái nào trả 200 mà KHÔNG có dòng sổ vết tương
    // ứng là một lỗ. 404 = route không tồn tại, hợp lệ.
    const probes = [
      '/export/dictionary', '/task-dictionary/csv', '/reviews/export',
      '/admin/users/export', '/evidence/download',
    ];
    const leaks = [];
    for (const p of probes) {
      const r = await req('GET', p, { ...admin });
      if (r.status === 200) leaks.push(`${p} trả 200 mà không qua cổng xuất`);
    }
    return leaks.length === 0 ? true : leaks.join(' · ');
  });

  // ═══ đường CẤP QUYỀN của B1 — quyết định 30/07 phải làm được từ giao diện ═══
  group('Cấp trần xuất cho 1–2 người — qua API quản trị, KHÔNG sửa DB tay');

  /**
   * Tìm theo `?q=` chứ không quét trang đầu của `/admin/users`: H.01 đã có hàng chục tài khoản
   * (seed persona + demo + rác của các phiên test), tài khoản cần tìm KHÔNG chắc nằm trong
   * trang đầu — bản đầu của driver quét trang đầu và ngã ở đúng chỗ đó.
   */
  async function findUser(emailPrefix) {
    const r = await req('GET', `/admin/users?q=${encodeURIComponent(emailPrefix + '@' + DOM)}`, { ...admin });
    const list = Array.isArray(r.json) ? r.json : (r.json?.entries ?? r.json?.items ?? r.json?.data ?? []);
    const hit = list.find((u) => u.email === `${emailPrefix}@${DOM}`);
    if (!hit) throw new Error(`không thấy tài khoản seed ${emailPrefix}@ qua /admin/users?q= (status ${r.status})`);
    return hit;
  }
  const adminUser = await findUser('admin');
  const hrUser = await findUser('hr');
  const empUser = await findUser('emp1');

  await check('`export_officer` XUẤT HIỆN trong /admin/roles của tenant_admin (J4: UI thấy đúng cái API cho)', async () => {
    const r = await req('GET', '/admin/roles', { ...admin });
    if (r.status !== 200) return is(r, 200);
    const roles = Array.isArray(r.json) ? r.json : (r.json?.entries ?? []);
    const eo = roles.find((x) => x.code === 'export_officer');
    if (!eo) return 'không thấy vai export_officer — B1 sẽ không cấp được từ giao diện';
    if (eo.tenantOnly !== true) return `thiếu cờ tenantOnly (FE phải khoá scope): ${JSON.stringify(eo)}`;
    // Quyền CÁ NHÂN (`*.self:*` + tra Từ điển) có ở MỌI vai theo thiết kế trục B — trừ chúng
    // ra thay vì đòi vai này rỗng tuyệt đối. Cái phải bằng rỗng là quyền NĂNG LỰC: nếu vai
    // uỷ nhiệm mang thêm dù một quyền gọi được endpoint, ngoại lệ J1① thành đường leo thang.
    const SELF = ['taskdict:read', 'settings.self:read', 'settings.self:update',
      'access.self:read', 'notify.self:read', 'notify.self:update'];
    const extra = (eo.permissions ?? []).filter((p) => p !== 'export:confidential' && !SELF.includes(p));
    return extra.length === 0 ? true : `vai mang quyền NĂNG LỰC ngoài trần xuất: ${JSON.stringify(extra)}`;
  });

  await check('tenant_admin KHÔNG tự gán vai đó cho chính mình (J1③)', async () => {
    const r = await req('POST', `/admin/users/${adminUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'export_officer', scopeType: 'tenant' } });
    return is(r, 409, 403);
  });

  await check('Sai scope (self) KHÔNG được miễn trừ — rơi về J1① như mọi vai khác', async () => {
    const r = await req('POST', `/admin/users/${empUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'export_officer', scopeType: 'self' } });
    if (r.status !== 403) return is(r, 403);
    return msgOf(r).includes('J1①') ? true : `403 nhưng không nêu J1①: ${msgOf(r)}`;
  });

  await check('B1 cấp cho hrbp ⇒ cổng xuất MỞ ngay (không còn 403 vì thiếu export:confidential)', async () => {
    // hoàn nguyên TRƯỚC khi cấp
    let userRoleId = null;
    cleanup.push(async () => {
      if (userRoleId) await req('DELETE', `/admin/users/${hrUser.appUserId}/roles/${userRoleId}`, { ...admin });
    });
    const g = await req('POST', `/admin/users/${hrUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'export_officer', scopeType: 'tenant' } });
    if (![200, 201].includes(g.status)) return `cấp vai: ${is(g, 200, 201)}`;
    userRoleId = g.json?.id ?? g.json?.userRoleId ?? null;
    if (!userRoleId) return `cấp xong nhưng không trả id userRole: ${JSON.stringify(g.json).slice(0, 140)}`;

    const cycles = await req('GET', '/review-cycles', { ...hr });
    const cid = (cycles.json?.entries ?? cycles.json ?? [])[0]?.id;
    const x = await req('GET', `/export/payroll?cycle=${cid ?? '00000000-0000-0000-0000-000000000000'}`, { ...hr });
    // 200 nếu kỳ tồn tại, 422 nếu không — cả hai đều nghĩa là đã qua ExportGuard. 403 = chưa.
    if (x.status === 403) return `vẫn 403 sau khi cấp: ${msgOf(x)}`;
    return [200, 201, 422].includes(x.status) ? true : is(x, 200, 422);
  });

  await check('Người CHỈ có trần xuất vẫn không xuất được (trần ≠ năng lực)', async () => {
    let userRoleId = null;
    cleanup.push(async () => {
      if (userRoleId) await req('DELETE', `/admin/users/${empUser.appUserId}/roles/${userRoleId}`, { ...admin });
    });
    const g = await req('POST', `/admin/users/${empUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'export_officer', scopeType: 'tenant' } });
    if (![200, 201].includes(g.status)) return `cấp vai cho emp1: ${is(g, 200, 201)}`;
    userRoleId = g.json?.id ?? g.json?.userRoleId ?? null;
    // 403 ở PermissionGuard vì thiếu payroll:export — chặn TRƯỚC cả ExportGuard
    return is(await req('GET', '/export/payroll?cycle=x', { ...emp }), 403);
  });

  await check('tenant_admin KHÔNG gán được `hrbp` — không tự dựng người xuất từ đầu', async () => {
    const r = await req('POST', `/admin/users/${empUser.appUserId}/roles`,
      { ...admin, body: { roleCode: 'hrbp', scopeType: 'tenant' } });
    return is(r, 403);
  });

  await check('Sổ vết xuất KHÔNG có dòng nào sinh trong phiên đóng vai (J11 còn nguyên)', async () => {
    const r = await req('GET', '/export-log?limit=200', { ...auditor });
    const bad = (r.json?.entries ?? []).filter((e) => e.onBehalfOfUserId);
    return bad.length === 0 ? true : `${bad.length} dòng có onBehalfOfUserId — J11 đã vỡ`;
  });

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
