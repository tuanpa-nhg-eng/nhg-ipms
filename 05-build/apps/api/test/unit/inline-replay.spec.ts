/**
 * Unit — [Learning Loop L2] parseInlineOutput: replay golden case qua ĐÚNG parser
 * fail-closed của tác vụ inline (không chấm raw output).
 */
import { parseInlineOutput, INLINE_EVAL_AGENTS } from '../../src/modules/ai/eval/inline-replay';
import { InlineParseError } from '../../src/modules/ai/inline/inline-assist.tasks';

describe('Learning Loop L2 — parseInlineOutput', () => {
  it('kpi_link: hợp lệ → {kpiRef, reason}; validCodes lấy từ context.candidates', () => {
    const out = parseInlineOutput(
      'inline.taskcell.kpi_link',
      { suggestion_type: 'kpi_link', kpiRef: 'FIN-EXT-004', reason: 'đo đúng đầu ra kiểm quỹ' },
      { candidates: [{ code: 'FIN-EXT-004', nameVi: 'x' }, { code: 'FIN-EXT-001' }] },
    );
    expect(out).toEqual({ kpiRef: 'FIN-EXT-004', reason: 'đo đúng đầu ra kiểm quỹ' });
  });

  it('kpi_link: kpiRef NGOÀI candidates → InlineParseError (fail-closed, không lọt vào chấm điểm)', () => {
    expect(() => parseInlineOutput(
      'inline.taskcell.kpi_link',
      { kpiRef: 'HACK-001', reason: 'x' },
      { candidates: [{ code: 'FIN-EXT-004' }] },
    )).toThrow(InlineParseError);
    // context không có candidates → validCodes rỗng → mọi kpiRef đều fail
    expect(() => parseInlineOutput('inline.taskcell.kpi_link', { kpiRef: 'FIN-EXT-004', reason: 'x' }, {}))
      .toThrow(InlineParseError);
  });

  it('draft: field ngoài whitelist A–G → InlineParseError; hợp lệ → {fill, reason}', () => {
    expect(parseInlineOutput(
      'inline.taskcell.draft',
      { fill: { aiLevel: 'assist' }, reason: 'điền mức AI' }, {},
    )).toEqual({ fill: { aiLevel: 'assist' }, reason: 'điền mức AI' });
    expect(() => parseInlineOutput('inline.taskcell.draft', { fill: { hackField: 1 }, reason: 'x' }, {}))
      .toThrow(InlineParseError);
  });

  it('derivation.rule + curation.dedup: shape lệch → InlineParseError', () => {
    expect(parseInlineOutput(
      'inline.derivation.rule',
      { rule: { match: { a: 1 }, emit: { b: 2 } }, reason: 'khớp mô tả' }, {},
    )).toEqual({ rule: { match: { a: 1 }, emit: { b: 2 } }, reason: 'khớp mô tả' });
    expect(() => parseInlineOutput('inline.derivation.rule', { rule: { match: {} }, reason: 'x' }, {}))
      .toThrow(InlineParseError);

    expect(parseInlineOutput(
      'inline.curation.dedup',
      { recommendation: 'merge', differences: ['nameVi'], reason: 'trùng bản chất' }, {},
    )).toEqual({ recommendation: 'merge', differences: ['nameVi'], reason: 'trùng bản chất' });
    expect(() => parseInlineOutput('inline.curation.dedup', { recommendation: 'delete-all', differences: [], reason: 'x' }, {}))
      .toThrow(InlineParseError);
  });

  it('agent lạ → InlineParseError; INLINE_EVAL_AGENTS khớp đúng 4 tác vụ', () => {
    expect(() => parseInlineOutput('inline.unknown', {}, {})).toThrow(InlineParseError);
    expect([...INLINE_EVAL_AGENTS].sort()).toEqual([
      'inline.curation.dedup', 'inline.derivation.rule', 'inline.taskcell.draft', 'inline.taskcell.kpi_link',
    ]);
  });
});
