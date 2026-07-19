/**
 * Unit — [Learning Loop L0] logic pure của tín hiệu học:
 * diffEditedFields (proposed↔final, dotted 1 tầng, tất định) + resolveOutcome.
 */
import { diffEditedFields, resolveOutcome } from '../../src/modules/ai/learning/learning-signal';

describe('Learning Loop L0 — diffEditedFields', () => {
  it('y hệt → [] (kể cả undefined vs null tương đương)', () => {
    expect(diffEditedFields({ kpiRef: 'FIN-EXT-004' }, { kpiRef: 'FIN-EXT-004' })).toEqual([]);
    expect(diffEditedFields({ a: null }, {})).toEqual([]); // null ≡ absent (bài học F138)
  });

  it('đổi giá trị top-level → tên field', () => {
    expect(diffEditedFields({ kpiRef: 'FIN-EXT-004' }, { kpiRef: 'FIN-EXT-005' })).toEqual(['kpiRef']);
  });

  it('proposal dạng { fill: {...} } → dotted 1 tầng, chỉ subkey ĐỔI', () => {
    const proposed = { fill: { aiLevel: 'assist', responsibleRole: 'CV', inputs: [{ name: 'a' }] } };
    const final = { fill: { aiLevel: 'automate', responsibleRole: 'CV', inputs: [{ name: 'a' }] } };
    expect(diffEditedFields(proposed, final)).toEqual(['fill.aiLevel']);
  });

  it('final thêm field mới / bỏ field → đều được ghi nhận', () => {
    expect(diffEditedFields({ fill: { a: 1 } }, { fill: { a: 1, b: 2 } })).toEqual(['fill.b']);
    expect(diffEditedFields({ fill: { a: 1, b: 2 } }, { fill: { a: 1 } })).toEqual(['fill.b']);
  });

  it('object vs không-object tại cùng key → key top-level (không đệ quy lệch kiểu)', () => {
    expect(diffEditedFields({ rule: { match: {} } }, { rule: 'x' } as any)).toEqual(['rule']);
  });

  it('kết quả SORT — tất định', () => {
    const proposed = { fill: { z: 1, a: 1 }, kpiRef: 'X' };
    const final = { fill: { z: 2, a: 2 }, kpiRef: 'Y' };
    expect(diffEditedFields(proposed, final)).toEqual(['fill.a', 'fill.z', 'kpiRef']);
  });

  it('input không phải object → [] (conservative, không ném)', () => {
    expect(diffEditedFields(null, { a: 1 })).toEqual([]);
    expect(diffEditedFields({ a: 1 }, undefined)).toEqual([]);
  });
});

describe('Learning Loop L0 — resolveOutcome', () => {
  it('rejected/expired giữ nguyên (mọi cờ khác bị bỏ qua)', () => {
    expect(resolveOutcome('rejected', true, ['a'])).toBe('rejected');
    expect(resolveOutcome('expired', undefined, null)).toBe('expired');
  });

  it('accepted + có editedFields → accepted_with_edits', () => {
    expect(resolveOutcome('accepted', undefined, ['fill.aiLevel'])).toBe('accepted_with_edits');
  });

  it('accepted + cờ edited (không diff được) → accepted_with_edits', () => {
    expect(resolveOutcome('accepted', true, null)).toBe('accepted_with_edits');
    expect(resolveOutcome('accepted', true, [])).toBe('accepted_with_edits');
  });

  it('accepted sạch → accepted', () => {
    expect(resolveOutcome('accepted', false, null)).toBe('accepted');
    expect(resolveOutcome('accepted', undefined, [])).toBe('accepted');
  });
});
