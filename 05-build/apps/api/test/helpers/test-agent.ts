import { PrismaClient, uuidv7 } from '@ipms/db';

/**
 * [Trục D L1] Đăng ký một AGENT DÙNG MỘT LẦN cho test.
 *
 * ═══ Vì sao helper này tồn tại
 *
 * Tới hết L0, năm spec bịa mã agent để cô lập lượt chạy của mình (`egress-test-<ts>`,
 * `anthropic-live-<ts>`, `inline.test.qualify.<ts>`…). Đo trên DB dev: **391/397 mã agent
 * trong `ai_interaction` là rác do test đẻ** — mỗi lượt chạy mint một danh tính mới nằm lại
 * vĩnh viễn trong bảng append-only, và năm bảng governance khoá theo chính chuỗi đó.
 *
 * L1 bật N1 (agent lạ ⇒ 422). Có HAI cách xử lý chỗ này, và cách chọn nói lên nhiều điều:
 *
 *   ✗ Nới N1 cho môi trường test. Bất biến có ngoại lệ thì không còn là bất biến, và ngoại
 *     lệ nằm đúng ở nơi ta chứng minh bất biến — tự huỷ.
 *   ✓ Test PHẢI ĐĂNG KÝ agent của nó, y như một agent thật. Cô lập vẫn còn (mã duy nhất
 *     theo lượt chạy), nhưng nay nó đi qua ĐÚNG cánh cửa mà sản phẩm phải đi qua.
 *
 * Chọn cách thứ hai. Hệ quả phụ đáng giá: mỗi spec dùng helper này trở thành một ca kiểm
 * thêm cho chính vòng đời danh bạ — nếu đăng ký agent hỏng, năm spec đỏ cùng lúc.
 *
 * ═══ Quy ước mã: LUÔN bắt đầu bằng `test.`
 *
 * Một dấu hiệu duy nhất, có nguyên tắc — thay cho bảy mẫu tên rời rạc trước đây. Ca "cổng ra"
 * ở `ai-agent-directory.spec` dựa vào đúng tiền tố này để phân biệt *rác của test* với *đường
 * chạy sản phẩm chưa đăng ký* — mà đường thứ hai là thứ phải làm cả trục đỏ.
 *
 * ═══ Dọn dẹp
 *
 * `cleanupTestAgents()` xoá theo tiền tố ⇒ dọn được cả rác của những lượt chạy TRƯỚC bị cắt
 * giữa chừng, không chỉ của lượt này. Dòng `ai_interaction` do agent test sinh ra KHÔNG xoá
 * được (append-only, đúng thiết kế) — chúng ở lại và mang tiền tố `test.` để tra ra được.
 */
export interface TestAgentSpec {
  /** Không kèm tiền tố — helper tự thêm `test.`. Ví dụ: 'egress' → 'test.egress.<uniq>'. */
  name: string;
  uniq: string | number;
  maxDataClass?: 'public' | 'internal' | 'confidential' | 'restricted';
  assets?: string[];
  permissions?: string[];
  hitl?: 'read_only' | 'propose_only';
  status?: 'active' | 'planned' | 'retired';
}

export const TEST_AGENT_PREFIX = 'test.';

export function testAgentCode(name: string, uniq: string | number): string {
  // CHECK `ai_agent_code_check` chỉ nhận [a-z0-9_.] — chuẩn hoá để một `uniq` lạ không làm
  // test đỏ vì lý do chẳng liên quan gì tới thứ nó định kiểm.
  const safe = String(uniq).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${TEST_AGENT_PREFIX}${name.toLowerCase().replace(/[^a-z0-9.]/g, '')}.${safe}`;
}

/**
 * Đăng ký agent test ở tầng CHUẨN TẬP ĐOÀN (`tenantId: null`) bằng kết nối owner.
 *
 * Vì sao global chứ không tenant-scope: đơn vị KHÔNG đúc được agent mã mới (bất biến L0 —
 * agent phải ứng với một đường chạy trong mã nguồn). Test đóng vai "tập đoàn thêm một agent",
 * đúng con đường thật, thay vì mở một cửa sau chỉ test mới đi được.
 */
export async function registerTestAgent(owner: PrismaClient, spec: TestAgentSpec): Promise<string> {
  const code = testAgentCode(spec.name, spec.uniq);
  await owner.aiAgent.deleteMany({ where: { code } });   // dựng trạng thái đầu vào, không chỉ dọn cuối
  await owner.aiAgent.create({
    data: {
      id: uuidv7(), tenantId: null, code,
      nameVi: `[TEST] ${spec.name}`, purpose: `Agent dùng một lần cho spec ${spec.name}`,
      ownerRole: 'B3', kind: 'infrastructure',
      maxDataClass: spec.maxDataClass ?? 'internal',
      dataAssetCodes: spec.assets ?? ['objective.kpi', 'task.dictionary'],
      permissions: spec.permissions ?? [],
      hitlMode: spec.hitl ?? 'read_only',
      status: spec.status ?? 'active',
      note: 'Sinh bởi test — xoá ở afterAll qua cleanupTestAgents()',
    },
  });
  return code;
}

/** Xoá mọi agent test (kể cả rác của lượt chạy trước bị cắt giữa chừng). */
export async function cleanupTestAgents(owner: PrismaClient, codes?: string[]): Promise<void> {
  await owner.aiAgent.deleteMany(
    codes && codes.length > 0
      ? { where: { code: { in: codes } } }
      : { where: { code: { startsWith: TEST_AGENT_PREFIX } } },
  ).catch(() => { /* dọn dẹp không được làm hỏng kết quả test */ });
}
