/**
 * Unit lát 4i — Task Catalog 815 tác vụ: data sinh từ parser + seed plan (pure).
 * Bất biến: 815 tác vụ/21 phòng · mã duy nhất đúng hệ <DEPT>-G<nn>-T<nnn> ·
 * Q1: canonical ⇒ kpiRef ∈ Từ điển KPI 20 metric, submission ⇒ KHÔNG gắn KPI gượng ·
 * 100% payload qua quality gate (kể cả 50 tác vụ Kế toán I/O tổng hợp) · tất định ·
 * dưới cap bytes import.
 */
import * as crypto from 'crypto';
import { TASK_CATALOG, KPI_DICTIONARY, buildSeedPlan, DEPT_CONFIG } from '@ipms/db';
import { evaluateQualityGate, normalizeName, CellPayload } from '../../src/modules/library/quality-gate';

const CODE_RE = /^[A-Z0-9]+-G\d{2}-T\d{3}$/;
const DICT = new Set(KPI_DICTIONARY.map((k) => k.code));

describe('lát 4i — Task Catalog data + seed plan', () => {
  const plan = buildSeedPlan();
  const all = plan.flatMap((b) => b.rows);
  const canonical = plan.filter((b) => b.mode === 'as_canonical');
  const submissions = plan.filter((b) => b.mode === 'as_submission');

  it('data: đúng 815 tác vụ / 21 phòng ban, mọi phòng có trong DEPT_CONFIG', () => {
    expect(TASK_CATALOG).toHaveLength(815);
    const depts = new Set(TASK_CATALOG.map((t) => t.dept));
    expect(depts.size).toBe(21);
    for (const d of depts) expect(DEPT_CONFIG[d]).toBeDefined();
  });

  it('plan: 21 batch = 8 canonical (283 row, 3 domain) + 13 submission (532 row)', () => {
    expect(plan).toHaveLength(21);
    expect(canonical).toHaveLength(8);
    expect(submissions).toHaveLength(13);
    expect(canonical.reduce((s, b) => s + b.rows.length, 0)).toBe(283);
    expect(submissions.reduce((s, b) => s + b.rows.length, 0)).toBe(532);
    expect(all).toHaveLength(815);
  });

  it('mã tác vụ: duy nhất toàn cục, đúng hệ <DEPT>-G<nn>-T<nnn>', () => {
    const codes = all.map((r) => r.code);
    expect(new Set(codes).size).toBe(815);
    for (const c of codes) expect(c).toMatch(CODE_RE);
  });

  it('[Q1] canonical: 100% kpiRef trỏ Từ điển KPI thật + measures dẫn chiếu cùng KPI', () => {
    for (const b of canonical) {
      for (const r of b.rows) {
        expect(r.kpiRef).toBeDefined();
        expect(DICT.has(r.kpiRef!)).toBe(true);
        expect(r.measures[0].kpiRef).toBe(r.kpiRef);
        // explainable: vì sao gắn KPI này
        expect(r.governance.kpiMapReason).toBeTruthy();
      }
    }
  });

  it('[Q1] submission (13 phòng ngoài 3 domain): KHÔNG map KPI gượng ép', () => {
    for (const b of submissions) {
      for (const r of b.rows) expect(r.kpiRef).toBeUndefined();
    }
  });

  it('quality gate: 100% payload PASS (kể cả 50 tác vụ Kế toán I/O tổng hợp, có đánh dấu)', () => {
    let synthesizedIo = 0;
    for (const r of all) {
      const gate = evaluateQualityGate(r as unknown as CellPayload, 'task_cell');
      if (!gate.ok) {
        const fails = gate.checks.filter((c) => !c.passed).map((c) => c.label);
        throw new Error(`${r.code} rớt gate: ${fails.join(' · ')}`);
      }
      if (r.governance.synthesized.some((s) => s.includes('inputs suy từ'))) synthesizedIo += 1;
    }
    expect(synthesizedIo).toBe(50);
  });

  it('cap bytes: mọi row < 16KB (IMPORT_ROW_MAX_BYTES) và mọi batch ≤ 500 row', () => {
    for (const r of all) {
      expect(Buffer.byteLength(JSON.stringify(r), 'utf8')).toBeLessThan(16_384);
    }
    for (const b of plan) expect(b.rows.length).toBeLessThanOrEqual(500);
  });

  it('tất định: buildSeedPlan() 2 lần cho kết quả giống hệt (seed idempotent được)', () => {
    expect(buildSeedPlan()).toEqual(plan);
  });

  it('[F110] PIN map mã→tên: mã sinh theo VỊ TRÍ trong HTML nguồn — nguồn đổi thứ tự/chèn ' +
     'tác vụ thì hash đổi ⇒ PHẢI migration mã có chủ đích (seed script cũng guard drift runtime)', () => {
    const pairs = plan
      .flatMap((b) => b.rows.map((r) => `${r.code}|${normalizeName(r.nameVi)}`))
      .sort();
    const hash = crypto.createHash('sha256').update(pairs.join('\n')).digest('hex');
    expect(hash).toBe('74e76ffd88ffc70995227faa3b1eed617e33d822a7b513f72c17e0feaeed3165');
  });

  it('provenance + RACI mặc định có mặt để phòng ban hiệu chỉnh (explainable)', () => {
    for (const r of all) {
      expect(r.governance.provenance).toContain('Task_Catalog_Tech_Exec');
      expect(r.responsibleRole).toContain('Chuyên viên');
      expect(r.accountableRole).toContain('Trưởng phòng');
      expect(r.governance.synthesized.length).toBeGreaterThanOrEqual(1);
    }
  });
});
