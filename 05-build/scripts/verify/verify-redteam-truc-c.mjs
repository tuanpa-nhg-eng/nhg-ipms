#!/usr/bin/env node
/**
 * ĐỘI ĐỎ TỰ ĐÁNH — TRỤC C, chạy TRƯỚC khi mời Reviewer đối kháng (L7).
 *
 *   node scripts/verify/verify-redteam-truc-c.mjs
 *
 * Khác `verify-governance.mjs`: driver kia chứng minh tính năng CHẠY ĐÚNG; script này cố tình
 * đi tìm đường VÒNG. Danh sách tấn công lấy nguyên văn từ kế hoạch §4 L7 — năm trọng tâm
 * Reviewer sẽ soi, cộng ca đối chứng bắt buộc "hạn chế mới không chặn oan luồng đang chạy".
 *
 * Quy ước đọc kết quả:
 *   ✅ = đòn tấn công BỊ CHẶN đúng như thiết kế
 *   🔴 = LỖ THẬT, phải vá trước khi mời Reviewer
 *   ⚠️  = hành vi đúng thiết kế nhưng ĐÁNG BÁO CÁO — chủ dự án cần biết để quyết
 *
 * ⚠️ Điều kiện: API :4000 đã kill+restart sau lần sửa mã cuối (bài học trục B ②).
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const TENANT = process.env.TENANT_CODE ?? 'H.01';
const DOM = 'h01.nhg.local';

let blocked = 0;
const holes = [];
const notes = [];
const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', x: '\x1b[0m' };

function group(t) { console.log(`\n${c.d}── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}${c.x}`); }

/** `fn` trả về: true = chặn đúng · string = mô tả LỖ · {note} = ghi nhận cần báo cáo. */
async function attack(name, fn) {
  try {
    const r = await fn();
    if (r === true) { blocked++; console.log(`  ${c.g}✅${c.x} ${name}`); }
    else if (r && typeof r === 'object' && r.note) {
      notes.push(`${name} → ${r.note}`);
      console.log(`  ${c.y}⚠️${c.x}  ${name} ${c.y}→ ${r.note}${c.x}`);
    } else {
      holes.push(`${name} → ${r}`);
      console.log(`  ${c.r}🔴${c.x} ${name} ${c.r}→ ${r}${c.x}`);
    }
  } catch (e) {
    holes.push(`${name} → NÉM LỖI: ${e.message}`);
    console.log(`  ${c.r}🔴${c.x} ${name} ${c.r}→ ném lỗi: ${e.message}${c.x}`);
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

async function login(prefix) {
  const r = await req('POST', '/auth/dev-token', { body: { email: `${prefix}@${DOM}`, tenantCode: TENANT } });
  if (!r.json?.access_token) throw new Error(`dev-token ${prefix}: ${r.status}`);
  return { token: r.json.access_token, tenantId: r.json.tenant_id, prefix };
}

const msgOf = (r) => String(r.json?.error?.message ?? r.json?.message ?? '');

async function main() {
  console.log(`\n${c.y}ĐỘI ĐỎ TỰ ĐÁNH — TRỤC C (trước khi mời Reviewer)${c.x}`);
  console.log(`${c.d}${BASE} · tenant ${TENANT}${c.x}`);

  const admin = await login('admin');
  const hr = await login('hr');
  const steward = await login('steward');
  const auditor = await login('auditor');
  const plat = await login('platform');
  const support = await login('support');
  const emp = await login('emp1');

  const dir = await req('GET', '/admin/users?limit=200', { ...admin });
  const idOf = new Map((dir.json?.entries ?? []).map((e) => [String(e.email), e.appUserId]));
  const uid = (p) => idOf.get(`${p}@${DOM}`);
  const REASON = 'Đội đỏ tự đánh trục C trước khi mời Reviewer đối kháng, kiểm đường vòng';

  // ═══ ① Đường vòng né ExportGuard ═══
  group('① Đường vòng né cổng xuất dữ liệu (K2/K3)');

  await attack('Xuất qua PHIÊN ĐÓNG VAI: mượn quyền người khác để mang dữ liệu ra', async () => {
    // support đóng vai hr@ (người CÓ payroll:export) rồi thử gọi đường xuất.
    const s = await req('POST', '/admin/impersonation', {
      ...support, body: { targetUserId: uid('hr'), reason: REASON },
    });
    if (![200, 201].includes(s.status)) return `không mở được phiên để thử (${s.status})`;
    const imp = { token: s.json.token, tenantId: support.tenantId };
    try {
      const cycles = await req('GET', '/review-cycles', { ...imp });
      const cid = (cycles.json?.entries ?? cycles.json ?? [])[0]?.id ?? '00000000-0000-0000-0000-000000000000';
      const r = await req('GET', `/export/payroll?cycle=${cid}`, { ...imp });
      return r.status === 403 ? true : `xuất được trong phiên đóng vai: ${r.status}`;
    } finally {
      await req('DELETE', '/admin/impersonation/current', { ...imp });
    }
  });

  await attack('Nới trần xuất bằng NGOẠI LỆ có hạn (K3 phải không có đường vòng)', async () => {
    const r = await req('POST', '/policy-exceptions', {
      ...admin,
      body: {
        granteeUserId: uid('hr'), permissionCode: 'export:confidential',
        reason: REASON, requestedHours: 4,
      },
    });
    return r.status === 422 ? true : `xin được ngoại lệ mở trần xuất: ${r.status}`;
  });

  await attack('Đẩy outbox KHÔNG qua HTTP (đường worker) vẫn phải qua cổng + ghi vết', async () => {
    // Siết `system.log` → restricted rồi gọi dispatch: nếu cổng nằm ở service (L6) thì cả hai
    // đường gọi đều bị chặn. Trước L6, chỉ đường HTTP bị chặn.
    const t = await req('PUT', '/data-catalog/system.log', { ...steward, body: { classification: 'restricted' } });
    if (![200, 201].includes(t.status)) return `không siết được mức để thử (${t.status})`;
    try {
      const r = await req('POST', '/integrations/outbox/dispatch', { ...hr, body: {} });
      if (r.status !== 403) return `đẩy được dữ liệu restricted ra ngoài: ${r.status}`;
      return msgOf(r).includes('K3') || msgOf(r).includes('restricted')
        ? true : `chặn nhưng không nêu lý do K3: ${msgOf(r)}`;
    } finally {
      await req('PUT', '/data-catalog/system.log', { ...steward, body: { classification: 'internal' } });
    }
  });

  await attack('Xuất dữ liệu mà KHÔNG để lại vết (ghi vết hỏng ⇒ phải chặn, không phải cho qua)', async () => {
    // Không mô phỏng được lỗi ghi vết từ ngoài; thay vào đó kiểm bất biến quan sát được: mọi
    // lần xuất thành công đều có dòng vết mang đủ bốn thông tin.
    const r = await req('GET', '/export-log?limit=50', { ...auditor });
    const bad = (r.json?.entries ?? []).filter(
      (e) => !e.assetCode || !e.classification || !e.destination || e.recordCount === null,
    );
    return bad.length === 0 ? true : `${bad.length} dòng vết thiếu thông tin bắt buộc`;
  });

  // ═══ ② platform_admin leo thang đọc nội dung ═══
  group('② Tầng nền tảng leo thang đọc nội dung nghiệp vụ (K1/K9)');

  await attack('Quét toàn bộ bề mặt nghiệp vụ bằng token platform_admin', async () => {
    const eps = [
      ['GET', '/reviews'], ['GET', '/persons'], ['GET', '/goals'], ['GET', '/evidence'],
      ['GET', '/checkins'], ['GET', '/scorecards'], ['GET', '/audit-logs'], ['GET', '/export-log'],
      ['GET', '/admin/users'], ['GET', '/risk'], ['GET', '/retention/policies'],
      ['GET', '/policy-exceptions'], ['GET', '/incidents'],
    ];
    const leaks = [];
    for (const [m, u] of eps) {
      const r = await req(m, u, { ...plat });
      if (r.status < 400) leaks.push(`${m} ${u} → ${r.status}`);
    }
    return leaks.length === 0 ? true : `RÒ: ${leaks.join(' · ')}`;
  });

  /**
   * Đòn đáng giá nhất của mục này: dùng chính ĐƯỜNG HỢP LỆ (ngoại lệ có hạn) để nới K9. Nếu
   * B5 duyệt, `platform_admin` sẽ giữ một quyền ngoài allowlist — và phòng tuyến thứ hai của
   * L2 (`assertWithinAllowlist`) phải phản ứng.
   */
  await attack('Nới K9 bằng ngoại lệ hợp lệ: platform_admin xin quyền đọc dữ liệu nghiệp vụ', async () => {
    const ask = await req('POST', '/policy-exceptions', {
      ...plat,
      body: {
        granteeUserId: uid('platform'), permissionCode: 'person:read',
        reason: REASON, requestedHours: 1,
      },
    });
    if (![200, 201].includes(ask.status)) return { note: `không xin được (${ask.status}) — K9 không nới được kể cả qua đường hợp lệ` };
    const excId = ask.json.id;
    const ok = await req('POST', `/policy-exceptions/${excId}/decide`, {
      ...steward, body: { approve: true, hours: 1 },
    });
    try {
      if (![200, 201].includes(ok.status)) return { note: `B5 không duyệt được (${ok.status})` };
      const read = await req('GET', '/persons', { ...plat });
      const surface = await req('GET', '/platform/tenants', { ...plat });
      if (read.status < 400 && surface.status < 400) {
        return 'platform_admin vừa đọc được dữ liệu nghiệp vụ VỪA giữ nguyên bề mặt nền tảng';
      }
      return {
        note: `đọc /persons → ${read.status}; bề mặt /platform/tenants → ${surface.status}. `
          + 'Ngoại lệ nới được quyền đọc (có người duyệt, có hạn, có vết) NHƯNG bề mặt nền tảng '
          + 'TỰ KHOÁ vì allowlist K9 — hai lớp bảo vệ tương tác đúng chiều, cần ghi vào hồ sơ.',
      };
    } finally {
      await req('POST', `/policy-exceptions/${excId}/revoke`, { ...steward, body: { note: 'đội đỏ dọn' } });
    }
  });

  await attack('Vai support (chỉ-đọc) tự nâng quyền bằng cách đóng vai người mạnh hơn', async () => {
    // support KHÔNG được đóng vai auditor (J12②) và không được ghi gì trong phiên (J11).
    const a = await req('POST', '/admin/impersonation', {
      ...support, body: { targetUserId: uid('auditor'), reason: REASON },
    });
    if (a.status !== 403) return `đóng vai được auditor: ${a.status}`;
    const s = await req('POST', '/admin/impersonation', {
      ...support, body: { targetUserId: uid('hr'), reason: REASON },
    });
    if (![200, 201].includes(s.status)) return `không mở được phiên hợp lệ để thử ghi (${s.status})`;
    const imp = { token: s.json.token, tenantId: support.tenantId };
    try {
      const w = await req('POST', '/kpis', { ...imp, body: {} });
      return w.status === 403 ? true : `ghi được trong phiên đóng vai: ${w.status}`;
    } finally {
      await req('DELETE', '/admin/impersonation/current', { ...imp });
    }
  });

  // ═══ ③ Ngoại lệ không hết hạn / gia hạn vô hạn ═══
  group('③ Ngoại lệ có hạn: gia hạn, tự duyệt, kéo dài (K4/K5)');

  await attack('Tự duyệt đơn của chính mình (K5)', async () => {
    const ask = await req('POST', '/policy-exceptions', {
      ...admin,
      body: { granteeUserId: uid('exec'), permissionCode: 'review:read', reason: REASON, requestedHours: 2 },
    });
    if (![200, 201].includes(ask.status)) return `không tạo được đơn để thử (${ask.status})`;
    const r = await req('POST', `/policy-exceptions/${ask.json.id}/decide`, {
      ...admin, body: { approve: true, hours: 2 },
    });
    return r.status === 403 ? true : `người xin tự duyệt được: ${r.status}`;
  });

  await attack('Duyệt cho CHÍNH MÌNH qua người khác đứng tên xin (K5 vế thứ ba)', async () => {
    const ask = await req('POST', '/policy-exceptions', {
      ...admin,
      body: { granteeUserId: uid('steward'), permissionCode: 'review:read', reason: REASON, requestedHours: 2 },
    });
    if (![200, 201].includes(ask.status)) return `không tạo được đơn (${ask.status})`;
    const r = await req('POST', `/policy-exceptions/${ask.json.id}/decide`, {
      ...steward, body: { approve: true, hours: 2 },
    });
    return r.status === 403 ? true : `người duyệt tự cấp cho mình được: ${r.status}`;
  });

  await attack('Xin trần vượt 72h, và xin nhiều lần nối nhau để kéo dài vô hạn', async () => {
    const over = await req('POST', '/policy-exceptions', {
      ...admin,
      body: { granteeUserId: uid('exec'), permissionCode: 'review:read', reason: REASON, requestedHours: 1000 },
    });
    if (![400, 422].includes(over.status)) return `xin được ${1000}h: ${over.status}`;
    // Nối chuỗi: mỗi lần là một đơn MỚI, có người duyệt mới và vết mới — đúng thiết kế, nhưng
    // KHÔNG có trần TỔNG. Ghi nhận để chủ dự án quyết có cần trần tổng không.
    return {
      note: 'trần 72h/đơn chặn đúng; nhưng KHÔNG có trần TỔNG thời gian — xin đơn mới liên tiếp '
        + 'thì một quyền có thể duy trì lâu dài. Mỗi lần vẫn cần B5 duyệt và để lại vết (đúng '
        + 'thiết kế K4/K5), nên đây là quyết định chính sách chứ không phải lỗ kỹ thuật.',
    };
  });

  // ═══ ④ Job lưu trữ xoá nhầm phạm vi ═══
  group('④ Job lưu trữ: xoá nhầm phạm vi, xoá sổ vết (K6/K7)');

  await attack('Chạy thật bằng lượt thử của MÃ DỮ LIỆU KHÁC', async () => {
    const dry = await req('POST', '/retention/dry-run/system.log', { ...steward, body: {} });
    if (![200, 201].includes(dry.status)) return `không chạy thử được (${dry.status})`;
    const r = await req('POST', '/retention/apply/review.result', {
      ...steward, body: { dryRunId: dry.json.id },
    });
    return [409, 422].includes(r.status) ? true : `chạy thật chéo mã dữ liệu: ${r.status}`;
  });

  await attack('Đặt chính sách xoá cho sổ kiểm toán / sổ xuất (K6)', async () => {
    for (const code of ['audit.log', 'export.log']) {
      const r = await req('PUT', `/retention/policies/${code}`, {
        ...steward, body: { retentionMonths: 1, action: 'hard_delete' },
      });
      if (r.status !== 422) return `đặt được chính sách xoá cho ${code}: ${r.status}`;
    }
    return true;
  });

  await attack('Xoá dữ liệu kỳ đánh giá CHƯA CHỐT (K7)', async () => {
    const dry = await req('POST', '/retention/dry-run/review.result', { ...steward, body: {} });
    if (![200, 201].includes(dry.status)) return `không chạy thử được (${dry.status})`;
    // `skippedProtected` là bằng chứng phép lọc K7 đang chạy. 0 ở đây CÓ THỂ đúng (không có
    // review quá hạn thuộc kỳ mở) nên chỉ ghi nhận, không kết luận là lỗ.
    return dry.json.skippedProtected > 0
      ? true
      : { note: `không có bản ghi nào bị K7 chặn ở lượt này (skippedProtected=0) — không đủ dữ liệu để kết luận, spec jest có ca dựng sẵn` };
  });

  // ═══ ⑤ Cờ rủi ro giả hoặc bỏ sót ═══
  group('⑤ Cờ rủi ro: bỏ sót, ghi sai người, tắt bằng tay (K8)');

  await attack('Tắt một cờ rủi ro bằng tay (K8 — cờ là sự kiện đã xảy ra)', async () => {
    const list = await req('GET', '/risk?limit=5', { ...steward });
    if (!(list.json?.entries ?? []).length) return { note: 'không có cờ nào để thử' };
    // Không có endpoint xoá/sửa cờ — chính điều đó là câu trả lời. Kiểm bằng cách thử các
    // động từ có thể có; 404/405 đều là "không tồn tại đường đó".
    const id = list.json.entries[0].id;
    for (const [m, u] of [['DELETE', `/risk/${id}`], ['PATCH', `/risk/${id}`], ['PUT', `/risk/${id}`]]) {
      const r = await req(m, u, { ...steward, body: { severity: 'low' } });
      if (r.status < 400) return `${m} ${u} sửa/xoá được cờ: ${r.status}`;
    }
    return true;
  });

  /**
   * [F188 — bài học trục B] Vết phải mang tên ACTOR THẬT, không phải người bị đóng vai. Cờ rủi
   * ro suy ra từ vết, nên nếu vết ghi sai người thì cờ chỉ sai người.
   */
  /**
   * [Sửa sau lần chạy đầu — LỖI ĐO, không phải lỗi sản phẩm] Bản đầu chỉ nhìn 20 cờ mới nhất
   * rồi báo đỏ nếu thấy cờ nào mang tên `emp1@`. Nhưng `emp1` cũng tự thao tác và cũng bị
   * chính sách từ chối trong các lượt test khác — những cờ đó mang tên `emp1` một cách HOÀN
   * TOÀN ĐÚNG. Đội đỏ báo động giả còn tệ hơn không có đội đỏ: nó tiêu thời gian của người
   * đọc vào một chỗ không hỏng.
   *
   * Bản này đo đúng đối tượng: chốt mốc vết TRƯỚC, gây vi phạm TRONG phiên, rồi chỉ xét những
   * vết SINH RA SAU mốc đó.
   */
  await attack('Gây vi phạm TRONG phiên đóng vai → vết phải ghi ACTOR THẬT (F188)', async () => {
    const before = await req('GET', '/audit-logs?limit=1', { ...auditor });
    const sinceId = BigInt((before.json?.entries ?? [])[0]?.id ?? '0');

    const s = await req('POST', '/admin/impersonation', {
      ...admin, body: { targetUserId: uid('emp1'), reason: REASON },
    });
    if (![200, 201].includes(s.status)) return `không mở được phiên (${s.status})`;
    const imp = { token: s.json.token, tenantId: admin.tenantId };
    try {
      // `kpi:read` đi qua RBAC nhưng vướng chính sách ABAC ⇒ PolicyGuard ghi `policy.denied`.
      // Đây đúng là bề mặt F188 đã hỏng một lần ở trục B.
      await req('GET', '/kpis', { ...imp });
      await req('POST', '/goals', { ...imp, body: {} });

      const after = await req('GET', '/audit-logs?limit=50', { ...auditor });
      const fresh = (after.json?.entries ?? []).filter((e) => BigInt(e.id) > sinceId);
      if (fresh.length === 0) return { note: 'không sinh vết mới nào trong phiên — không đủ dữ liệu để kết luận' };
      const wrong = fresh.filter((e) => e.actor?.email?.startsWith('emp1@'));
      return wrong.length === 0
        ? true
        : `${wrong.length} vết MỚI ghi tên người bị đóng vai: ${wrong.map((e) => `${e.id}/${e.action}`).join(', ')}`;
    } finally {
      await req('DELETE', '/admin/impersonation/current', { ...imp });
    }
  });

  // ═══ ⑥ CA ĐỐI CHỨNG BẮT BUỘC ═══
  group('⑥ Đối chứng: hạn chế mới KHÔNG chặn oan luồng nghiệp vụ đang chạy');

  await attack('Nhân viên vẫn làm được việc của mình (mục tiêu, check-in, tự đánh giá)', async () => {
    const blockedPaths = [];
    for (const u of ['/goals', '/checkins', '/reviews', '/evidence']) {
      const r = await req('GET', u, { ...emp });
      if (r.status === 403) blockedPaths.push(`${u} → 403`);
    }
    return blockedPaths.length === 0 ? true : `chặn oan nhân viên: ${blockedPaths.join(' · ')}`;
  });

  await attack('HR vẫn chạy được nghiệp vụ (KPI, kỳ đánh giá, cân chỉnh, đẩy tích hợp)', async () => {
    const blockedPaths = [];
    for (const u of ['/kpis', '/review-cycles', '/persons', '/scorecards']) {
      const r = await req('GET', u, { ...hr });
      if (r.status === 403) blockedPaths.push(`${u} → 403`);
    }
    const d = await req('POST', '/integrations/outbox/dispatch', { ...hr, body: {} });
    if (d.status === 403) blockedPaths.push(`POST /integrations/outbox/dispatch → 403`);
    return blockedPaths.length === 0 ? true : `chặn oan HR: ${blockedPaths.join(' · ')}`;
  });

  await attack('Quản trị đơn vị vẫn onboard được người (mốc demo trục B còn nguyên)', async () => {
    const roles = await req('GET', '/admin/roles', { ...admin });
    if (roles.status !== 200) return `không đọc được danh mục vai: ${roles.status}`;
    const codes = (roles.json ?? []).map((r) => r.code);
    const need = ['employee', 'exec_viewer'];
    const missing = need.filter((n) => !codes.includes(n));
    return missing.length === 0
      ? true
      : `tenant_admin KHÔNG còn gán được vai: ${missing.join(', ')} — mốc demo trục B gãy`;
  });

  await attack('Kiểm toán viên vẫn đọc được mọi hồ sơ giám sát', async () => {
    const blockedPaths = [];
    for (const u of ['/audit-logs', '/export-log', '/policy-exceptions', '/risk', '/incidents', '/retention/runs']) {
      const r = await req('GET', u, { ...auditor });
      if (r.status >= 400) blockedPaths.push(`${u} → ${r.status}`);
    }
    return blockedPaths.length === 0 ? true : `B0 bị chặn: ${blockedPaths.join(' · ')}`;
  });

  // ── kết ──
  const total = blocked + holes.length;
  console.log(`\n${holes.length === 0 ? c.g : c.r}${blocked}/${total}${c.x} đòn bị chặn · ${notes.length} ghi nhận cần báo cáo`);
  if (notes.length) {
    console.log(`\n${c.y}GHI NHẬN (đúng thiết kế, cần chủ dự án biết):${c.x}`);
    notes.forEach((n) => console.log(`  · ${n}`));
  }
  if (holes.length) {
    console.log(`\n${c.r}LỖ THẬT — VÁ TRƯỚC KHI MỜI REVIEWER:${c.x}`);
    holes.forEach((h) => console.log(`  · ${h}`));
    process.exit(1);
  }
  console.log(`\n${c.g}KHÔNG TÌM THẤY LỖ NÀO Ở SÁU TRỌNG TÂM${c.x}`);
}

main().catch((e) => { console.error(`\n${c.r}ĐỘI ĐỎ NGÃ:${c.x} ${e.message}\n`); process.exit(2); });
