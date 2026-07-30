/**
 * Unit [Trục C L0] Thang phân loại dữ liệu — vựng chuẩn 4 mức + hoà giải bí danh `pii`.
 *
 * Vì sao đóng đinh: trước L0 lớp AI dùng `pii` làm mức thứ tư, Strategic Context §7 dùng
 * `restricted`. Hai vựng song song nghĩa là một chỗ siết `pii`, chỗ kia siết `restricted`,
 * và dữ liệu lọt qua khe giữa hai cách gọi. Các ca dưới đây khoá lại việc đó.
 */
import {
  DATA_CLASSIFICATIONS, dataClassRank, isSensitiveClass, normalizeDataClass,
} from '@ipms/shared';
import { resolveEgress } from '../../src/modules/ai/egress/egress-policy';

describe('[Trục C L0] Thang phân loại dữ liệu', () => {
  it('đúng 4 mức, không hơn — thêm mức mới phải sửa cả migration data_class_rank()', () => {
    expect([...DATA_CLASSIFICATIONS]).toEqual(['public', 'internal', 'confidential', 'restricted']);
  });

  it('thứ tự nghiêm ngặt public < internal < confidential < restricted', () => {
    expect(dataClassRank('public')).toBeLessThan(dataClassRank('internal'));
    expect(dataClassRank('internal')).toBeLessThan(dataClassRank('confidential'));
    expect(dataClassRank('confidential')).toBeLessThan(dataClassRank('restricted'));
  });

  it('`pii` (vựng cũ lớp AI) chuẩn hoá về `restricted`, KHÔNG rơi xuống mức thấp hơn', () => {
    expect(normalizeDataClass('pii')).toBe('restricted');
    expect(normalizeDataClass('PII')).toBe('restricted');
  });

  it('giá trị lạ trả null — nơi gọi phải fail-closed, không mặc định về internal', () => {
    for (const bad of ['', 'secret', 'top-secret', 'nội bộ', 'null', 'undefined']) {
      expect(normalizeDataClass(bad)).toBeNull();
    }
  });

  it('nhạy cảm = confidential trở lên (Strategic Context §9.3)', () => {
    expect(isSensitiveClass('public')).toBe(false);
    expect(isSensitiveClass('internal')).toBe(false);
    expect(isSensitiveClass('confidential')).toBe(true);
    expect(isSensitiveClass('restricted')).toBe(true);
  });

  it('không rỗng (chống "assert chạy 0 lần" — bài học trục A)', () => {
    expect(DATA_CLASSIFICATIONS.length).toBeGreaterThan(0);
  });
});

describe('[Trục C L0] Egress vẫn fail-closed sau khi đổi vựng', () => {
  it('restricted KHÔNG rời máy tới anthropic', () => {
    expect(resolveEgress('restricted', 'anthropic').allowed).toBe(false);
  });

  it('pii (bí danh cũ, còn trong ai_egress_policy) vẫn bị chặn y như restricted', () => {
    expect(resolveEgress('pii' as never, 'anthropic').allowed).toBe(false);
  });

  it('confidential không rời máy', () => {
    expect(resolveEgress('confidential', 'anthropic').allowed).toBe(false);
  });

  it('giá trị phân loại LẠ ⇒ coi như nhạy cảm, chặn (fail-closed, không cho qua)', () => {
    expect(resolveEgress('khong-biet' as never, 'anthropic').allowed).toBe(false);
  });

  it('mock luôn cho phép — không rời máy, 0 chi phí', () => {
    expect(resolveEgress('restricted', 'mock').allowed).toBe(true);
  });

  it('internal đi anthropic được khi không có policy tenant thu hẹp (đối chứng: không chặn oan)', () => {
    expect(resolveEgress('internal', 'anthropic').allowed).toBe(true);
  });
});
