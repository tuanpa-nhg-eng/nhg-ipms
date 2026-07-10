/**
 * Unit Phase 3 lát 4h — resolveKpiRef: mã KPI cuối của cell.
 * Ưu tiên KPI đề xuất mới (payload.kpi.code) > link KPI có sẵn (payload.kpiRef) > undefined.
 */
import { resolveKpiRef } from '../../src/modules/library/quality-gate';

describe('resolveKpiRef', () => {
  it('không có gì → undefined', () => {
    expect(resolveKpiRef({})).toBeUndefined();
  });
  it('chỉ link → dùng kpiRef', () => {
    expect(resolveKpiRef({ kpiRef: 'ADM-LEAD-001' })).toBe('ADM-LEAD-001');
  });
  it('có kpi đề xuất mới → ưu tiên kpi.code', () => {
    expect(resolveKpiRef({ kpi: { code: 'KPI-NEW' }, kpiRef: 'ADM-LEAD-001' })).toBe('KPI-NEW');
  });
  it('kpi không code nhưng có link → dùng link', () => {
    expect(resolveKpiRef({ kpi: { nameVi: 'x' }, kpiRef: 'FIN-REV-005' })).toBe('FIN-REV-005');
  });
  it('trim khoảng trắng', () => {
    expect(resolveKpiRef({ kpiRef: '  TCH-ACT-001 ' })).toBe('TCH-ACT-001');
  });
});
