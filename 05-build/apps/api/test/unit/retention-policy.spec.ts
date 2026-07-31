/**
 * Unit [Trục C L5] Mặc định thời hạn lưu trữ + danh sách bất khả xâm phạm.
 *
 * Hai thứ này quyết định "dữ liệu nào bị xoá lúc nào" cho toàn hệ. Ca integration chỉ chạm
 * được vài mã dữ liệu có executor; những mã còn lại — và mọi mã THÊM SAU NÀY — chỉ có chỗ này
 * canh.
 */
import {
  RETENTION_ACTIONS, RETENTION_UNTOUCHABLE_ASSETS, RETENTION_DRY_RUN_TTL_HOURS,
  defaultRetentionMonths,
} from '@ipms/shared';

describe('[Trục C L5] Mặc định thời hạn theo mức phân loại', () => {
  /**
   * Chiều của thang này ngược trực giác thông thường ("dữ liệu quan trọng thì giữ lâu") và
   * đó là chủ đích: NĐ13 coi việc giữ lâu hơn mức cần thiết là tăng phơi nhiễm. Đóng đinh
   * chiều dốc, không chỉ đóng đinh từng con số — người sửa sau sẽ thấy ngay nếu đảo chiều.
   */
  it('càng nhạy cảm giữ càng NGẮN', () => {
    expect(defaultRetentionMonths('restricted')).toBeLessThan(defaultRetentionMonths('confidential'));
    expect(defaultRetentionMonths('internal')).toBeLessThan(defaultRetentionMonths('public'));
    expect(defaultRetentionMonths('restricted')).toBe(36);
    expect(defaultRetentionMonths('confidential')).toBe(60);
  });

  it('mọi mức đều có giá trị hợp lệ (không rơi về 0 hay vô hạn)', () => {
    for (const c of ['public', 'internal', 'confidential', 'restricted'] as const) {
      const m = defaultRetentionMonths(c);
      expect(m).toBeGreaterThanOrEqual(12);
      expect(m).toBeLessThanOrEqual(600);
    }
  });
});

describe('[Trục C L5 — K6] Sổ giám sát bất khả xâm phạm', () => {
  it('đúng hai sổ: nhật ký kiểm toán và nhật ký xuất dữ liệu', () => {
    expect([...RETENTION_UNTOUCHABLE_ASSETS].sort()).toEqual(['audit.log', 'export.log']);
  });

  /**
   * Danh sách này là MỘT trong ba tầng của K6 (hai tầng kia: CHECK constraint ở DB, và không
   * tồn tại executor cho hai bảng đó). Test ở đây chốt tầng thứ nhất — nếu ai đó xoá một mục
   * khỏi danh sách để "cho gọn", hai tầng kia vẫn giữ, nhưng thông báo lỗi sẽ mất phần giải
   * thích và người dùng chỉ thấy một lỗi DB khó hiểu.
   */
  it('không rỗng — đây là bằng chứng chống "assert chạy 0 lần"', () => {
    expect(RETENTION_UNTOUCHABLE_ASSETS.length).toBe(2);
  });
});

describe('[Trục C L5] Hành động và hiệu lực lượt chạy thử', () => {
  it('bốn hành động, và `keep` có mặt để diễn tả "giữ vô thời hạn" một cách tường minh', () => {
    expect([...RETENTION_ACTIONS].sort()).toEqual(['anonymize', 'cold_archive', 'hard_delete', 'keep']);
  });

  it('lượt chạy thử hết hiệu lực trong vòng một ngày', () => {
    expect(RETENTION_DRY_RUN_TTL_HOURS).toBeGreaterThanOrEqual(1);
    expect(RETENTION_DRY_RUN_TTL_HOURS).toBeLessThanOrEqual(24);
  });
});
