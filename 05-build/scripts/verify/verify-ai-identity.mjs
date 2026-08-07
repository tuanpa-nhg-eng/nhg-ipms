#!/usr/bin/env node
/**
 * [Trục D] Driver sống — LỚP AI CÓ DANH TÍNH, chạy trên API :4000 THẬT.
 *
 * Vì sao có tệp này thay vì chỉ dựa vào jest: trục A và trục B từng có driver 120/120 và
 * 29/29 viết trong scratchpad của phiên — cả hai đã mất, và những con số đó không tái lập
 * được. Từ trục C, driver nằm trong repo và được commit như mã nguồn.
 *
 * ⚠️ API dev server KHÔNG watch — kill PID :4000 rồi start lại TRƯỚC khi chạy, nếu không là
 * đo mã cũ mà tưởng đo mã mới (bài học trục B, và đã tái diễn ở trục D L0).
 *
 * Chạy:  node scripts/verify/verify-ai-identity.mjs
 */
const BASE = process.env.IPMS_API ?? 'http://localhost:4000/api/v1';

let pass = 0; let fail = 0;
const notes = [];
const ok = (m) => { pass += 1; console.log(`  \x1b[32m✅\x1b[0m ${m}`); };
const bad = (m, detail) => { fail += 1; console.log(`  \x1b[31m❌\x1b[0m ${m}${detail ? `\n       ${detail}` : ''}`); };
const section = (t) => console.log(`\n\x1b[2m── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}\x1b[0m`);

async function token(email, tenantCode = 'H.01') {
  const r = await fetch(`${BASE}/auth/dev-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, tenantCode }),
  });
  if (!r.ok) throw new Error(`dev-token ${email}: ${r.status}`);
  const j = await r.json();
  return { h: { Authorization: `Bearer ${j.access_token}`, 'X-Tenant-Id': j.tenant_id, 'Content-Type': 'application/json' } };
}

async function call(path, { h }, init = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...h, ...(init.headers ?? {}) } });
  let body = null;
  try { body = await r.json(); } catch { /* có route trả rỗng */ }
  return { status: r.status, body };
}

async function main() {
  console.log('\x1b[1mTRỤC D — driver sống: lớp AI có danh tính\x1b[0m');

  const steward = await token('steward@h01.nhg.local');
  const emp = await token('emp1@h01.nhg.local');
  const designer = await token('designer@h01.nhg.local');

  // ═══════════════════ L0 — danh bạ agent ═══════════════════
  section('L0 — danh bạ agent: ai, chủ quản nào, trần bao nhiêu');

  const list = await call('/ai/agents', steward);
  if (list.status === 200 && Array.isArray(list.body?.entries)) {
    ok(`Chủ dữ liệu đọc được danh bạ — ${list.body.entries.length} agent`);
  } else bad('Chủ dữ liệu đọc danh bạ', `status=${list.status}`);

  const seeded = (list.body?.entries ?? []).filter((e) => !e.code.startsWith('test.'));
  const active = seeded.filter((e) => e.status === 'active');
  const planned = seeded.filter((e) => e.status === 'planned');
  if (active.length > 0 && planned.length > 0) {
    ok(`Sổ nói đúng hiện trạng: ${active.length} agent đang chạy, ${planned.length} agent mới khai danh tính`);
  } else bad('Sổ phân biệt agent đang chạy / mới khai', `active=${active.length} planned=${planned.length}`);

  // BR-M09-02 đòi SÁU thông tin cho mỗi agent — kiểm trên ĐƯỜNG ĐỌC, không chỉ trong DB.
  const thieu = seeded.filter((e) => !e.purpose || !e.ownerRole || !e.maxDataClass
    || !e.hitlMode || !Array.isArray(e.permissions) || !Array.isArray(e.dataAssetCodes));
  if (seeded.length > 0 && thieu.length === 0) {
    ok('Mọi agent trả đủ sáu thông tin BR-M09-02 (mục đích · chủ quản · trần · phạm vi · quyền · HITL)');
  } else bad('Đủ sáu thông tin BR-M09-02', `thiếu ở: ${thieu.map((x) => x.code).join(', ') || '(sổ rỗng)'}`);

  const empRead = await call('/ai/agents', emp);
  if (empRead.status === 403) ok('Nhân viên thường KHÔNG đọc được danh bạ — 403');
  else bad('Nhân viên thường bị chặn khỏi danh bạ', `status=${empRead.status}`);

  const ghost = await call('/ai/agents/khong.he.ton.tai', steward);
  if (ghost.status === 404) ok('Agent chưa đăng ký ⇒ 404 fail-closed, không mặc định về agent chung chung');
  else bad('Agent lạ trả 404', `status=${ghost.status}`);

  // ═══════════════════ L0 — không nới lỏng ═══════════════════
  section('L0 — đơn vị chỉ SIẾT được hiến chương, không nới');

  const noiTran = await call('/ai/agents/inline.taskcell.draft', steward, {
    method: 'PUT', body: JSON.stringify({ maxDataClass: 'confidential' }),
  });
  if (noiTran.status === 422) ok('Nâng trần phân loại của agent ⇒ 422');
  else bad('Nâng trần bị chặn', `status=${noiTran.status}`);

  const noiQuyen = await call('/ai/agents/inline.taskcell.draft', steward, {
    method: 'PUT', body: JSON.stringify({ permissions: ['taskcell:read', 'payroll:export'] }),
  });
  if (noiQuyen.status === 422) ok('Thêm quyền ngoài hiến chương chuẩn ⇒ 422');
  else bad('Thêm quyền bị chặn', `status=${noiQuyen.status}`);

  const tuBat = await call('/ai/agents/review.summarizer', steward, {
    method: 'PUT', body: JSON.stringify({ status: 'active' }),
  });
  if (tuBat.status === 422) ok('Tự BẬT agent đang chờ mô hình nội bộ ⇒ 422 (N7)');
  else bad('Tự bật agent planned bị chặn', `status=${tuBat.status}`);

  const adminGhi = await call('/ai/agents/inline.taskcell.draft', await token('admin@h01.nhg.local'), {
    method: 'PUT', body: JSON.stringify({ maxDataClass: 'public' }),
  });
  if (adminGhi.status === 403) ok('Quản trị đơn vị KHÔNG sửa được hiến chương — chỉ chủ dữ liệu');
  else bad('Chỉ chủ dữ liệu sửa được hiến chương', `status=${adminGhi.status}`);

  // ═══════════════════ L1 — trần thuộc về agent ═══════════════════
  section('L1 — mức phân loại suy từ sổ, không do người gọi khai');

  // ĐỐI CHỨNG TRƯỚC: luồng thật phải còn chạy. Siết mà làm hỏng tính năng thì không phải an toàn.
  // Tác vụ nằm ở ĐƯỜNG DẪN (`/ai/inline/:task`), không ở body — bản đầu của driver gọi
  // `/ai/inline/assist` và ăn 422 "task 'assist' không hợp lệ". Ghi lại vì đây đúng loại lỗi
  // mà chỉ driver sống bắt được: typecheck và jest đều không biết gì về URL này.
  const inline = await call('/ai/inline/taskcell.draft', designer, {
    method: 'POST',
    body: JSON.stringify({ input: { payload: { code: `DRV-${Date.now()}`, nameVi: 'Tác vụ thử' } } }),
  });
  if (inline.status === 201 || inline.status === 200) {
    ok('ĐỐI CHỨNG — gợi ý inline vẫn chạy sau khi bật ba cổng (không chặn oan)');
  } else {
    bad('Gợi ý inline còn chạy', `status=${inline.status} ${JSON.stringify(inline.body).slice(0, 200)}`);
  }

  // Lượt gọi vừa rồi phải để lại MỨC PHÂN LOẠI trong sổ — thứ trước trục D không tồn tại.
  const econ = await call('/ai/economics', designer);
  if (econ.status === 200) {
    const codes = new Set((list.body?.entries ?? []).map((e) => e.code));
    const laA = (econ.body.agents ?? []).map((a) => a.agent);
    const ngoaiSo = laA.filter((a) => !codes.has(a));
    if (laA.length > 0 && ngoaiSo.length === 0) {
      ok(`Báo cáo chi phí AI chỉ gồm agent có trong danh bạ — ${laA.length} agent`);
    } else {
      bad('Báo cáo chi phí chỉ gồm agent đăng ký', `ngoài sổ: ${ngoaiSo.slice(0, 5).join(', ')}`);
    }
    if (econ.body.totalActualCostUsd === 0) {
      ok('RED-LINE — tổng chi phí thật = 0 (chưa gọi API ngoài lần nào)');
    } else {
      notes.push(`Chi phí thật ≠ 0 (${econ.body.totalActualCostUsd}) — kiểm nguồn trước khi kết luận`);
      bad('Chi phí thật = 0', `= ${econ.body.totalActualCostUsd}`);
    }
  } else bad('Đọc được báo cáo chi phí AI', `status=${econ.status}`);

  const ready = await call('/ai/eval/readiness', designer);
  if (ready.status === 200) {
    const codes = new Set((list.body?.entries ?? []).map((e) => e.code));
    const ngoai = (ready.body.agents ?? []).map((a) => a.agent).filter((a) => !codes.has(a));
    if (ngoai.length === 0) ok('Checklist sẵn-sàng-live chỉ xét agent có trong danh bạ');
    else bad('Checklist chỉ xét agent đăng ký', `ngoài sổ: ${ngoai.slice(0, 5).join(', ')}`);
  } else bad('Đọc được checklist sẵn-sàng-live', `status=${ready.status}`);

  // ═══════════════════ L2 — quyền hữu hiệu của agent ═══════════════════
  section('L2 — quyền hữu hiệu: agent không mượn trọn quyền người gọi nữa');

  // Hiến chương phải mô tả ĐÚNG thứ đường chạy đòi — nếu không, siết là giết tính năng.
  const mcpAgent = (list.body?.entries ?? []).find((e) => e.code === 'mcp');
  if (mcpAgent) {
    const can = ['org:read', 'kpi:read', 'scorecard:read', 'taskcell:read', 'config:write'];
    const thieu = can.filter((p) => !(mcpAgent.permissions ?? []).includes(p));
    if (thieu.length === 0) ok('Hiến chương `mcp` phủ đủ quyền mà tool MCP thật sự đòi');
    else bad('Hiến chương `mcp` phủ đủ quyền tool đòi', `thiếu: ${thieu.join(', ')} ⇒ tool sẽ chết`);
  } else bad('Danh bạ có agent `mcp`', 'không thấy');

  // ĐỐI CHỨNG TRƯỚC: tool đọc vẫn chạy cho người có quyền — chứng minh KHÔNG chặn oan.
  const okTool = await call('/mcp/tools/ipms.get_org/invoke', designer, {
    method: 'POST', body: JSON.stringify({ args: {} }),
  });
  if (okTool.status === 200 || okTool.status === 201) ok('ĐỐI CHỨNG — tool MCP hợp lệ vẫn chạy sau khi bật cổng quyền hữu hiệu');
  else bad('Tool MCP hợp lệ vẫn chạy', `status=${okTool.status} ${JSON.stringify(okTool.body).slice(0, 120)}`);

  // Người gọi KHÔNG có quyền ⇒ chặn, và thông điệp phải nói rõ thiếu gì.
  const empTool = await call('/mcp/tools/ipms.get_org/invoke', emp, {
    method: 'POST', body: JSON.stringify({ args: {} }),
  });
  if (empTool.status === 403) ok('Nhân viên thường gọi tool MCP ⇒ 403 (quyền hữu hiệu ⊆ quyền người gọi)');
  else bad('Nhân viên thường bị chặn ở tool MCP', `status=${empTool.status}`);

  // N8 — hitlMode có răng: mọi agent đang chạy phải là propose_only hoặc read_only,
  // và KHÔNG giá trị nào cho phép ghi thẳng nghiệp vụ.
  const hitlLa = new Set((list.body?.entries ?? []).map((e) => e.hitlMode));
  const ngoaiHai = [...hitlLa].filter((m) => m !== 'read_only' && m !== 'propose_only');
  if (ngoaiHai.length === 0) ok('N8 — mọi agent chỉ ở `read_only` hoặc `propose_only`, không có chế độ ghi thẳng');
  else bad('N8 — không có chế độ ghi thẳng', `lạ: ${ngoaiHai.join(', ')}`);

  // Đề xuất từ MCP vẫn vào hàng chờ PENDING (không tự áp) — đối chứng cho N8 chiều dương.
  const prop = await call('/mcp/tools/ipms.propose_org_change/invoke', designer, {
    method: 'POST',
    body: JSON.stringify({ args: { proposal: { nameVi: 'driver L2' }, reason: 'driver kiểm N8' } }),
  });
  if ((prop.status === 200 || prop.status === 201) && prop.body?.result?.status === 'pending') {
    ok('ĐỐI CHỨNG N8 — agent `propose_only` vẫn đẻ được đề xuất PENDING, không tự áp');
    notes.push(`đề xuất driver tạo: ${prop.body.result.id} (pending, không tự áp — dọn tay nếu cần)`);
  } else bad('Agent propose_only đẻ được đề xuất pending', `status=${prop.status} ${JSON.stringify(prop.body).slice(0, 120)}`);

  // ═══════════════════ tổng kết ═══════════════════
  console.log(`\n\x1b[${fail === 0 ? 32 : 31}m${pass}/${pass + fail}\x1b[0m check`);
  if (notes.length > 0) {
    console.log('\n\x1b[33mGHI NHẬN:\x1b[0m');
    for (const n of notes) console.log(`  · ${n}`);
  }
  console.log(fail === 0 ? '\n\x1b[32mTẤT CẢ XANH\x1b[0m' : `\n\x1b[31m${fail} CHECK ĐỎ\x1b[0m`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
