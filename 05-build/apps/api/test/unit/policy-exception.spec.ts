/**
 * Unit [Trục C L3 — K4] Trần thời hạn + allowlist quyền được nới.
 *
 * Đóng đinh ở tầng này vì cả hai đều là QUYẾT ĐỊNH CHÍNH SÁCH viết bằng dữ liệu, không phải
 * hành vi HTTP: một ca integration chỉ chạm được một giá trị cấu hình và một quyền, còn chỗ
 * hỏng thật của loại luật này luôn là biên (trần âm, trần khổng lồ, quyền "trông có vẻ đọc").
 */
import {
  PERMISSIONS, EXCEPTION_MAX_TTL_HOURS, EXCEPTION_GRANTABLE_PERMISSIONS,
  resolveExceptionTtlCap,
} from '@ipms/shared';

describe('[Trục C L3 — K4] Trần thời hạn ngoại lệ', () => {
  it('không cấu hình → dùng trần cứng 72 giờ', () => {
    expect(resolveExceptionTtlCap(undefined)).toBe(EXCEPTION_MAX_TTL_HOURS);
    expect(EXCEPTION_MAX_TTL_HOURS).toBe(72);
  });

  it('đơn vị HẠ được trần xuống thấp hơn', () => {
    expect(resolveExceptionTtlCap(8)).toBe(8);
    expect(resolveExceptionTtlCap(1)).toBe(1);
  });

  /**
   * Ca quan trọng nhất của cả hàm: "cấu hình được xuống thấp hơn, KHÔNG lên cao hơn" (§4 L3).
   * Nếu ai đó viết lại thành `configured ?? MAX` thì test này đỏ — và đó đúng là cách viết
   * tự nhiên nhất khi đọc yêu cầu vội.
   */
  it('đơn vị KHÔNG nâng được trần lên cao hơn 72 — kể cả khi settings đã có sẵn giá trị lớn', () => {
    expect(resolveExceptionTtlCap(720)).toBe(72);
    expect(resolveExceptionTtlCap(73)).toBe(72);
    expect(resolveExceptionTtlCap(Number.MAX_SAFE_INTEGER)).toBe(72);
  });

  it('giá trị rác/âm/không phải số → rơi về trần an toàn, không rơi về 0 hay NaN', () => {
    for (const bad of [0, -5, NaN, Infinity, '48', null, {}, true]) {
      const v = resolveExceptionTtlCap(bad as unknown);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(72);
    }
    // '48' là chuỗi: KHÔNG được âm thầm coi như 48 (settings là jsonb, kiểu không đảm bảo)
    expect(resolveExceptionTtlCap('48' as unknown)).toBe(72);
  });
});

describe('[Trục C L3 — K4] Allowlist quyền được nới bằng ngoại lệ', () => {
  it('mọi entry đều có trong catalog (không permission ma)', () => {
    for (const p of EXCEPTION_GRANTABLE_PERMISSIONS) {
      expect(PERMISSIONS as readonly string[]).toContain(p);
    }
    expect(EXCEPTION_GRANTABLE_PERMISSIONS.length).toBeGreaterThan(5);
  });

  /**
   * Bất biến trung tâm: ngoại lệ mở quyền ĐỌC, không mở quyền GHI. Dùng regex ghi RỘNG (kể cả
   * các quyền ghi không theo quy ước ':write' — bài học whitelist đóng vai ở trục B) thay vì
   * kiểm `endsWith(':read')`: một quyền tương lai tên `person:lookup` sẽ lọt qua phép kiểm
   * hậu tố mà vẫn phải bị soi.
   */
  it('[K4] không entry nào là quyền GHI', () => {
    const WRITE = /:(write|approve|publish|verify|export|assign|revoke|invite|deactivate|curate|import|reopen|run|bind|connect|delegate|propose|submit|design|update|archive|impersonate|invoke|assist|eval|feedback)$/;
    const bad = EXCEPTION_GRANTABLE_PERMISSIONS.filter(
      (p) => WRITE.test(p) || p === 'library:import:canonical',
    );
    expect(bad).toEqual([]);
  });

  /**
   * [K3] Ngoại lệ KHÔNG mở đường xuất. Đây không phải "cho chắc": hết hạn một ngoại lệ thu
   * hồi được quyền ĐỌC, nhưng không thu hồi được một tệp đã rời hệ. Bất đối xứng về khả năng
   * hoàn tác là toàn bộ lý do của luật này.
   */
  it('[K3] `export:confidential` KHÔNG nới được bằng ngoại lệ', () => {
    expect(EXCEPTION_GRANTABLE_PERMISSIONS as readonly string[]).not.toContain('export:confidential');
    expect(EXCEPTION_GRANTABLE_PERMISSIONS as readonly string[]).not.toContain('payroll:export');
  });

  it('[J3] `audit:read` KHÔNG nới được — vết kiểm toán không mở bằng đơn xin', () => {
    expect(EXCEPTION_GRANTABLE_PERMISSIONS as readonly string[]).not.toContain('audit:read');
  });

  /**
   * Ca dùng đã nêu đích danh trong kế hoạch L2: B3 thấy SỐ ĐẾM, muốn xem chi tiết một sự cố
   * thì đi qua ngoại lệ có hạn. Nếu quyền này rơi khỏi allowlist thì cái "đi qua L3" đó thành
   * lời hứa suông — nên đóng đinh nó, không chỉ đóng đinh các mục cấm.
   */
  it('`exportlog:read` CÓ trong allowlist — đúng lối ra mà L2 đã hẹn', () => {
    expect(EXCEPTION_GRANTABLE_PERMISSIONS as readonly string[]).toContain('exportlog:read');
  });

  it('không trùng lặp', () => {
    expect(new Set(EXCEPTION_GRANTABLE_PERMISSIONS).size).toBe(EXCEPTION_GRANTABLE_PERMISSIONS.length);
  });
});
