/**
 * [Learning Loop L2] Replay golden case cho agent inline.* — PURE.
 * Output LLM phải đi qua ĐÚNG parser fail-closed của tác vụ (inline-assist.tasks)
 * trước khi chấm assertion: shape lệch/kpiRef ngoài từ điển = case FAIL có note,
 * KHÔNG chấm trên raw output (raw có thể trùng path assertion mà vẫn không phải
 * proposal hợp lệ — thước đo phải đo đúng cái người dùng sẽ nhận).
 */
import {
  InlineParseError, parseCurationDedup, parseDerivationRule, parseKpiLink, parseTaskcellDraft,
} from '../inline/inline-assist.tasks';

export const INLINE_EVAL_AGENTS = new Set([
  'inline.taskcell.draft', 'inline.taskcell.kpi_link', 'inline.derivation.rule', 'inline.curation.dedup',
]);

/** validCodes cho kpi_link lấy từ CHÍNH context replay (candidates) — case tự chứa. */
export function parseInlineOutput(agent: string, json: unknown, context: unknown): Record<string, unknown> {
  switch (agent) {
    case 'inline.taskcell.draft': {
      const p = parseTaskcellDraft(json);
      return { fill: p.fill, reason: p.reason };
    }
    case 'inline.taskcell.kpi_link': {
      const candidates = (context as { candidates?: unknown })?.candidates;
      const validCodes = new Set<string>(
        Array.isArray(candidates)
          ? candidates.map((c) => (c as { code?: unknown })?.code).filter((x): x is string => typeof x === 'string')
          : [],
      );
      const p = parseKpiLink(json, validCodes);
      return { kpiRef: p.kpiRef, reason: p.reason };
    }
    case 'inline.derivation.rule': {
      const p = parseDerivationRule(json);
      return { rule: p.rule, reason: p.reason };
    }
    case 'inline.curation.dedup': {
      const p = parseCurationDedup(json);
      return { recommendation: p.recommendation, differences: p.differences, reason: p.reason };
    }
    default:
      throw new InlineParseError(`agent inline không hỗ trợ replay: ${agent}`);
  }
}
