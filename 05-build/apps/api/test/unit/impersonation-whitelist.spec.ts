/**
 * Unit [Trục B L4 — J11] IMPERSONATION_READ_WHITELIST — whitelist TƯỜNG MINH quyền giữ
 * lại khi đang đóng vai. Đóng đinh ở đây, không phải chỗ dùng nó (permission.guard.ts):
 * nếu whitelist sai thì MỌI request dưới một phiên đóng vai sai theo, không có cách nào
 * bắt bằng test tích hợp lẻ tẻ tốt hơn kiểm chính danh sách nguồn.
 */
import { PERMISSIONS, IMPERSONATION_READ_WHITELIST } from '@ipms/shared';

// Regex ĐỘC LẬP, RỘNG HƠN quy ước hậu tố ":write" thường gặp — cố ý liệt kê thêm các quyền
// GHI không theo quy ước đó (bài học tự bắt khi xây danh sách): `task:feedback` (nộp góp ý),
// `ai:invoke`/`ai:assist`/`ai:eval` (gọi LLM thật — có phí), `integration:connect/bind`.
// Nếu chỉ dùng đúng regex hậu tố cũ (như rbac-matrix.spec dùng cho SoD), các quyền này lọt
// qua như "trông có vẻ an toàn" — đây chính là lý do §3 J11 đòi WHITELIST chứ không phải
// blacklist theo pattern.
const KNOWN_WRITE_SUFFIX =
  /:(write|approve|publish|verify|export|assign|revoke|invite|deactivate|curate|import|reopen|run|bind|connect|delegate|propose|submit|design|update|archive|impersonate|invoke|assist|eval|feedback)$/;

describe('[Trục B L4 — J11] IMPERSONATION_READ_WHITELIST', () => {
  it('mọi entry đều nằm trong catalog @ipms/shared (không permission ma)', () => {
    for (const p of IMPERSONATION_READ_WHITELIST) expect(PERMISSIONS as readonly string[]).toContain(p);
  });

  it('không entry nào khớp hậu tố GHI đã biết (kể cả những cái KHÔNG theo quy ước ":write")', () => {
    const violations = IMPERSONATION_READ_WHITELIST.filter(
      (p) => KNOWN_WRITE_SUFFIX.test(p) || p === 'library:import:canonical',
    );
    expect(violations).toEqual([]);
  });

  it('không trùng lặp', () => {
    expect(new Set(IMPERSONATION_READ_WHITELIST).size).toBe(IMPERSONATION_READ_WHITELIST.length);
  });

  /**
   * [F187 — Reviewer đối kháng, MAJOR — sửa bất biến cũ] Bản đầu đòi khớp CHÍNH XÁC toàn bộ
   * quyền hậu tố ":read" của catalog — ngầm giả định "mọi :read đều an toàn để lộ qua kênh
   * đóng vai". Sai: `audit:read` có hậu tố ":read" nhưng KHÔNG được lọt whitelist — J3 cấm
   * tenant_admin đọc audit (kể cả gián tiếp qua đóng vai auditor@). Whitelist giờ PHẢI là
   * tập con NGHIÊM NGẶT của "mọi :read" — đúng bằng phần còn lại sau khi trừ đi các ngoại lệ
   * tường minh (hiện chỉ có `audit:read`), không khớp tuyệt đối.
   */
  const READ_EXCLUDED_FROM_IMPERSONATION = ['audit:read'] as const;

  it('[F187] "audit:read" KHÔNG nằm trong whitelist — J3 không lách được qua đóng vai', () => {
    expect(IMPERSONATION_READ_WHITELIST as readonly string[]).not.toContain('audit:read');
  });

  it('khớp CHÍNH XÁC tập quyền hậu tố ":read" của catalog TRỪ các ngoại lệ tường minh — không thừa, không thiếu', () => {
    const allReadPerms = (PERMISSIONS as readonly string[]).filter((p) => p.endsWith(':read'));
    const expected = allReadPerms.filter((p) => !(READ_EXCLUDED_FROM_IMPERSONATION as readonly string[]).includes(p)).sort();
    expect([...IMPERSONATION_READ_WHITELIST].sort()).toEqual(expected);
  });

  it('không rỗng (bằng chứng chống "assert chạy 0 lần" — bài học trục A)', () => {
    expect(IMPERSONATION_READ_WHITELIST.length).toBeGreaterThan(15);
  });
});
