/**
 * Generator (lát G1 — go-live Từ điển Tác vụ): bóc danh mục tác vụ THẬT từ
 * `06-tu-dien-tac-vu/Archive/Task_Dashboard_v2.html` (mảng `const A=[...]`) →
 * chuẩn hoá + dedup theo mã → ghi committed `src/task-catalog-v2.data.ts`.
 *
 * Nguồn giàu hơn hẳn bản 815 keyword (Task_Catalog_Tech_Exec): có input/output_contract,
 * business_rules(+severity), inherent_risks, RACI thật, source_systems, tools, KPI ứng viên.
 * Schema NGUỒN KHÔNG ĐỒNG NHẤT giữa các jsonFile → trích theo nhiều fallback.
 *
 * Chạy: node packages/db/scripts/parse-task-dashboard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../../06-tu-dien-tac-vu/Archive/Task_Dashboard_v2.html');
const OUT = path.resolve(__dirname, '../src/task-catalog-v2.data.ts');

// ---------- 1. Bóc mảng `const A=[...]` (cân bằng ngoặc, tôn trọng chuỗi) ----------
const html = fs.readFileSync(SRC, 'utf8');
const marker = 'const A=[';
const i = html.indexOf(marker);
if (i < 0) throw new Error('Không thấy `const A=[` trong nguồn');
const start = i + marker.length - 1;
let depth = 0, inStr = false, esc = false, end = -1;
for (let j = start; j < html.length; j++) {
  const c = html[j];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === '[' || c === '{') depth++;
  else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = j; break; } }
}
if (end < 0) throw new Error('Mảng A không cân bằng');
const RAW = JSON.parse(html.slice(start, end + 1));

// ---------- 2. Helpers trích trường (fallback nhiều tầng) ----------
const s = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v : []);
function pick(d, ...paths) {
  for (const p of paths) {
    const val = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
    if (val != null && !(typeof val === 'string' && val.trim() === '') && !(Array.isArray(val) && val.length === 0)) return val;
  }
  return undefined;
}
function normRaci(r) {
  r = r || {};
  const g = (k) => arr(r[k]).map(s).filter(Boolean);
  return { responsible: g('responsible'), accountable: g('accountable'), consulted: g('consulted'), informed: g('informed') };
}
function normRules(v) {
  return arr(v).map((x) => (typeof x === 'string' ? { rule: x } : { rule: s(x.rule), source: s(x.source) || undefined, severity: s(x.severity) || undefined }))
    .filter((x) => x.rule);
}
// jsonFile → domain (đợt 1 = FIN)
function domainOf(jsonFile, code) {
  const f = (jsonFile || '').toUpperCase();
  const c = (code || '').toUpperCase();
  if (f.startsWith('FIN') || /^(ACC|GL|TAX|AP|AR|TREAS|FUND)-/.test(c)) return 'FIN';
  if (f.startsWith('HR')) return 'HR';
  if (f.startsWith('PHAPCHE') || f.startsWith('LEGAL')) return 'PC';
  if (f.startsWith('TUYENSINH') || f.startsWith('ADM')) return 'ADM';
  if (f.startsWith('EDU')) return 'EDU';
  if (f.startsWith('CONGNGHE') || f.startsWith('TECH') || f.startsWith('IT')) return 'TECH';
  if (f.includes('HBH') || f.includes('HIU') || f.includes('HOSPITAL')) return 'HBH';
  return 'OTHER';
}
const isAssumed = (dep) => /giả định/i.test(dep || '');

function normalize(d, code, codeSynthesized) {
  const det = d.detail || {};
  const raw = det._raw || {};
  const task = raw.task || {};
  const inv = (raw.common && raw.common.common_invariant) || {};
  const ext = (raw.common && raw.common.common_extended) || {};
  const jsonFile = d.jsonFile || det._jsonFile || '';
  const department = s(pick(det, 'department') || task.department || d.dept);
  return {
    code,
    codeSynthesized,
    name: s(d.name || det.task_name || task.task_name),
    dept: s(d.dept),
    department,
    jsonFile,
    domain: domainOf(jsonFile, code),
    assumed: isAssumed(d.dept) || isAssumed(department),
    groupName: s(det.group_name || d.group),
    type: s(d.type || det.task_nature || task.task_nature),
    scope: s(d.scope),
    digiLevel: s(d.digiLevel || det.digitalization_level),
    systemsSummary: s(d.systems),
    roleOwner: s(pick(det, 'role_owner') || task.role_owner || (raw.common && raw.common.role_owner)),
    taskObject: s(pick(det, 'task_object') || task.task_object),
    generatedDataType: s(pick(det, 'generated_data_type') || task.generated_data_type),
    financialClassification: s(pick(det, 'financial_classification') || task.financial_classification),
    frequency: s(pick(det, 'frequency') || task.frequency),
    trigger: s(pick(det, 'trigger') || task.trigger),
    inputsSummary: s(pick(det, 'inputs_summary') || task.inputs_summary),
    outputsSummary: s(pick(det, 'outputs_summary') || task.outputs_summary),
    inputContract: arr(pick(det, 'input_contract', '_raw.common.common_invariant.input_contract') || inv.input_contract).map(s).filter(Boolean),
    outputContract: arr(pick(det, 'output_contract', '_raw.common.common_invariant.output_contract') || inv.output_contract).map(s).filter(Boolean),
    businessRules: normRules(pick(det, 'business_rules', '_raw.common.common_invariant.business_rules') || inv.business_rules),
    inherentRisks: arr(pick(det, 'inherent_risks', '_raw.common.common_invariant.inherent_risks') || inv.inherent_risks).map(s).filter(Boolean),
    raci: normRaci(pick(det, 'raci', '_raw.common.common_extended.raci') || ext.raci),
    sourceSystems: arr(pick(det, 'source_systems', '_raw.common.common_extended.source_systems') || ext.source_systems).map(s).filter(Boolean),
    toolsCurrent: arr(pick(det, 'tools_current') || (ext.tools && ext.tools.current)).map(s).filter(Boolean),
    kpisCandidate: arr(det.kpis).map((k) => ({ name: s(k.name || k.kpi || k.metric), target: s(k.target), definition: s(k.definition) })).filter((k) => k.name || k.target),
    riskLevel: s(det.risk_level) || undefined,
    priority: s(det.priority) || undefined,
  };
}

// ---------- 3. Mã tác vụ: giữ mã THẬT; sinh mã TẤT ĐỊNH cho dòng thiếu mã ----------
// 501/1215 dòng nguồn có mã placeholder ('-') nhưng là TÁC VỤ THẬT riêng biệt
// (100% có detail + KPI ứng viên). Định danh ổn định: (jsonFile, stt) — stt là
// DỮ LIỆU NHÚNG trong file nguồn (không phải vị trí parse) và Archive đã đông cứng
// → sinh mã `<JSONFILE-SLUG>-T<stt>` tất định, đánh dấu codeSynthesized để B1 biết.
const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;
const fileSlug = (jf) => (jf || 'UNKNOWN').split('_').filter((w) => w && w.toLowerCase() !== 'tasks')
  .map((w) => w.toUpperCase()).join('-');
const richness = (d) => JSON.stringify(d.detail || {}).length;
const byCode = new Map();
const dropped = [];
let synthesizedCount = 0;
for (const d of RAW) {
  let code = s(d.code).toUpperCase();
  let codeSynthesized = false;
  if (!CODE_RE.test(code)) {
    if (d.stt == null || !s(d.jsonFile)) { dropped.push({ code: s(d.code), name: s(d.name) }); continue; }
    code = `${fileSlug(d.jsonFile)}-T${String(d.stt).padStart(3, '0')}`;
    if (!CODE_RE.test(code)) { dropped.push({ code, name: s(d.name) }); continue; }
    codeSynthesized = true;
  }
  const prev = byCode.get(code);
  if (!prev || richness(d) > richness(prev.row)) {
    if (!prev && codeSynthesized) synthesizedCount += 1;
    byCode.set(code, { row: d, code, codeSynthesized });
  }
}
if (dropped.length > 0) {
  console.warn(`⚠ Loại ${dropped.length} dòng không định danh được (B1 bổ sung tay qua Authoring Gate):`);
  for (const x of dropped.slice(0, 10)) console.warn(`   code='${x.code}' · ${x.name}`);
}
console.log('Mã sinh tự động (codeSynthesized):', synthesizedCount);
const entries = [...byCode.values()]
  .map((v) => normalize(v.row, v.code, v.codeSynthesized))
  .sort((a, b) => a.code.localeCompare(b.code));

// ---------- 4. Ghi file committed ----------
const header = `/**
 * DỮ LIỆU SINH TỰ ĐỘNG — KHÔNG SỬA TAY.
 * Nguồn: 06-tu-dien-tac-vu/Archive/Task_Dashboard_v2.html (mảng const A)
 * Sinh bởi: packages/db/scripts/parse-task-dashboard.mjs (lát G1 go-live).
 * ${entries.length} tác vụ (dedup theo mã, giữ bản giàu nhất).
 */
export interface TaskCatalogV2Entry {
  code: string; codeSynthesized: boolean; name: string; dept: string; department: string; jsonFile: string;
  domain: 'FIN' | 'HR' | 'PC' | 'ADM' | 'EDU' | 'TECH' | 'HBH' | 'OTHER';
  assumed: boolean; groupName: string; type: string; scope: string;
  digiLevel: string; systemsSummary: string; roleOwner: string; taskObject: string;
  generatedDataType: string; financialClassification: string; frequency: string; trigger: string;
  inputsSummary: string; outputsSummary: string; inputContract: string[]; outputContract: string[];
  businessRules: Array<{ rule: string; source?: string; severity?: string }>;
  inherentRisks: string[];
  raci: { responsible: string[]; accountable: string[]; consulted: string[]; informed: string[] };
  sourceSystems: string[]; toolsCurrent: string[];
  kpisCandidate: Array<{ name: string; target: string; definition: string }>;
  riskLevel?: string; priority?: string;
}

// JSON.parse(string) thay literal: tránh TS2590 (literal ~1200 phần tử quá lớn cho checker)
// và parse nhanh hơn compile literal lớn.
export const TASK_CATALOG_V2: TaskCatalogV2Entry[] = JSON.parse(${JSON.stringify(JSON.stringify(entries))});
`;
fs.writeFileSync(OUT, header);

// ---------- 5. Tóm tắt validate ----------
const by = (f) => { const m = {}; for (const e of entries) m[f(e)] = (m[f(e)] || 0) + 1; return m; };
const dom = by((e) => e.domain);
const fin = entries.filter((e) => e.domain === 'FIN');
const withKpiCand = entries.filter((e) => e.kpisCandidate.length > 0).length;
const finWithContract = fin.filter((e) => e.inputContract.length || e.outputContract.length).length;
console.log('OUT:', OUT);
console.log('Tổng tác vụ (dedup):', entries.length);
console.log('Theo domain:', JSON.stringify(dom));
console.log('assumed "(giả định)":', entries.filter((e) => e.assumed).length, '| real:', entries.filter((e) => !e.assumed).length);
console.log('Có KPI ứng viên nhúng:', withKpiCand);
console.log('--- ĐỢT 1 (domain FIN) ---');
console.log('FIN tổng:', fin.length, '| có input/output_contract:', finWithContract, '| có RACI:', fin.filter((e) => e.raci.responsible.length).length);
console.log('FIN mã mẫu:', fin.slice(0, 8).map((e) => e.code).join(', '));
console.log('FIN dept:', JSON.stringify(by ? (() => { const m = {}; for (const e of fin) m[e.dept] = (m[e.dept] || 0) + 1; return m; })() : {}));
