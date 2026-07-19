/**
 * [Learning Loop L0] Logic PURE của tín hiệu học — tách khỏi DB để unit-test:
 * - diffEditedFields: proposed ↔ final khác nhau ở đâu (dotted 1 tầng, tất định).
 * - resolveOutcome: quyết định người dùng → outcome chuẩn của corpus học.
 *
 * Bất biến: hàm pure, không ném — input lạ trả kết quả conservative (editedFields
 * rỗng ⇒ outcome dựa vào cờ edited người dùng bấm; không đoán mò).
 */

export const LEARNING_OUTCOMES = [
  'accepted', 'accepted_with_edits', 'rejected', 'expired',
] as const;
export type LearningOutcome = (typeof LEARNING_OUTCOMES)[number];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * So proposed ↔ final theo key (union 2 phía). Cả 2 giá trị cùng là plain object
 * → đi sâu THÊM 1 tầng với tên dotted ('fill.aiLevel') để tín hiệu "AI sai field nào"
 * đủ mịn cho proposal dạng { fill: {...} } mà vẫn chặn đệ quy sâu vô hạn.
 * Kết quả sort — tất định cho eval/test.
 */
export function diffEditedFields(
  proposed: Record<string, unknown> | null | undefined,
  final: Record<string, unknown> | null | undefined,
): string[] {
  if (!isPlainObject(proposed) || !isPlainObject(final)) return [];
  const out: string[] = [];
  const keys = new Set([...Object.keys(proposed), ...Object.keys(final)]);
  for (const k of keys) {
    const a = proposed[k];
    const b = final[k];
    if (same(a, b)) continue;
    if (isPlainObject(a) && isPlainObject(b)) {
      const subKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const sk of subKeys) {
        if (!same(a[sk], b[sk])) out.push(`${k}.${sk}`);
      }
    } else {
      out.push(k);
    }
  }
  return out.sort();
}

/**
 * Map quyết định → outcome:
 * - rejected/expired giữ nguyên.
 * - accepted: có editedFields (final khác proposed) HOẶC người dùng bấm
 *   "Sửa rồi chấp nhận" (cờ edited) → accepted_with_edits; còn lại accepted.
 */
export function resolveOutcome(
  decision: 'accepted' | 'rejected' | 'expired',
  edited: boolean | undefined,
  editedFields: string[] | null,
): LearningOutcome {
  if (decision !== 'accepted') return decision;
  if ((editedFields?.length ?? 0) > 0 || edited === true) return 'accepted_with_edits';
  return 'accepted';
}
