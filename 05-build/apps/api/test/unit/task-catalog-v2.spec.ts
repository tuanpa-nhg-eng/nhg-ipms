/**
 * Unit lát G1/G2 (go-live Từ điển Tác vụ) — mapper Task Catalog V2 thuần:
 * 1194 tác vụ Archive/Task_Dashboard_v2 (D1 thay bộ 815) → seed plan tất định;
 * canonical = ĐÚNG 5 phòng đợt 1 (D5 Kế toán/Tài chính/Nguồn vốn) + KPI ∈ Từ điển
 * (gốc 20 + FIN-EXT 21 đề xuất B1 hiệu chỉnh — D2 giữ hard-block, D3 Claude draft);
 * 100% row qua CHÍNH quality gate (fail-closed — không seed thiếu âm thầm).
 */
import { createHash } from 'crypto';
import {
  TASK_CATALOG_V2, buildSeedPlanV2, KPI_DICTIONARY, KPI_DICTIONARY_EXT, TASK_KPI_MAP_V2,
} from '@ipms/db';
import { evaluateQualityGate, CellPayload } from '../../src/modules/library/quality-gate';

const DICT = new Set([...KPI_DICTIONARY, ...KPI_DICTIONARY_EXT].map((k) => k.code));
/** 5 phòng đợt 1 (D5) — nguồn sự thật scope canonical. */
const FIN_DEPTS = new Set(['Kế toán viên', 'Kế toán tổng hợp', 'Kế toán trưởng', 'Tài chính', 'Nguồn vốn']);

describe('G1/G2 — Task Catalog V2 seed plan (pure)', () => {
  const plan = buildSeedPlanV2();
  const allRows = plan.flatMap((b) => b.rows);
  const canonical = plan.filter((b) => b.mode === 'as_canonical');
  const submission = plan.filter((b) => b.mode === 'as_submission');

  it('tổng thể: 1194 tác vụ = 131 canonical (đợt 1 FIN) + 1063 submission chờ B1', () => {
    expect(TASK_CATALOG_V2).toHaveLength(1194);
    expect(allRows).toHaveLength(1194);
    expect(canonical.flatMap((b) => b.rows)).toHaveLength(131);
    expect(submission.flatMap((b) => b.rows)).toHaveLength(1063);
  });

  it('mã tác vụ duy nhất toàn plan + đúng hệ mã gate', () => {
    const codes = allRows.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)+$/);
  });

  it('[D5] canonical CHỈ thuộc 5 phòng đợt 1 — không phòng nào khác, không "(giả định)"', () => {
    for (const b of canonical) {
      expect(FIN_DEPTS.has(b.dept)).toBe(true);
      for (const r of b.rows) expect(r.governance.assumed).toBe(false);
    }
    // phủ đủ cả 5 phòng
    expect(new Set(canonical.map((b) => b.dept)).size).toBe(5);
  });

  it('[Q1/D2 CHẶN CỨNG] 100% cell canonical có kpiRef ∈ Từ điển (20 gốc + 21 FIN-EXT) + lý do map explainable', () => {
    for (const b of canonical) {
      for (const r of b.rows) {
        expect(r.kpiRef).toBeTruthy();
        expect(DICT.has(r.kpiRef!)).toBe(true);
        expect(r.governance.kpiMapReason).toBeTruthy();
        // measure đầu tiên trỏ đúng KPI đã map
        expect(r.measures[0]).toEqual({ name: `Theo dõi qua KPI ${r.kpiRef}`, kpiRef: r.kpiRef });
      }
    }
    expect(KPI_DICTIONARY_EXT.length).toBe(21);
    expect(Object.keys(TASK_KPI_MAP_V2)).toHaveLength(131);
  });

  it('[fail-closed] 100% row (cả submission) qua CHÍNH quality gate — không row nào rớt khi seed', () => {
    for (const r of allRows) {
      const gate = evaluateQualityGate(r as unknown as CellPayload, 'task_cell');
      if (!gate.ok) {
        throw new Error(`Row ${r.code} rớt gate: ${JSON.stringify(gate.checks.filter((c) => !c.passed))}`);
      }
    }
  });

  it('tác vụ "(giả định)" không bao giờ canonical; submission giữ nguyên KPI ứng viên trong measures', () => {
    const assumedRows = allRows.filter((r) => r.governance.assumed);
    expect(assumedRows.length).toBeGreaterThan(0);
    const canonicalCodes = new Set(canonical.flatMap((b) => b.rows.map((r) => r.code)));
    for (const r of assumedRows) expect(canonicalCodes.has(r.code)).toBe(false);
  });

  it('mã sinh tự động (codeless nguồn) có ghi chú synthesized để B1 nhận biết', () => {
    const synth = TASK_CATALOG_V2.filter((t) => t.codeSynthesized);
    expect(synth.length).toBe(501);
    const byCode = new Map(allRows.map((r) => [r.code, r]));
    for (const t of synth.slice(0, 50)) {
      const row = byCode.get(t.code.toUpperCase())!;
      expect(row.governance.synthesized?.some((s) => s.includes('mã tác vụ sinh tự động'))).toBe(true);
    }
  });

  it('tất định: buildSeedPlanV2() 2 lần giống hệt + PIN sha256 (drift nguồn = fail có chủ đích)', () => {
    expect(buildSeedPlanV2()).toEqual(plan);
    const sha = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    // PIN: đổi generator/harvest/nguồn → sha đổi → PHẢI cập nhật có chủ đích tại đây
    expect(sha).toBe('3e09d1f68939c086d036c216b115b217477be1820881e86bdcfe24424b97fd72');
  });

  it('provenance + dữ liệu giàu: contract/RACI/business_rules thật được giữ nguyên vào payload', () => {
    // GL-DAY-001 (coded, có common_invariant đầy đủ: contract + business_rules + RACI thật)
    const gl = allRows.find((r) => r.code === 'GL-DAY-001')!;
    expect(gl.governance.provenance).toContain('Task_Dashboard_v2');
    expect(gl.inputs.length).toBeGreaterThanOrEqual(3);            // input_contract 3 dòng
    expect(gl.governance.businessRules.length).toBeGreaterThanOrEqual(4);
    expect(gl.governance.inherentRisks.length).toBeGreaterThanOrEqual(7);
    expect(gl.responsibleRole).toBe('Kế toán tổng hợp');           // RACI thật, không fallback
    expect(gl.consulted.length).toBeGreaterThan(0);
  });
});
