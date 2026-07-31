#!/usr/bin/env node
/**
 * DRIVER SỐNG — TRỤC C "Lớp bảo vệ niềm tin"
 *   L0 sổ đăng ký · L1 kiểm soát xuất · L2 quản trị nền tảng · L2b vai `support` ·
 *   L3 ngoại lệ có thời hạn
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
  console.log(`\n${c.y}DRIVER SỐNG — TRỤC C L0 · L1 · L2 · L2b · L3${c.x}`);
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

  // ═══ L2 — quản trị nền tảng: vận hành toàn hệ mà KHÔNG đọc được nội dung ═══
  group('L2 — Platform Admin B3: metadata xuyên đơn vị, 0 nội dung nghiệp vụ');

  const plat = await login('platform');

  await check('B3 làm mới snapshot rồi thấy ĐỦ các đơn vị kèm trạng thái (xuyên đơn vị thật)', async () => {
    const r0 = await req('POST', '/platform/snapshot/refresh', { ...plat, body: {} });
    if (![200, 201].includes(r0.status)) return `refresh: ${is(r0, 200, 201)}`;
    const r = await req('GET', '/platform/tenants', { ...plat });
    if (r.status !== 200) return is(r, 200);
    const codes = (r.json?.entries ?? []).map((e) => e.code);
    if (!codes.includes('H.01') || !codes.includes('T2.TEST')) {
      return `thiếu đơn vị: thấy ${JSON.stringify(codes)}`;
    }
    const noHealth = (r.json.entries ?? []).filter((e) => !e.health);
    return noHealth.length === 0 ? true : `${noHealth.length} đơn vị không có trạng thái`;
  });

  /**
   * Ca đối chứng BẮT BUỘC của kế hoạch (§4 L2 cổng ra): quét platform_admin qua toàn bộ
   * endpoint nghiệp vụ → 403 tất cả. Chạy trên API THẬT, không phải app trong process test —
   * đúng loại kiểm mà L2 cần vì nó đi qua đủ 5 tầng guard.
   */
  await check('[K9] platform@ bị chặn ở MỌI endpoint nghiệp vụ (quét thật, không ngoại lệ)', async () => {
    const eps = [
      ['GET', '/reviews'], ['GET', '/review-cycles'], ['GET', '/goals'], ['GET', '/checkins'],
      ['GET', '/evidence'], ['GET', '/persons'], ['GET', '/org-units'], ['GET', '/kpis'],
      ['GET', '/scorecards'], ['GET', '/objectives'], ['GET', '/admin/users'],
      ['GET', '/admin/roles'], ['GET', '/admin/tenant-config'], ['GET', '/audit-logs'],
      ['GET', '/data-catalog'], ['GET', '/export-log'], ['GET', '/task-cells'],
      ['GET', '/policies'], ['GET', '/exec/overview'], ['GET', '/ai/economics'],
      ['POST', '/goals'], ['POST', '/reviews'], ['POST', '/integrations/outbox/dispatch'],
    ];
    const leaks = [];
    for (const [m, u] of eps) {
      const r = await req(m, u, { ...plat, body: m === 'POST' ? {} : undefined });
      if (r.status < 400) leaks.push(`${m} ${u} → ${r.status}`);
    }
    if (eps.length < 20) return 'danh sách quét quá mỏng — sửa driver, không sửa ngưỡng';
    return leaks.length === 0 ? true : `RÒ: ${leaks.join(' · ')}`;
  });

  await check('[K1] hai quyền sổ vết tách nhau: platform@ chỉ số đếm, auditor@ chi tiết', async () => {
    const detail = await req('GET', '/export-log', { ...plat });
    if (detail.status !== 403) return `platform@ đọc được sổ vết chi tiết: ${is(detail, 403)}`;
    const counts = await req('GET', '/platform/export-activity', { ...plat });
    if (counts.status !== 200) return `số đếm: ${is(counts, 200)}`;
    const aud = await req('GET', '/export-log', { ...auditor });
    return is(aud, 200);   // đối chứng: không chặn oan B0
  });

  await check('Vai nghiệp vụ mạnh (hrbp) và quản trị đơn vị (tenant_admin) KHÔNG vào được tầng ①', async () => {
    for (const c of [hr, admin]) {
      const r = await req('GET', '/platform/tenants', { ...c });
      if (r.status !== 403) return `${c.prefix}@ vào được /platform/tenants: ${is(r, 403)}`;
    }
    return true;
  });

  await check('Snapshot chỉ chứa SỐ ĐẾM — không chuỗi nào trông giống PII', async () => {
    const r = await req('GET', '/platform/tenants', { ...plat });
    const withM = (r.json?.entries ?? []).filter((e) => e.metrics);
    if (withM.length === 0) return 'không đơn vị nào có metrics — chạy refresh trước';
    const bad = [];
    for (const e of withM) {
      for (const [k, v] of Object.entries(e.metrics)) {
        if (typeof v === 'number' || v === null) continue;
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) continue;
        bad.push(`${e.code}.${k}=${JSON.stringify(v)}`);
      }
    }
    return bad.length === 0 ? true : `metrics có giá trị không phải số/thời điểm: ${bad.join(', ')}`;
  });

  await check('B3 tạo được đơn vị mới (INSERT không RETURNING, qua RLS) và thấy nó ngay', async () => {
    const code = `DRV.${String(Date.now()).slice(-6)}`;
    // ⚠️ KHÔNG đặt tên biến này là `c`: `c` là bảng màu ở scope ngoài, và bản đầu đặt trùng
    // tên khiến dòng thông báo dọn dẹp in ra "undefined· đơn vị..." — lỗi nhỏ nhưng đúng loại
    // làm người đọc kết quả driver mất tin vào chính driver.
    const res = await req('POST', '/platform/tenants',
      { ...plat, body: { code, nameVi: 'Đơn vị driver', type: 'opco' } });
    if (![200, 201].includes(res.status)) return `tạo: ${is(res, 200, 201)}`;
    // Không có API xoá đơn vị (đúng thiết kế: xoá một đơn vị không phải việc một cú bấm) ⇒ ghi
    // nhận để người chạy biết, thay vì im lặng để lại rác.
    cleanup.push(async () => {
      console.log(`  ${c.d}· đơn vị '${code}' do driver tạo còn lại trong DB (không có API xoá — dọn tay nếu cần)${c.x}`);
    });
    const list = await req('GET', '/platform/tenants', { ...plat });
    const found = (list.json?.entries ?? []).find((e) => e.code === code);
    if (!found) return 'đơn vị vừa tạo không hiện trong danh sách toàn hệ';
    return found.health === 'unknown' ? true : `đơn vị mới phải là 'unknown', nhận '${found.health}'`;
  });

  await check('Cờ tính năng toàn cục: bật rồi tắt được (bề mặt duy nhất ghi hàng global)', async () => {
    const key = `drv.l2.${String(Date.now()).slice(-6)}`;
    const on = await req('PUT', `/platform/flags/${key}`, { ...plat, body: { enabled: true } });
    if (![200, 201].includes(on.status)) return `bật: ${is(on, 200, 201)}`;
    const off = await req('PUT', `/platform/flags/${key}`, { ...plat, body: { enabled: false } });
    return is(off, 200, 201);
  });

  // ═══ L2b — vai `support`: nhìn thấy cái người dùng thấy, không làm được gì ═══
  group('L2b — support chỉ-đọc: đóng vai được persona thật, ghi thì không');

  const support = await login('support');

  /**
   * `/me/access` KHÔNG trả `appUserId` (cố ý — nó là bảng quyền của chính mình, không phải
   * hồ sơ), nên id để đóng vai lấy từ danh bạ quản trị. `limit` đặt rộng: seed H.01 có ~14
   * tài khoản, nhưng khoá theo email chứ không theo vị trí trong trang — thêm người vào seed
   * sau này không được làm driver đo nhầm người.
   */
  const dir = await req('GET', '/admin/users?limit=200', { ...admin });
  const idOf = new Map((dir.json?.entries ?? []).map((e) => [String(e.email), e.appUserId]));
  const uid = (prefix) => idOf.get(`${prefix}@${DOM}`);
  await check('Danh bạ quản trị tra được id của mọi persona driver cần', () => {
    const missing = ['emp1', 'mgr', 'hr', 'exec', 'auditor', 'support', 'orgadmin'].filter((p) => !uid(p));
    return missing.length === 0 ? true : `thiếu id: ${missing.join(', ')}`;
  });

  /**
   * Cổng ra chính của lát: bốn persona nghiệp vụ. Trên API THẬT vì đây đúng là chỗ bản cũ
   * hỏng — J12① đo trên tập quyền lấy từ DB, và cả bốn persona đều giữ quyền ghi.
   */
  await check('[J12①] support@ mở được phiên đóng vai với emp1 · mgr · hr · exec', async () => {
    const refused = [];
    for (const p of ['emp1', 'mgr', 'hr', 'exec']) {
      const r = await req('POST', '/admin/impersonation', {
        ...support,
        body: {
          targetUserId: uid(p),
          reason: 'Người dùng báo lỗi không thấy dữ liệu của mình — hỗ trợ kiểm tra giao diện',
        },
      });
      if (![200, 201].includes(r.status)) refused.push(`${p} → ${r.status} ${msgOf(r).slice(0, 90)}`);
      else await req('DELETE', '/admin/impersonation/current', { token: r.json.token, tenantId: support.tenantId });
    }
    return refused.length === 0 ? true : `bị từ chối: ${refused.join(' · ')}`;
  });

  /** [K11] Ca đối chứng của kế hoạch: "support@ tự nó gọi mọi endpoint ghi đều 403". */
  await check('[K11] support@ tự nó bị chặn ở MỌI bề mặt ghi (quét thật)', async () => {
    const eps = [
      ['POST', '/goals'], ['POST', '/checkins'], ['POST', '/evidence'], ['POST', '/reviews'],
      ['POST', '/review-cycles'], ['POST', '/kpis'], ['POST', '/scorecards'], ['POST', '/objectives'],
      ['POST', '/org-units'], ['POST', '/persons'], ['POST', '/admin/users'],
      ['PATCH', '/admin/tenant-config'], ['POST', '/config-versions'], ['POST', '/policies'],
      ['POST', '/processes'], ['POST', '/library/contributions'], ['POST', '/authoring/grants'],
      ['POST', '/integrations/connections'], ['POST', '/integrations/outbox/dispatch'],
      ['POST', '/ai/chat'], ['PUT', '/data-catalog/objective.kpi'], ['POST', '/platform/tenants'],
    ];
    const leaks = [];
    for (const [m, u] of eps) {
      const r = await req(m, u, { ...support, body: {} });
      if (r.status < 400) leaks.push(`${m} ${u} → ${r.status}`);
    }
    if (eps.length < 20) return 'danh sách quét quá mỏng — sửa driver, không sửa ngưỡng';
    return leaks.length === 0 ? true : `RÒ: ${leaks.join(' · ')}`;
  });

  await check('[K11 đối chứng] support@ vẫn đọc được màn nghiệp vụ (không chặn oan)', async () => {
    const blocked = [];
    for (const u of ['/goals', '/checkins', '/evidence', '/reviews', '/persons', '/admin/users']) {
      const r = await req('GET', u, { ...support });
      if (r.status === 401 || r.status === 403) blocked.push(`${u} → ${r.status}`);
    }
    return blocked.length === 0 ? true : `bị chặn oan: ${blocked.join(' · ')}`;
  });

  await check('[J11] trong phiên đóng vai hr@, quyền GHI của hr bị cắt sạch', async () => {
    const s = await req('POST', '/admin/impersonation', {
      ...support,
      body: { targetUserId: uid('hr'), reason: 'Kiểm tra màn hình HR theo phản ánh của người dùng' },
    });
    if (![200, 201].includes(s.status)) return `mở phiên: ${is(s, 200, 201)}`;
    const imp = { token: s.json.token, tenantId: support.tenantId };
    try {
      const read = await req('GET', '/persons', { ...imp });
      if (read.status !== 200) return `đọc trong phiên: ${is(read, 200)}`;
      for (const [m, u] of [['POST', '/kpis'], ['POST', '/persons'], ['POST', '/calibration-sessions']]) {
        const r = await req(m, u, { ...imp, body: {} });
        if (r.status !== 403) return `${m} ${u} không bị chặn: ${is(r, 403)}`;
      }
      // đường XUẤT dữ liệu của hr cũng không dùng được qua phiên
      const ex = await req('GET', '/export/payroll?cycle=00000000-0000-0000-0000-000000000000', { ...imp });
      return is(ex, 403);
    } finally {
      await req('DELETE', '/admin/impersonation/current', { ...imp });
    }
  });

  await check('[J12②] support@ KHÔNG đóng vai được auditor@', async () => {
    const r = await req('POST', '/admin/impersonation', {
      ...support,
      body: { targetUserId: uid('auditor'), reason: 'Thử đóng vai kiểm toán viên — phải bị từ chối' },
    });
    if (r.status !== 403) return is(r, 403);
    return msgOf(r).includes('J12②') ? true : `chặn đúng nhưng sai lý do: ${msgOf(r)}`;
  });

  await check('[J3] support@ không đọc được audit-logs · export-log · nhật ký đóng vai', async () => {
    for (const u of ['/audit-logs', '/export-log', '/admin/impersonation']) {
      const r = await req('GET', u, { ...support });
      if (r.status !== 403) return `${u}: ${is(r, 403)}`;
    }
    return true;
  });

  await check('[J1⑤] SoD cấp vai — support ⟂ tenant_admin/org_admin, chặn CẢ HAI CHIỀU', async () => {
    const a = await req('POST', `/admin/users/${uid('support')}/roles`,
      { ...admin, body: { roleCode: 'tenant_admin', scopeType: 'tenant' } });
    if (a.status !== 409) return `gán tenant_admin cho support@: ${is(a, 409)}`;
    const b = await req('POST', `/admin/users/${uid('orgadmin')}/roles`,
      { ...admin, body: { roleCode: 'support', scopeType: 'tenant' } });
    if (b.status !== 409) return `gán support cho orgadmin@: ${is(b, 409)}`;
    return msgOf(a).includes('J1⑤') ? true : `chặn đúng nhưng sai lý do: ${msgOf(a)}`;
  });

  /**
   * Đối chứng cho chính bản vá J12①: trước lát này ca dưới trả 403 và đó là lý do tính năng
   * đóng vai không dùng được cho ai. Giữ trong driver để lần chạy sau còn thấy nó xanh.
   */
  await check('[đối chứng] admin@ nay đóng vai được emp1@ (quyền ghi của emp1 hết chặn oan)', async () => {
    const r = await req('POST', '/admin/impersonation', {
      ...admin,
      body: { targetUserId: uid('emp1'), reason: 'Kiểm tra bàn làm việc nhân viên theo phản ánh' },
    });
    if (![200, 201].includes(r.status)) return is(r, 200, 201);
    const imp = { token: r.json.token, tenantId: admin.tenantId };
    try {
      const w = await req('POST', '/goals', { ...imp, body: {} });
      return is(w, 403);   // J11 vẫn nguyên
    } finally {
      await req('DELETE', '/admin/impersonation/current', { ...imp });
    }
  });

  // ═══ L3 — ngoại lệ chính sách có thời hạn ═══
  group('L3 — ngoại lệ có hạn: nới được, nhưng có người duyệt và tự rụng');

  const steward2 = await login('steward');
  const EXC_REASON = 'Điều tra sự cố xuất dữ liệu đơn vị H.01 báo tối qua, cần xem sổ vết chi tiết';

  /**
   * Ca lõi: `platform_admin` bị L2 chặn ở sổ vết CHI TIẾT (chỉ được số đếm). Đây là lối ra mà
   * L2 đã hẹn — và nó phải chạy được thật, không chỉ tồn tại trong tài liệu.
   */
  await check('[K5] Xin → duyệt bởi NGƯỜI KHÁC → quyền mở ngay; người xin tự duyệt thì bị chặn', async () => {
    const before = await req('GET', '/export-log', { ...plat });
    if (before.status !== 403) return `platform@ đã đọc được sổ vết TRƯỚC khi có ngoại lệ: ${is(before, 403)}`;

    const asked = await req('POST', '/policy-exceptions', {
      ...admin,
      body: {
        granteeUserId: uid('platform'), permissionCode: 'exportlog:read',
        reason: EXC_REASON, requestedHours: 4,
      },
    });
    if (![200, 201].includes(asked.status)) return `xin: ${is(asked, 200, 201)}`;
    const excId = asked.json.id;
    cleanup.push(async () => { await req('POST', `/policy-exceptions/${excId}/revoke`, { ...steward2, body: {} }); });

    // chưa duyệt thì chưa có quyền
    const pending = await req('GET', '/export-log', { ...plat });
    if (pending.status !== 403) return `đơn còn pending mà quyền đã mở: ${is(pending, 403)}`;

    // [K5] người xin tự duyệt → chặn
    const selfApprove = await req('POST', `/policy-exceptions/${excId}/decide`, { ...admin, body: { approve: true, hours: 4 } });
    if (selfApprove.status !== 403) return `người xin tự duyệt được: ${is(selfApprove, 403)}`;

    const ok = await req('POST', `/policy-exceptions/${excId}/decide`, { ...steward2, body: { approve: true, hours: 4 } });
    if (![200, 201].includes(ok.status)) return `duyệt: ${is(ok, 200, 201)}`;

    const after = await req('GET', '/export-log', { ...plat });
    return is(after, 200);
  });

  await check('[K4] Ngoại lệ nới ĐÚNG MỘT quyền — không lan sang bề mặt nghiệp vụ nào', async () => {
    const leaks = [];
    for (const u of ['/reviews', '/persons', '/goals', '/audit-logs', '/data-catalog']) {
      const r = await req('GET', u, { ...plat });
      if (r.status < 400) leaks.push(`${u} → ${r.status}`);
    }
    return leaks.length === 0 ? true : `RÒ: ${leaks.join(' · ')}`;
  });

  await check('[K4] Mỗi lần dùng ngoại lệ để lại vết đếm được (B0 rà được)', async () => {
    const list = await req('GET', '/policy-exceptions', { ...auditor });
    if (list.status !== 200) return `auditor đọc sổ ngoại lệ: ${is(list, 200)}`;
    const active = (list.json?.entries ?? []).find((e) => e.permissionCode === 'exportlog:read' && e.status === 'approved');
    if (!active) return 'không thấy đơn đang hiệu lực trong sổ';
    if (!(active.usedCount > 0)) return `usedCount = ${active.usedCount} sau khi đã dùng`;
    return active.approver?.email?.startsWith('steward@')
      ? true : `người duyệt ghi sai: ${JSON.stringify(active.approver)}`;
  });

  await check('[K3] `export:confidential` KHÔNG nới được bằng ngoại lệ (422, không tạo đơn)', async () => {
    const r = await req('POST', '/policy-exceptions', {
      ...admin,
      body: {
        granteeUserId: uid('hr'), permissionCode: 'export:confidential',
        reason: EXC_REASON, requestedHours: 2,
      },
    });
    if (r.status !== 422) return is(r, 422);
    return msgOf(r).includes('ngoại lệ') ? true : `chặn đúng nhưng thông báo không nêu lý do: ${msgOf(r)}`;
  });

  await check('[J3] `audit:read` KHÔNG nới được bằng ngoại lệ', async () => {
    const r = await req('POST', '/policy-exceptions', {
      ...admin,
      body: {
        granteeUserId: uid('platform'), permissionCode: 'audit:read',
        reason: EXC_REASON, requestedHours: 2,
      },
    });
    return is(r, 422);
  });

  await check('[K4] Xin quá trần cứng 72h → chặn ngay ở cửa', async () => {
    const r = await req('POST', '/policy-exceptions', {
      ...admin,
      body: {
        granteeUserId: uid('platform'), permissionCode: 'review:read',
        reason: EXC_REASON, requestedHours: 100,
      },
    });
    return is(r, 400, 422);
  });

  await check('[K5] Vai vận hành KHÔNG duyệt được, vai duyệt KHÔNG xin được', async () => {
    const platApprove = await req('POST', '/policy-exceptions/00000000-0000-0000-0000-000000000000/decide',
      { ...plat, body: { approve: true } });
    if (platApprove.status !== 403) return `platform@ duyệt được: ${is(platApprove, 403)}`;
    const stewardAsk = await req('POST', '/policy-exceptions', {
      ...steward2,
      body: {
        granteeUserId: uid('platform'), permissionCode: 'review:read',
        reason: EXC_REASON, requestedHours: 2,
      },
    });
    return is(stewardAsk, 403);
  });

  await check('Thu hồi sớm → quyền mất NGAY, không chờ hết hạn', async () => {
    const list = await req('GET', '/policy-exceptions?status=approved', { ...auditor });
    const active = (list.json?.entries ?? []).find((e) => e.permissionCode === 'exportlog:read');
    if (!active) return 'không có đơn đang hiệu lực để thu hồi';
    const r = await req('POST', `/policy-exceptions/${active.id}/revoke`,
      { ...steward2, body: { note: 'Driver dọn — sự cố đã đóng' } });
    if (![200, 201].includes(r.status)) return `thu hồi: ${is(r, 200, 201)}`;
    const after = await req('GET', '/export-log', { ...plat });
    return is(after, 403);
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
