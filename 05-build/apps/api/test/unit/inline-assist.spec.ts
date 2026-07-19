/**
 * Unit — [Lát AI inline] parser fail-closed 4 tác vụ + MockLlmClient tất định
 * cho các agent inline (shape mock phải KHỚP parser — hợp đồng 2 chiều).
 */
import { MockLlmClient } from '../../src/modules/ai/llm/mock-llm-client';
import {
  InlineParseError,
  parseCurationDedup, parseDerivationRule, parseKpiLink, parseTaskcellDraft,
} from '../../src/modules/ai/inline/inline-assist.tasks';

describe('inline-assist parsers — fail-closed', () => {
  // ===== taskcell.draft =====
  it('taskcell.draft: fill hợp lệ qua; field ngoài whitelist / sai kiểu / fill rỗng → InlineParseError', () => {
    const ok = parseTaskcellDraft({
      fill: { responsibleRole: 'CV', inputs: [{ name: 'x' }] }, reason: 'vì thiếu B/C',
    });
    expect(Object.keys(ok.fill)).toEqual(['responsibleRole', 'inputs']);

    expect(() => parseTaskcellDraft({ fill: {}, reason: 'r' })).toThrow(InlineParseError);
    expect(() => parseTaskcellDraft({ fill: { hacked_field: 'x' }, reason: 'r' })).toThrow(/whitelist/);
    expect(() => parseTaskcellDraft({ fill: { inputs: [] }, reason: 'r' })).toThrow(InlineParseError);
    expect(() => parseTaskcellDraft({ fill: { nameVi: 'ok' } })).toThrow(/reason/);
    expect(() => parseTaskcellDraft('not-json')).toThrow(InlineParseError);
    expect(() => parseTaskcellDraft(null)).toThrow(InlineParseError);
  });

  // ===== taskcell.kpi_link =====
  it('kpi_link: kpiRef phải THUỘC Từ điển; null/ngoài từ điển → InlineParseError', () => {
    const valid = new Set(['FIN-01', 'EDU-02']);
    const ok = parseKpiLink({ kpiRef: 'FIN-01', reason: 'đo đúng đầu ra' }, valid);
    expect(ok.kpiRef).toBe('FIN-01');

    expect(() => parseKpiLink({ kpiRef: 'HACK-99', reason: 'r' }, valid)).toThrow(/không có trong Từ điển/);
    expect(() => parseKpiLink({ kpiRef: null, reason: 'r' }, valid)).toThrow(InlineParseError);
    expect(() => parseKpiLink({ reason: 'r' }, valid)).toThrow(InlineParseError);
    expect(() => parseKpiLink({ kpiRef: 'FIN-01' }, valid)).toThrow(/reason/);
  });

  // ===== derivation.rule =====
  it('derivation.rule: match/emit non-empty bắt buộc; thiếu → InlineParseError', () => {
    const ok = parseDerivationRule({
      rule: { match: { org_level: ['department'] }, emit: { weight: 30 } }, reason: 'vì sao',
    });
    expect(ok.rule.match.org_level).toEqual(['department']);

    expect(() => parseDerivationRule({ rule: { match: {}, emit: { w: 1 } }, reason: 'r' })).toThrow(/match/);
    expect(() => parseDerivationRule({ rule: { match: { a: 1 }, emit: {} }, reason: 'r' })).toThrow(/emit/);
    expect(() => parseDerivationRule({ reason: 'r' })).toThrow(InlineParseError);
  });

  // ===== curation.dedup =====
  it('curation.dedup: recommendation ∈ {merge, keep_both}; khác → InlineParseError', () => {
    const ok = parseCurationDedup({ recommendation: 'merge', differences: ['nameVi'], reason: 'trùng bản chất' });
    expect(ok.recommendation).toBe('merge');

    expect(() => parseCurationDedup({ recommendation: 'discard', differences: [], reason: 'r' })).toThrow(InlineParseError);
    expect(() => parseCurationDedup({ recommendation: 'merge', differences: [1], reason: 'r' })).toThrow(/differences/);
    expect(() => parseCurationDedup({ recommendation: 'merge', differences: [] })).toThrow(/reason/);
  });
});

describe('MockLlmClient — agent inline TẤT ĐỊNH + shape khớp parser', () => {
  const mock = new MockLlmClient();

  it('inline.taskcell.draft: chạy 2 lần cùng input → cùng output byte-một-byte; fill parse được', async () => {
    const req = {
      agent: 'inline.taskcell.draft', prompt: 'p',
      context: { payload: { nameVi: 'Tư vấn tuyển sinh' }, missing: ['B.responsible', 'C.inputs', 'E.aiLevel'] },
    };
    const r1 = await mock.complete(req);
    const r2 = await mock.complete(req);
    expect(r1.text).toBe(r2.text);
    expect(r1.costUsd).toBe(0);
    const parsed = parseTaskcellDraft(r1.json);
    expect(Object.keys(parsed.fill).sort()).toEqual(['aiLevel', 'inputs', 'responsibleRole']);
  });

  it('inline.taskcell.kpi_link: chọn ứng viên TRONG candidates → parser với validCodes pass', async () => {
    const candidates = [{ code: 'FIN-01', nameVi: 'Doanh thu' }, { code: 'EDU-02', nameVi: 'Tỷ lệ tốt nghiệp' }];
    const req = { agent: 'inline.taskcell.kpi_link', prompt: 'p', context: { cell: { nameVi: 'Thu học phí' }, candidates } };
    const r1 = await mock.complete(req);
    const r2 = await mock.complete(req);
    expect(r1.text).toBe(r2.text);
    const parsed = parseKpiLink(r1.json, new Set(candidates.map((c) => c.code)));
    expect(['FIN-01', 'EDU-02']).toContain(parsed.kpiRef);
  });

  it('inline.taskcell.kpi_link: candidates rỗng → kpiRef null → parser fail-closed', async () => {
    const r = await mock.complete({ agent: 'inline.taskcell.kpi_link', prompt: 'p', context: { candidates: [] } });
    expect(() => parseKpiLink(r.json, new Set())).toThrow(InlineParseError);
  });

  it('inline.derivation.rule: match/emit tất định, reason giải thích "vì sao"', async () => {
    const req = {
      agent: 'inline.derivation.rule', prompt: 'p',
      context: { description: 'KPI cho phòng tuyển sinh', kpiCodes: ['FIN-01', 'ADM-03'] },
    };
    const r1 = await mock.complete(req);
    expect(r1.text).toBe((await mock.complete(req)).text);
    const parsed = parseDerivationRule(r1.json);
    expect(['FIN-01', 'ADM-03']).toContain((parsed.rule.emit as any).kpi_template_codes[0]);
    expect(parsed.reason).toContain('Vì sao');
  });

  it('inline.curation.dedup: ≥3 khác biệt → keep_both; <3 → merge (explainable, tất định)', async () => {
    const many = await mock.complete({
      agent: 'inline.curation.dedup', prompt: 'p', context: { diffFields: ['nameVi', 'aiLevel', 'kpiRef'] },
    });
    expect(parseCurationDedup(many.json).recommendation).toBe('keep_both');
    const few = await mock.complete({
      agent: 'inline.curation.dedup', prompt: 'p', context: { diffFields: ['nameVi'] },
    });
    expect(parseCurationDedup(few.json).recommendation).toBe('merge');
  });
});
