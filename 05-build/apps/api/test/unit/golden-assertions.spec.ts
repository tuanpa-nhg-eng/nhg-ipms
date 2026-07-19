/**
 * Unit — [Learning Loop L1] goldenAssertions: MỘT bộ sinh assertion cho cả case
 * thu hoạch lẫn seed baseline — per agent, fail-closed với agent lạ.
 */
import { goldenAssertions } from '../../src/modules/ai/learning/golden.assertions';

describe('Learning Loop L1 — goldenAssertions', () => {
  it('kpi_link → equals kpiRef (bar ngữ nghĩa)', () => {
    expect(goldenAssertions('inline.taskcell.kpi_link', { kpiRef: 'FIN-EXT-004' })).toEqual([
      { type: 'equals', path: 'kpiRef', value: 'FIN-EXT-004' },
    ]);
  });

  it('draft → equals TỪNG field trong expected.fill, sort tất định', () => {
    const out = goldenAssertions('inline.taskcell.draft', {
      fill: { responsibleRole: 'Kế toán viên', aiLevel: 'assist' },
    });
    expect(out).toEqual([
      { type: 'equals', path: 'fill.aiLevel', value: 'assist' },
      { type: 'equals', path: 'fill.responsibleRole', value: 'Kế toán viên' },
    ]);
  });

  it('draft expected.fill rỗng/dị dạng → [] (case không assertion = eval fail-closed)', () => {
    expect(goldenAssertions('inline.taskcell.draft', {})).toEqual([]);
    expect(goldenAssertions('inline.taskcell.draft', { fill: 'x' as any })).toEqual([]);
  });

  it('derivation → exists match/emit + equals kpi_template_codes khi có', () => {
    const out = goldenAssertions('inline.derivation.rule', {
      rule: { match: { function_codes: ['ACC'] }, emit: { kpi_template_codes: ['FIN-EXT-001'], weight: 30 } },
    });
    expect(out).toEqual([
      { type: 'exists', path: 'rule.match' },
      { type: 'exists', path: 'rule.emit' },
      { type: 'equals', path: 'rule.emit.kpi_template_codes', value: ['FIN-EXT-001'] },
    ]);
    // không có kpi_template_codes → chỉ 2 assertion cấu trúc
    expect(goldenAssertions('inline.derivation.rule', { rule: { match: {}, emit: { weight: 1 } } })).toHaveLength(2);
  });

  it('dedup → equals recommendation', () => {
    expect(goldenAssertions('inline.curation.dedup', { recommendation: 'merge' })).toEqual([
      { type: 'equals', path: 'recommendation', value: 'merge' },
    ]);
  });

  it('agent lạ → [] — eval coi case không assertion là FAIL (fail-closed)', () => {
    expect(goldenAssertions('mcp.propose_org_change', { x: 1 })).toEqual([]);
  });
});
