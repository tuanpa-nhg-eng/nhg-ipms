/**
 * [Learning Loop L1] Sinh assertion cho golden case — PURE, dùng CHUNG cho case
 * thu hoạch (learned) lẫn seed baseline để cùng MỘT thước đo per agent:
 * - kpi_link : equals kpiRef — bar ngữ nghĩa (model chọn đúng KPI người dùng chốt).
 * - draft    : equals từng field trong expected.fill — bar "đề xuất đúng cái người
 *              dùng thật sự dùng" (khó, trung thực — mock KHÔNG kỳ vọng pass).
 * - derivation: cấu trúc match/emit tồn tại + equals emit.kpi_template_codes nếu có.
 * - dedup    : equals recommendation (merge|keep_both).
 * Trả [] khi agent lạ → eval fail-closed (case không assertion = fail).
 */
import type { EvalAssertion } from '../eval/assertions';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function goldenAssertions(agent: string, expected: Record<string, unknown>): EvalAssertion[] {
  switch (agent) {
    case 'inline.taskcell.kpi_link':
      return [{ type: 'equals', path: 'kpiRef', value: expected.kpiRef }];
    case 'inline.taskcell.draft': {
      const fill = isPlainObject(expected.fill) ? expected.fill : {};
      return Object.keys(fill).sort()
        .map((k) => ({ type: 'equals' as const, path: `fill.${k}`, value: fill[k] }));
    }
    case 'inline.derivation.rule': {
      const out: EvalAssertion[] = [
        { type: 'exists', path: 'rule.match' },
        { type: 'exists', path: 'rule.emit' },
      ];
      const rule = expected.rule;
      const emit = isPlainObject(rule) ? rule.emit : undefined;
      if (isPlainObject(emit) && emit.kpi_template_codes !== undefined) {
        out.push({ type: 'equals', path: 'rule.emit.kpi_template_codes', value: emit.kpi_template_codes });
      }
      return out;
    }
    case 'inline.curation.dedup':
      return [{ type: 'equals', path: 'recommendation', value: expected.recommendation }];
    default:
      return []; // agent lạ → case không assertion → eval fail-closed
  }
}
