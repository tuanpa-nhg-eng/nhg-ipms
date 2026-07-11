/**
 * Mapper Task Catalog → Task Cell seed rows (lát 4i).
 *
 * Nguồn: TASK_CATALOG (815 tác vụ / 21 phòng, sinh từ Task_Catalog_Tech_Exec.html).
 * Sinh: mã tác vụ tự động `<DEPT>-G<nn>-T<nnn>` + payload đủ 7 nhóm qua quality gate
 * + map KPI SƠ BỘ theo domain (Q1 CHẶN CỨNG — chỉ tác vụ map được KPI thật trong
 * Từ điển KPI 20 metric mới đi as_canonical; còn lại as_submission chờ B1 bổ sung).
 *
 * Mọi phép map đều EXPLAINABLE: lý do gắn KPI + trường tổng hợp (RACI mặc định,
 * I/O suy từ nguồn/tên với 50 tác vụ Kế toán thiếu chi tiết) ghi trong governance
 * để phòng ban hiệu chỉnh qua vòng lặp tối ưu (lát 4k).
 */
import { KPI_DICTIONARY } from './kpi-dictionary.data';
import { TASK_CATALOG, TaskCatalogEntry } from './task-catalog.data';

/** Payload Task Cell — khớp cấu trúc CellPayload của quality gate (apps/api). */
export interface TaskCellSeedRow {
  code: string;
  groupCode: string;
  nameVi: string;
  responsibleRole: string;
  accountableRole: string;
  inputs: string[];
  outputs: string[];
  measures: Array<{ name: string; kpiRef?: string }>;
  aiLevel: string;
  riskLevel?: string;
  governance: {
    dataType: string;
    trigger: string;
    sourceSystems: string[];
    tools: string[];
    proposedTools: string[];
    provenance: string;
    kpiMapReason?: string;
    synthesized?: string[];
  };
  lifecycle: { groupLabel: string; catalogDept: string; catalogOrdinal: number };
  kpiRef?: string;
}

interface KeywordRule { contains: string; kpi: string }

interface DeptConfig {
  slug: string;
  /** Domain KPI map được (Q1): default + keyword override. Không có = as_submission. */
  kpi?: { domain: string; default: string; keywords: KeywordRule[] };
}

const TCH_KEYWORDS: KeywordRule[] = [
  { contains: 'vượt giờ', kpi: 'TCH-OT-004' },
  { contains: 'đơn giá', kpi: 'TCH-RATE-005' },
  { contains: 'hệ số quy đổi', kpi: 'TCH-COEF-006' },
  { contains: 'quy đổi', kpi: 'TCH-STD-002' },
  { contains: 'định mức', kpi: 'TCH-QUOTA-003' },
  { contains: 'nghĩa vụ giờ', kpi: 'TCH-QUOTA-003' },
  { contains: 'thực giảng', kpi: 'TCH-ACT-001' },
];

const ADM_KEYWORDS: KeywordRule[] = [
  { contains: 'khách hàng tiềm năng', kpi: 'ADM-LEAD-001' },
  { contains: 'lead', kpi: 'ADM-LEAD-001' },
  { contains: 'mql', kpi: 'ADM-MQL-002' },
  { contains: 'sql', kpi: 'ADM-SQL-003' },
  { contains: 'hồ sơ', kpi: 'ADM-APP-004' },
  { contains: 'chuyển đổi', kpi: 'ADM-CVR-006' },
  { contains: 'chi phí', kpi: 'ADM-CPE-007' },
  { contains: 'nhập học', kpi: 'ADM-ENR-005' },
];

const FIN_KEYWORDS: KeywordRule[] = [
  { contains: 'công nợ', kpi: 'FIN-TUI-DEBT-003' },
  { contains: 'phải thu', kpi: 'FIN-TUI-REC-001' },
  { contains: 'thực thu', kpi: 'FIN-TUI-COL-002' },
  { contains: 'thu học phí', kpi: 'FIN-TUI-COL-002' },
  { contains: 'học bổng', kpi: 'FIN-SCHOL-004' },
  { contains: 'ebitda', kpi: 'FIN-EBITDA-007' },
  { contains: 'tỷ lệ thu', kpi: 'FIN-COLR-006' },
];

/**
 * 21 phòng ban → slug mã + map KPI sơ bộ.
 * CHỈ 3 domain có KPI trong Từ điển (Giờ giảng TCH-* · Tuyển sinh ADM-* · Học phí &
 * Tài chính FIN-*) được map → as_canonical. 13 phòng còn lại (Nhân sự, Pháp chế,
 * Lịch học, Kế toán, Dự báo…) KHÔNG map KPI gượng ép — đi as_submission chờ B1
 * bổ sung KPI thật rồi mới active/canonical (Quyết định Q1, spec §12).
 */
export const DEPT_CONFIG: Record<string, DeptConfig> = {
  // — domain Giờ giảng (TCH-*)
  'Chấm công lịch giảng': {
    slug: 'CCLG', kpi: { domain: 'Giờ giảng', default: 'TCH-ACT-001', keywords: TCH_KEYWORDS },
  },
  'Giờ giảng đại học': {
    slug: 'GGDH', kpi: { domain: 'Giờ giảng', default: 'TCH-STD-002', keywords: TCH_KEYWORDS },
  },
  'Dự báo khối lượng giờ giảng đại học': {
    slug: 'DBGG', kpi: { domain: 'Giờ giảng', default: 'TCH-STD-002', keywords: TCH_KEYWORDS },
  },
  'Dự báo Định biên Giảng viên dựa trên khối lượng giờ giảng dự kiến Đại học': {
    slug: 'DBGV', kpi: { domain: 'Giờ giảng', default: 'TCH-QUOTA-003', keywords: TCH_KEYWORDS },
  },
  'Kiểm toán Giờ giảng đại học': {
    slug: 'KTGG', kpi: { domain: 'Giờ giảng', default: 'TCH-ACT-001', keywords: TCH_KEYWORDS },
  },
  // — domain Tuyển sinh (ADM-*)
  'Tuyển sinh': {
    slug: 'TS', kpi: { domain: 'Tuyển sinh', default: 'ADM-ENR-005', keywords: ADM_KEYWORDS },
  },
  // — domain Học phí & Tài chính (FIN-*)
  'Tài chính': {
    slug: 'TC', kpi: { domain: 'Học phí & Tài chính', default: 'FIN-REV-005', keywords: FIN_KEYWORDS },
  },
  'Kiểm toán Công nợ sinh viên': {
    slug: 'KTCN', kpi: { domain: 'Học phí & Tài chính', default: 'FIN-TUI-DEBT-003', keywords: FIN_KEYWORDS },
  },
  // — ngoài 3 domain: KHÔNG map KPI (as_submission chờ B1)
  'Dự báo CF': { slug: 'DBCF' },
  'Dự báo PL': { slug: 'DBPL' },
  'Dự báo chi phí nhân sự căn cứ dự kiến Định biên nhân sự Đại học': { slug: 'DBNS' },
  'Dự báo chi phí vận hành đại học': { slug: 'DBVH' },
  'Giá vốn đào tạo Đại học': { slug: 'GVDT' },
  Hemis: { slug: 'HEMIS' },
  'Kế toán trưởng': { slug: 'KTT' },
  'Kế toán tổng hợp': { slug: 'KTTH' },
  'Kế toán viên': { slug: 'KTV' },
  'Lịch học': { slug: 'LH' },
  'Nguồn vốn': { slug: 'NV' },
  'Nhân sự': { slug: 'NS' },
  'Pháp chế, tuân thủ': { slug: 'PC' },
};

const DICT_CODES = new Set(KPI_DICTIONARY.map((k) => k.code));

/** Map KPI sơ bộ cho 1 tác vụ trong phòng có domain — explainable. */
function mapKpi(cfg: DeptConfig, name: string): { kpi: string; reason: string } | null {
  if (!cfg.kpi) return null;
  const lower = name.toLowerCase();
  for (const rule of cfg.kpi.keywords) {
    if (lower.includes(rule.contains)) {
      return { kpi: rule.kpi, reason: `keyword '${rule.contains}' trong tên tác vụ → ${rule.kpi}` };
    }
  }
  return { kpi: cfg.kpi.default, reason: `mặc định domain ${cfg.kpi.domain} của phòng → ${cfg.kpi.default}` };
}

const PROVENANCE = 'Task_Catalog_Tech_Exec.html (CDO/CTO, 8/7/2026) — seed lát 4i';

/** Số nhóm G<nn>: đánh theo THỨ TỰ XUẤT HIỆN nhãn nhóm trong phòng (nhiều phòng
 * dùng nhãn không đánh số) — tất định vì thứ tự HTML nguồn cố định. */
function groupNumbers(entries: TaskCatalogEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!map.has(e.groupLabel)) map.set(e.groupLabel, map.size + 1);
  }
  return map;
}

export function buildTaskCellRow(
  entry: TaskCatalogEntry, cfg: DeptConfig, groupNo: number,
): TaskCellSeedRow {
  const synthesized: string[] = ['RACI mặc định theo phòng — phòng hiệu chỉnh qua vòng lặp tối ưu'];

  // 50 tác vụ Kế toán (System-assisted) không khai I/O trong catalog → tổng hợp
  // tường minh từ hệ thống nguồn + tên tác vụ (tên là phát biểu kết quả).
  let inputs = entry.inputs;
  if (inputs.length === 0) {
    inputs = entry.sources.length > 0
      ? entry.sources.map((s) => `Dữ liệu từ ${s} (catalog chưa khai chi tiết đầu vào)`)
      : ['(Catalog chưa khai đầu vào — phòng bổ sung khi tối ưu)'];
    synthesized.push('inputs suy từ hệ thống nguồn — catalog không khai');
  }
  let outputs = entry.outputs;
  if (outputs.length === 0) {
    outputs = [`${entry.name} (kết quả nêu tại tên tác vụ — phòng chi tiết hoá khi tối ưu)`];
    synthesized.push('outputs suy từ tên tác vụ — catalog không khai');
  }

  const mapped = mapKpi(cfg, entry.name);
  if (mapped && !DICT_CODES.has(mapped.kpi)) {
    // fail-closed: config trỏ KPI ngoài Từ điển là bug cấu hình, không được lọt seed
    throw new Error(`DEPT_CONFIG lỗi: KPI '${mapped.kpi}' không có trong Từ điển KPI (${entry.dept})`);
  }

  const code = `${cfg.slug}-G${String(groupNo).padStart(2, '0')}-T${String(entry.ordinal).padStart(3, '0')}`;
  return {
    code,
    groupCode: `${cfg.slug}-G${String(groupNo).padStart(2, '0')}`,
    nameVi: entry.name,
    responsibleRole: `Chuyên viên ${entry.dept}`,
    accountableRole: `Trưởng phòng ${entry.dept}`,
    inputs,
    outputs,
    measures: mapped
      ? [{ name: `Theo dõi qua KPI ${mapped.kpi}`, kpiRef: mapped.kpi }]
      : [{ name: 'Định mức/SLA chưa khai — phòng bổ sung khi gắn KPI (vòng lặp tối ưu)' }],
    aiLevel: entry.aiLevel,
    governance: {
      dataType: entry.dataType,
      trigger: entry.trigger,
      sourceSystems: entry.sources,
      tools: entry.tools,
      proposedTools: entry.proposals,
      provenance: PROVENANCE,
      ...(mapped ? { kpiMapReason: mapped.reason } : {}),
      synthesized,
    },
    lifecycle: { groupLabel: entry.groupLabel, catalogDept: entry.dept, catalogOrdinal: entry.ordinal },
    ...(mapped ? { kpiRef: mapped.kpi } : {}),
  };
}

export interface SeedBatch {
  dept: string;
  slug: string;
  /** as_canonical = có KPI thật (Q1) · as_submission = chờ B1 bổ sung KPI. */
  mode: 'as_canonical' | 'as_submission';
  rows: TaskCellSeedRow[];
}

/** Kế hoạch seed 815 tác vụ: 21 batch theo phòng, mode theo Q1. Pure + tất định. */
export function buildSeedPlan(): SeedBatch[] {
  const byDept = new Map<string, TaskCatalogEntry[]>();
  for (const e of TASK_CATALOG) {
    const list = byDept.get(e.dept) ?? [];
    list.push(e);
    byDept.set(e.dept, list);
  }

  const batches: SeedBatch[] = [];
  for (const [dept, entries] of byDept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg) throw new Error(`Phòng '${dept}' chưa khai trong DEPT_CONFIG — bổ sung slug/KPI map trước khi seed`);
    const groups = groupNumbers(entries);
    batches.push({
      dept,
      slug: cfg.slug,
      mode: cfg.kpi ? 'as_canonical' : 'as_submission',
      rows: entries.map((e) => buildTaskCellRow(e, cfg, groups.get(e.groupLabel)!)),
    });
  }
  return batches;
}
