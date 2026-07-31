/**
 * Unit [Trục B L4 — J11] IMPERSONATION_READ_WHITELIST — whitelist TƯỜNG MINH quyền giữ
 * lại khi đang đóng vai. Đóng đinh ở đây, không phải chỗ dùng nó (permission.guard.ts):
 * nếu whitelist sai thì MỌI request dưới một phiên đóng vai sai theo, không có cách nào
 * bắt bằng test tích hợp lẻ tẻ tốt hơn kiểm chính danh sách nguồn.
 */
import {
  PERMISSIONS, IMPERSONATION_READ_WHITELIST, SUPPORT_ROLE_PERMISSIONS,
  effectiveImpersonationPermissions, impersonationEscalation,
} from '@ipms/shared';

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
  // [Trục C L1] `exportlog:read` vào danh sách loại trừ cùng lý do với `audit:read`: sổ vết
  // xuất dữ liệu là hồ sơ GIÁM SÁT, không phải dữ liệu nghiệp vụ. Nó do `auditor` giữ chính
  // vì người vận hành đường xuất không được tự soát vết xuất của mình — nếu whitelist giữ nó
  // thì tenant_admin chỉ cần đóng vai auditor@ là đọc được, đúng đường vòng mà F187 đã bịt
  // cho audit:read. Quy tắc rút ra: quyền ĐỌC HỒ SƠ GIÁM SÁT không bao giờ vào whitelist.
  const READ_EXCLUDED_FROM_IMPERSONATION = ['audit:read', 'exportlog:read'] as const;

  it('[F187] "audit:read" KHÔNG nằm trong whitelist — J3 không lách được qua đóng vai', () => {
    expect(IMPERSONATION_READ_WHITELIST as readonly string[]).not.toContain('audit:read');
  });

  it('[Trục C L1] "exportlog:read" KHÔNG nằm trong whitelist — không đọc sổ vết xuất qua đóng vai', () => {
    expect(IMPERSONATION_READ_WHITELIST as readonly string[]).not.toContain('exportlog:read');
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

/**
 * Unit [Trục C L2b — J12① siết theo QUYỀN HỮU HIỆU]
 *
 * Đóng đinh Ở ĐÂY chứ không chỉ qua integration: phép so này quyết định "ai đóng vai được
 * ai" cho toàn hệ, mà mỗi ca integration chỉ chạm đúng MỘT cặp persona có thật trong seed.
 * Những ca quan trọng nhất (target giữ một quyền ĐỌC mà actor không có) không tồn tại trong
 * seed hiện tại — bỏ qua tầng unit là bỏ luôn bằng chứng cho nhánh chặn.
 */
describe('[Trục C L2b] impersonationEscalation — J12① theo quyền hữu hiệu', () => {
  it('quyền GHI của target KHÔNG còn làm phiên bị chặn (chúng bị guard cắt, actor không nhận được)', () => {
    // Đúng ca đã làm chết tính năng: tenant_admin (không quyền ghi nghiệp vụ) ↔ employee.
    const actor = ['tenant:read', 'goal:read', 'checkin:read'];
    const target = ['tenant:read', 'goal:read', 'goal:write', 'checkin:read', 'checkin:write'];
    expect(impersonationEscalation(actor, target)).toEqual([]);
  });

  it('quyền ĐỌC target có mà actor không có VẪN chặn — bất biến không leo thang còn nguyên', () => {
    const actor = ['tenant:read'];
    const target = ['tenant:read', 'datacatalog:read', 'config:read'];
    expect(impersonationEscalation(actor, target)).toEqual(['config:read', 'datacatalog:read']);
  });

  it('KHÔNG dựa vào hàm này để chặn auditor — `audit:read` vô hình với nó (J12② là luật riêng)', () => {
    // Nếu ai đó sau này xoá J12② khỏi service vì "① lo rồi", test này chỉ ra ngay là không:
    // audit:read không nằm trong whitelist ⇒ không bao giờ xuất hiện trong phần chênh lệch.
    expect(impersonationEscalation(['tenant:read'], ['tenant:read', 'audit:read'])).toEqual([]);
  });

  it('quyền hữu hiệu = giao với whitelist, không hơn', () => {
    const eff = effectiveImpersonationPermissions(['goal:read', 'goal:write', 'audit:read', 'user:impersonate']);
    expect([...eff]).toEqual(['goal:read']);
  });
});

/**
 * Unit [Trục C L2b — K11] Vai `support`.
 */
describe('[Trục C L2b — K11] SUPPORT_ROLE_PERMISSIONS', () => {
  it('đúng bằng whitelist chỉ-đọc + `user:impersonate`, không hơn một quyền nào', () => {
    const extra = [...SUPPORT_ROLE_PERMISSIONS]
      .filter((p) => !(IMPERSONATION_READ_WHITELIST as readonly string[]).includes(p));
    expect(extra).toEqual(['user:impersonate']);
  });

  it('[K11] không giữ quyền GHI nào ngoài chính năng lực đóng vai', () => {
    const writes = [...SUPPORT_ROLE_PERMISSIONS].filter(
      (p) => p !== 'user:impersonate' && !p.includes('.self:')
        && (KNOWN_WRITE_SUFFIX.test(p) || p === 'library:import:canonical'),
    );
    expect(writes).toEqual([]);
  });

  it('[J3] không giữ `audit:read` lẫn `exportlog:read`', () => {
    expect(SUPPORT_ROLE_PERMISSIONS as readonly string[]).not.toContain('audit:read');
    expect(SUPPORT_ROLE_PERMISSIONS as readonly string[]).not.toContain('exportlog:read');
  });

  /**
   * Đây là lý do tồn tại của vai: `support` đóng vai được MỌI persona mà không cần ngoại lệ
   * nào trong J12①, vì tập quyền của nó PHỦ trọn whitelist. Đóng đinh tính chất đó thay vì
   * đóng đinh một danh sách persona — persona mới thêm sau này tự động nằm trong phạm vi kiểm.
   */
  it('phủ trọn whitelist ⇒ không persona nào (dù giữ quyền gì) làm J12① chặn `support`', () => {
    const anyTarget = [...PERMISSIONS];   // ca xấu nhất: target giữ TOÀN BỘ catalog
    expect(impersonationEscalation(SUPPORT_ROLE_PERMISSIONS, anyTarget)).toEqual([]);
  });

  it('`user:impersonate` KHÔNG trong whitelist ⇒ support đang đóng vai không mở được phiên lồng', () => {
    expect(IMPERSONATION_READ_WHITELIST as readonly string[]).not.toContain('user:impersonate');
  });
});
