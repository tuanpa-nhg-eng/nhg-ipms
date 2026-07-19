/**
 * Mapper Task Catalog V2 → Task Cell seed rows (lát G1 — go-live Từ điển Tác vụ).
 *
 * Nguồn: TASK_CATALOG_V2 (694 tác vụ, bóc từ Archive/Task_Dashboard_v2.html —
 * THAY bộ 815 keyword theo quyết định D1 15/07/2026). Dữ liệu giàu: mã THẬT
 * (ACC-AP-001, GL-DAY-001…), RACI thật, input/output contract, business_rules,
 * inherent_risks, KPI ứng viên nhúng.
 *
 * Q1 CHẶN CỨNG giữ nguyên (D2): chỉ tác vụ REAL (không "(giả định)") có KPI
 * trong Từ điển (gốc 20 + mở rộng FIN-EXT đề xuất B1 hiệu chỉnh) mới đi
 * as_canonical; còn lại as_submission chờ B1. Map tác vụ→KPI qua TASK_KPI_MAP_V2
 * (explainable từng dòng — sinh bởi scripts/harvest-kpi-fin.mjs).
 */
import { KPI_DICTIONARY } from './kpi-dictionary.data';
import { KPI_DICTIONARY_EXT, TASK_KPI_MAP_V2 } from './kpi-dictionary-ext.data';
import { TASK_CATALOG_V2, TaskCatalogV2Entry } from './task-catalog-v2.data';

/** Payload Task Cell — khớp CellPayload của quality gate (7 nhóm A–G). */
export interface TaskCellSeedRowV2 {
  code: string;
  groupCode: string;
  nameVi: string;
  responsibleRole: string;
  accountableRole: string;
  consulted: string[];
  informed: string[];
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
    frequency: string;
    taskObject: string;
    financialClassification: string;
    scope: string;
    assumed: boolean;
    businessRules: Array<{ rule: string; source?: string; severity?: string }>;
    inherentRisks: string[];
    kpiCandidates: string[];
    kpiMapReason?: string;
    synthesized?: string[];
  };
  lifecycle: { groupLabel: string; catalogDept: string; sourceFile: string; domain: string };
  kpiRef?: string;
}

export interface SeedBatchV2 {
  dept: string;
  slug: string;
  /** as_canonical = real + KPI thật trong Từ điển (Q1) · as_submission = chờ B1. */
  mode: 'as_canonical' | 'as_submission';
  rows: TaskCellSeedRowV2[];
}

/** Hệ mã tác vụ của quality gate: cụm CHỮ-SỐ HOA nối gạch. */
const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;

const DICT_CODES = new Set([...KPI_DICTIONARY, ...KPI_DICTIONARY_EXT].map((k) => k.code));

const PROVENANCE = 'Archive/Task_Dashboard_v2.html (danh mục tác vụ CDO/CTO) — seed lát G1 go-live';

/** Slug phòng tất định: bỏ dấu → chữ cái đầu mỗi từ, HOA (đụng nhau → nối thêm số). */
function deptSlug(dept: string, taken: Map<string, string>): string {
  const existing = taken.get(dept);
  if (existing) return existing;
  const base = dept
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((w) => w[0].toUpperCase()).join('')
    .slice(0, 8) || 'DEPT';
  let slug = base;
  let n = 2;
  const used = new Set(taken.values());
  while (used.has(slug)) slug = `${base}${n++}`;
  taken.set(dept, slug);
  return slug;
}

export function buildTaskCellRowV2(entry: TaskCatalogV2Entry): TaskCellSeedRowV2 {
  const synthesized: string[] = [];

  const code = entry.code.trim().toUpperCase();
  // fail-closed: mã nguồn phải qua hệ mã gate — lệch là dữ liệu nguồn lỗi, không seed âm thầm
  if (!CODE_RE.test(code)) throw new Error(`Mã tác vụ '${entry.code}' không qua hệ mã gate (${entry.dept})`);
  if (entry.codeSynthesized) {
    synthesized.push('mã tác vụ sinh tự động từ (jsonFile, stt) — nguồn không khai mã; B1 cấp mã chính thức qua vòng tối ưu nếu cần');
  }
  if (!entry.name || entry.name.trim().length < 3) {
    throw new Error(`Tác vụ '${code}' thiếu tên hợp lệ (nameVi >= 3 ký tự)`);
  }

  const responsibleRole = entry.raci.responsible[0] || entry.roleOwner
    || `Chuyên viên ${entry.dept}`;
  if (!entry.raci.responsible[0] && !entry.roleOwner) {
    synthesized.push('responsibleRole mặc định theo phòng — nguồn không khai RACI/role_owner');
  }
  const accountableRole = entry.raci.accountable[0] || `Trưởng phòng ${entry.dept}`;
  if (!entry.raci.accountable[0]) {
    synthesized.push('accountableRole mặc định theo phòng — nguồn không khai Accountable');
  }

  let inputs = entry.inputContract.length > 0 ? entry.inputContract
    : entry.inputsSummary ? [entry.inputsSummary] : [];
  if (inputs.length === 0) {
    inputs = entry.sourceSystems.length > 0
      ? entry.sourceSystems.map((s) => `Dữ liệu từ ${s} (nguồn chưa khai chi tiết đầu vào)`)
      : ['(Nguồn chưa khai đầu vào — phòng bổ sung khi tối ưu)'];
    synthesized.push('inputs suy từ hệ thống nguồn — nguồn không khai');
  }
  let outputs = entry.outputContract.length > 0 ? entry.outputContract
    : entry.outputsSummary ? [entry.outputsSummary] : [];
  if (outputs.length === 0) {
    outputs = [`${entry.name} (kết quả nêu tại tên tác vụ — phòng chi tiết hoá khi tối ưu)`];
    synthesized.push('outputs suy từ tên tác vụ — nguồn không khai');
  }

  const mapped = TASK_KPI_MAP_V2[code];
  if (mapped && !DICT_CODES.has(mapped.kpi)) {
    // fail-closed: map trỏ KPI ngoài Từ điển (gốc + ext) là bug cấu hình
    throw new Error(`TASK_KPI_MAP_V2 lỗi: KPI '${mapped.kpi}' không có trong Từ điển (${code})`);
  }

  const candidateNames = entry.kpisCandidate.map((k) => k.name).filter(Boolean);
  const measures: Array<{ name: string; kpiRef?: string }> = [];
  if (mapped) measures.push({ name: `Theo dõi qua KPI ${mapped.kpi}`, kpiRef: mapped.kpi });
  for (const k of entry.kpisCandidate) {
    if (!k.name) continue;
    measures.push({ name: k.target ? `${k.name} — mục tiêu: ${k.target}` : k.name });
  }
  if (measures.length === 0) {
    measures.push({ name: 'Định mức/SLA chưa khai — phòng bổ sung khi gắn KPI (vòng lặp tối ưu)' });
  }

  return {
    code,
    groupCode: code.split('-').slice(0, -1).join('-'),
    nameVi: entry.name,
    responsibleRole,
    accountableRole,
    consulted: entry.raci.consulted,
    informed: entry.raci.informed,
    inputs,
    outputs,
    measures,
    aiLevel: entry.digiLevel || 'Manual',
    ...(entry.riskLevel ? { riskLevel: entry.riskLevel } : {}),
    governance: {
      dataType: entry.generatedDataType || '(Nguồn chưa khai loại dữ liệu)',
      trigger: entry.trigger,
      sourceSystems: entry.sourceSystems,
      tools: entry.toolsCurrent,
      proposedTools: [],
      provenance: PROVENANCE,
      frequency: entry.frequency,
      taskObject: entry.taskObject,
      financialClassification: entry.financialClassification,
      scope: entry.scope,
      assumed: entry.assumed,
      businessRules: entry.businessRules,
      inherentRisks: entry.inherentRisks,
      kpiCandidates: candidateNames,
      ...(mapped ? { kpiMapReason: mapped.reason } : {}),
      ...(synthesized.length > 0 ? { synthesized } : {}),
    },
    lifecycle: {
      groupLabel: entry.groupName || entry.jsonFile,
      catalogDept: entry.dept,
      sourceFile: entry.jsonFile,
      domain: entry.domain,
    },
    ...(mapped ? { kpiRef: mapped.kpi } : {}),
  };
}

/**
 * Kế hoạch seed 694 tác vụ V2: batch theo (phòng, mode) — mode quyết định PER ROW
 * (real + KPI ∈ Từ điển → as_canonical; còn lại as_submission). Pure + tất định.
 */
export function buildSeedPlanV2(): SeedBatchV2[] {
  // fail-closed: mã trùng trong data là bug generator (đã dedup) — không seed chồng
  const seen = new Set<string>();
  for (const e of TASK_CATALOG_V2) {
    const c = e.code.trim().toUpperCase();
    if (seen.has(c)) throw new Error(`TASK_CATALOG_V2 chứa mã trùng: ${c}`);
    seen.add(c);
  }

  const slugTaken = new Map<string, string>();
  const buckets = new Map<string, SeedBatchV2>();
  const sorted = [...TASK_CATALOG_V2].sort((a, b) => a.code.localeCompare(b.code));

  for (const entry of sorted) {
    const row = buildTaskCellRowV2(entry);
    const mode: SeedBatchV2['mode'] =
      !entry.assumed && row.kpiRef ? 'as_canonical' : 'as_submission';
    const key = `${entry.dept}::${mode}`;
    let batch = buckets.get(key);
    if (!batch) {
      batch = { dept: entry.dept, slug: deptSlug(entry.dept, slugTaken), mode, rows: [] };
      buckets.set(key, batch);
    }
    batch.rows.push(row);
  }

  // thứ tự tất định: canonical trước (thư viện nền), rồi submission; trong mode sort theo dept
  return [...buckets.values()].sort((a, b) =>
    a.mode === b.mode ? a.dept.localeCompare(b.dept) : a.mode === 'as_canonical' ? -1 : 1,
  );
}
