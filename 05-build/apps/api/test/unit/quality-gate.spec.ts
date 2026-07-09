/**
 * Unit Phase 3 lát 4f — quality gate BU Authoring (Spec §7): tập thuộc tính bắt buộc
 * 7 nhóm, KPI hợp lệ, explainable từng check, fail-closed; normalizeName cho dedup.
 */
import { evaluateQualityGate, normalizeName, CellPayload } from '../../src/modules/library/quality-gate';

const FULL_CELL: CellPayload = {
  code: 'TS-G01-C02-T005', nameVi: 'Tư vấn tuyển sinh trực tiếp',
  responsibleRole: 'admissions_officer', accountableRole: 'admissions_manager',
  inputs: ['lead list'], outputs: ['consultation log'], measures: [{ name: 'SLA', target: 24 }],
  aiLevel: 'assist',
};

describe('quality gate — task_cell', () => {
  it('đủ tập bắt buộc → ok, score 100', () => {
    const r = evaluateQualityGate(FULL_CELL, 'task_cell');
    expect(r.ok).toBe(true);
    expect(r.score).toBe(100);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it.each([
    ['thiếu code', { ...FULL_CELL, code: undefined }, 'A.code'],
    ['code sai hệ (thường)', { ...FULL_CELL, code: 'ts-g01' }, 'A.code'],
    ['code KHÔNG có gạch', { ...FULL_CELL, code: 'TSG01' }, 'A.code'],
    ['thiếu Responsible', { ...FULL_CELL, responsibleRole: '' }, 'B.responsible'],
    ['thiếu Accountable', { ...FULL_CELL, accountableRole: undefined }, 'B.accountable'],
    ['inputs rỗng', { ...FULL_CELL, inputs: [] }, 'C.inputs'],
    ['thiếu outputs', { ...FULL_CELL, outputs: undefined }, 'C.outputs'],
    ['measures rỗng', { ...FULL_CELL, measures: [] }, 'D.measures'],
    ['thiếu aiLevel', { ...FULL_CELL, aiLevel: undefined }, 'E.aiLevel'],
  ])('%s → không ok, check %s fail có note', (_label, payload, failedId) => {
    const r = evaluateQualityGate(payload as CellPayload, 'task_cell');
    expect(r.ok).toBe(false);
    const failed = r.checks.find((c) => c.id === failedId);
    expect(failed?.passed).toBe(false);
    expect(failed?.note).toBeTruthy(); // explainable
    expect(r.score).toBeLessThan(100);
  });
});

describe('quality gate — KPI kèm', () => {
  it('task_cell_with_kpi: KPI manual hợp lệ → ok', () => {
    const r = evaluateQualityGate({
      ...FULL_CELL,
      kpi: { nameVi: 'Tỷ lệ chốt', method: 'manual', direction: 'forward' },
    }, 'task_cell_with_kpi');
    expect(r.ok).toBe(true);
  });

  it('KPI system thiếu dataSource → fail đúng check K.dataSource', () => {
    const r = evaluateQualityGate({
      ...FULL_CELL,
      kpi: { nameVi: 'Số hồ sơ', method: 'system', direction: 'forward' },
    }, 'task_cell_with_kpi');
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'K.dataSource')?.passed).toBe(false);
  });

  it('type yêu cầu KPI nhưng payload.kpi trống → fail K.exists', () => {
    const r = evaluateQualityGate(FULL_CELL, 'task_cell_with_kpi');
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'K.exists')?.passed).toBe(false);
  });

  it('method/direction lạ → fail', () => {
    const r = evaluateQualityGate({
      ...FULL_CELL, kpi: { nameVi: 'x', method: 'magic', direction: 'up' },
    }, 'task_cell_with_kpi');
    expect(r.checks.find((c) => c.id === 'K.method')?.passed).toBe(false);
    expect(r.checks.find((c) => c.id === 'K.direction')?.passed).toBe(false);
  });

  it('type kpi thuần: chỉ check khối KPI, không check cell; [F93] bắt buộc kpi.code', () => {
    const r = evaluateQualityGate({
      kpi: { code: 'KPI-DL-001', nameVi: 'KPI độc lập', method: 'manual', direction: 'reverse' },
    }, 'kpi');
    expect(r.ok).toBe(true);
    expect(r.checks.some((c) => c.id.startsWith('A.'))).toBe(false);

    // thiếu code → publish sẽ kẹt vĩnh viễn — gate chặn từ đầu
    const noCode = evaluateQualityGate({
      kpi: { nameVi: 'KPI độc lập', method: 'manual', direction: 'reverse' },
    }, 'kpi');
    expect(noCode.ok).toBe(false);
    expect(noCode.checks.find((c) => c.id === 'K.code')?.passed).toBe(false);
  });
});

describe('normalizeName — dedup theo tên tiếng Việt', () => {
  it('bỏ dấu + thường hoá + nén khoảng trắng', () => {
    expect(normalizeName('Tư  Vấn   Tuyển Sinh')).toBe('tu van tuyen sinh');
    expect(normalizeName('Đào tạo — Đợt 2!')).toBe('dao tao dot 2');
  });

  it('hai cách viết cùng nghiệp vụ → cùng khoá so trùng', () => {
    expect(normalizeName('Tư vấn tuyển sinh')).toBe(normalizeName('TƯ VẤN TUYỂN SINH'));
  });
});
