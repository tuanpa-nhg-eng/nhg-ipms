/**
 * Quality gate (Spec_BU_Authoring_Gate §7) — pure function, explainable từng check.
 * Điều kiện đủ để publish canonical: tập thuộc tính BẮT BUỘC của 7 nhóm
 * (A định danh · B RACI · C I/O · D đo lường · E mức AI) + KPI hợp lệ (nếu kèm).
 * `ok` = TẤT CẢ check bắt buộc pass (fail-closed); `score` = % pass (báo cáo/threshold tenant).
 */

export interface KpiPayload {
  code?: string;
  nameVi?: string;
  method?: string; // manual | system
  direction?: string; // forward | reverse
  unit?: string;
  frequency?: string;
  formulaExpr?: string;
  dataSource?: string; // bắt buộc khi method=system
}

export interface CellPayload {
  code?: string;
  groupCode?: string;
  clusterCode?: string;
  nameVi?: string;
  nameEn?: string;
  responsibleRole?: string;
  accountableRole?: string;
  consulted?: unknown;
  informed?: unknown;
  inputs?: unknown[];
  outputs?: unknown[];
  measures?: unknown[];
  aiLevel?: string;
  aiDimension?: unknown;
  governance?: unknown;
  riskLevel?: string;
  lifecycle?: unknown;
  kpi?: KpiPayload;
}

export type ContributionType = 'task_cell' | 'kpi' | 'task_cell_with_kpi';

export interface GateCheck {
  id: string;
  label: string;
  passed: boolean;
  note?: string;
}

export interface GateResult {
  ok: boolean;
  score: number; // 0–100, làm tròn 2 chữ số
  checks: GateCheck[];
}

/** Hệ mã tác vụ: các cụm chữ-số HOA nối bằng gạch (vd TS-G01-C02-T005, SMK-S01). */
const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;

const nonEmpty = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;
const arrayAtLeast = (a: unknown, n: number): boolean => Array.isArray(a) && a.length >= n;

export function evaluateQualityGate(payload: CellPayload, type: ContributionType): GateResult {
  const checks: GateCheck[] = [];
  const add = (id: string, label: string, passed: boolean, note?: string) =>
    checks.push({ id, label, passed, ...(note && !passed ? { note } : {}) });

  const needsCell = type === 'task_cell' || type === 'task_cell_with_kpi';
  const needsKpi = type === 'kpi' || type === 'task_cell_with_kpi';

  if (needsCell) {
    add('A.code', 'A — mã tác vụ đúng hệ (vd TS-G01-C02-T005)',
      nonEmpty(payload.code) && CODE_RE.test(payload.code!.trim()),
      'code phải là các cụm CHỮ-SỐ HOA nối bằng gạch');
    add('A.name', 'A — tên tiếng Việt', nonEmpty(payload.nameVi) && payload.nameVi!.trim().length >= 3,
      'nameVi tối thiểu 3 ký tự');
    add('B.responsible', 'B — RACI có Responsible', nonEmpty(payload.responsibleRole),
      'thiếu responsibleRole');
    add('B.accountable', 'B — RACI có Accountable', nonEmpty(payload.accountableRole),
      'thiếu accountableRole');
    add('C.inputs', 'C — có ít nhất 1 input', arrayAtLeast(payload.inputs, 1), 'inputs rỗng');
    add('C.outputs', 'C — có ít nhất 1 output', arrayAtLeast(payload.outputs, 1), 'outputs rỗng');
    add('D.measures', 'D — có ít nhất 1 measure/định mức', arrayAtLeast(payload.measures, 1),
      'measures rỗng');
    add('E.aiLevel', 'E — có mức AI', nonEmpty(payload.aiLevel), 'thiếu aiLevel');
  }

  if (needsKpi) {
    const kpi = payload.kpi;
    add('K.exists', 'KPI — có khối kpi đính kèm', !!kpi, 'type yêu cầu KPI nhưng payload.kpi trống');
    if (kpi) {
      // [F93] KPI thuần không có cell code để sinh mã → kpi.code bắt buộc
      // (thiếu sẽ approve được nhưng publish kẹt vĩnh viễn — chặn tại gate)
      if (type === 'kpi') {
        add('K.code', 'KPI thuần — bắt buộc có mã', nonEmpty(kpi.code), 'thiếu kpi.code');
      }
      add('K.name', 'KPI — có tên', nonEmpty(kpi.nameVi), 'thiếu kpi.nameVi');
      add('K.method', 'KPI — method hợp lệ (manual|system)',
        kpi.method === 'manual' || kpi.method === 'system', `method '${kpi.method ?? ''}' không hợp lệ`);
      add('K.direction', 'KPI — direction hợp lệ (forward|reverse)',
        kpi.direction === 'forward' || kpi.direction === 'reverse',
        `direction '${kpi.direction ?? ''}' không hợp lệ`);
      if (kpi.method === 'system') {
        add('K.dataSource', 'KPI system — bắt buộc data_source', nonEmpty(kpi.dataSource),
          'KPI method=system phải khai dataSource');
      }
    }
  }

  const passed = checks.filter((c) => c.passed).length;
  const score = checks.length === 0 ? 0 : Number(((passed / checks.length) * 100).toFixed(2));
  // fail-closed: type không sinh check nào (dị dạng) → không ok
  return { ok: checks.length > 0 && passed === checks.length, score, checks };
}

/** Chuẩn hoá tên để so trùng (dedup): thường hoá + bỏ dấu tiếng Việt + nén khoảng trắng. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu tổ hợp sau NFD
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
