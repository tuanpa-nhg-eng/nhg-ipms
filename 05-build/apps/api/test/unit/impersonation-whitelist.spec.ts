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
   * [Bất biến cốt lõi] Hiện tại, TOÀN BỘ quyền an toàn-để-đọc trong catalog đều có hậu tố
   * ":read" — và TOÀN BỘ quyền có hậu tố ":read" đều an toàn. Whitelist vì vậy PHẢI khớp
   * chính xác tập này — không thừa (một quyền ":read" nào đó bị bỏ sót là completeness bug,
   * ít nghiêm trọng nhưng làm impersonation vô dụng) và không thiếu (một quyền không phải
   * ":read" lọt vào là lỗ bảo mật thật). Permission MỚI thêm vào catalog mà không theo quy
   * ước ":read" (như `task:feedback`) mặc định KHÔNG lọt vào — đúng tinh thần "không liệt
   * kê tường minh thì không có trong whitelist".
   */
  it('khớp CHÍNH XÁC tập quyền hậu tố ":read" của catalog — không thừa, không thiếu', () => {
    const allReadPerms = (PERMISSIONS as readonly string[]).filter((p) => p.endsWith(':read')).sort();
    expect([...IMPERSONATION_READ_WHITELIST].sort()).toEqual(allReadPerms);
  });

  it('không rỗng (bằng chứng chống "assert chạy 0 lần" — bài học trục A)', () => {
    expect(IMPERSONATION_READ_WHITELIST.length).toBeGreaterThan(15);
  });
});
