/**
 * [Lát AI inline] Định nghĩa 4 tác vụ inline assist — PURE (unit-test được):
 * prompt template (VI) + parser FAIL-CLOSED từng tác vụ. Parser ném InlineParseError
 * khi output LLM lệch shape → service trả 422, KHÔNG tạo suggestion (bất biến).
 *
 * Bất biến chung:
 * - AI KHÔNG tự ghi cell/rule/config — output chỉ thành `ai_suggestion` PENDING.
 * - Mọi giá trị parser cho qua đều đã whitelist field + kiểm type (không tin LLM).
 */

export const INLINE_TASKS = [
  'taskcell.draft', 'taskcell.kpi_link', 'derivation.rule', 'curation.dedup',
] as const;
export type InlineTask = (typeof INLINE_TASKS)[number];

/** Map task → type của ai_suggestion (phân biệt với org_change/derivation_rule của MCP). */
export const INLINE_SUGGESTION_TYPE: Record<InlineTask, string> = {
  'taskcell.draft': 'taskcell_draft',
  'taskcell.kpi_link': 'taskcell_kpi_link',
  'derivation.rule': 'derivation_rule',
  'curation.dedup': 'curation_dedup',
};
export const INLINE_SUGGESTION_TYPES = new Set(Object.values(INLINE_SUGGESTION_TYPE));

export class InlineParseError extends Error {}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function need(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new InlineParseError(msg);
}

// ===== taskcell.draft — điền nhóm A–G còn thiếu =====

/** Whitelist field AI được phép điền + kiểm type từng field (fail-closed). */
const DRAFT_FIELD_CHECK: Record<string, (v: unknown) => boolean> = {
  code: isNonEmptyString,
  nameVi: isNonEmptyString,
  nameEn: isNonEmptyString,
  responsibleRole: isNonEmptyString,
  accountableRole: isNonEmptyString,
  consulted: Array.isArray,
  informed: Array.isArray,
  inputs: (v) => Array.isArray(v) && v.length >= 1,
  outputs: (v) => Array.isArray(v) && v.length >= 1,
  measures: (v) => Array.isArray(v) && v.length >= 1,
  aiLevel: isNonEmptyString,
  riskLevel: isNonEmptyString,
};

export interface TaskcellDraftProposal {
  fill: Record<string, unknown>;
  reason: string;
}

export function parseTaskcellDraft(json: unknown): TaskcellDraftProposal {
  need(isPlainObject(json), 'output không phải object');
  const fill = (json as any).fill;
  need(isPlainObject(fill), 'thiếu fill (object)');
  const keys = Object.keys(fill);
  need(keys.length > 0, 'fill rỗng — không có gì để đề xuất');
  for (const k of keys) {
    const check = DRAFT_FIELD_CHECK[k];
    need(!!check, `field '${k}' ngoài whitelist A–G`);
    need(check(fill[k]), `field '${k}' sai kiểu/giá trị`);
  }
  need(isNonEmptyString((json as any).reason), 'thiếu reason (explainable)');
  return { fill, reason: (json as any).reason };
}

export function promptTaskcellDraft(): string {
  return [
    'Bạn hỗ trợ soạn Task Cell theo quality gate 7 nhóm A–G của iPMS.',
    'Context gồm payload hiện tại và danh sách check còn thiếu (missing).',
    'Đề xuất giá trị cho CHÍNH XÁC các field còn thiếu, trả JSON:',
    '{"suggestion_type":"taskcell_draft","fill":{<field>:<giá trị>},"reason":"vì sao"}',
    'Chỉ dùng field: code,nameVi,nameEn,responsibleRole,accountableRole,consulted,informed,inputs,outputs,measures,aiLevel,riskLevel.',
  ].join('\n');
}

// ===== taskcell.kpi_link — gợi ý kpiRef từ Từ điển KPI =====

export interface KpiLinkProposal {
  kpiRef: string;
  reason: string;
}

/** validCodes = Từ điển KPI server dựng — kpiRef NGOÀI từ điển bị chặn (fail-closed). */
export function parseKpiLink(json: unknown, validCodes: Set<string>): KpiLinkProposal {
  need(isPlainObject(json), 'output không phải object');
  const kpiRef = (json as any).kpiRef;
  need(isNonEmptyString(kpiRef), 'thiếu kpiRef — không có ứng viên phù hợp');
  need(validCodes.has(kpiRef), `kpiRef '${kpiRef}' không có trong Từ điển KPI`);
  need(isNonEmptyString((json as any).reason), 'thiếu reason (explainable)');
  return { kpiRef, reason: (json as any).reason };
}

export function promptKpiLink(): string {
  return [
    'Bạn gợi ý gắn KPI cho Task Cell từ Từ điển KPI chuẩn của iPMS.',
    'Context gồm cell (code, tên, vai trò) và candidates (danh sách KPI hợp lệ).',
    'Chọn 1 kpiRef TRONG candidates, trả JSON:',
    '{"suggestion_type":"kpi_link","kpiRef":"<mã KPI>","reason":"vì sao KPI này đo đúng đầu ra tác vụ"}',
  ].join('\n');
}

// ===== derivation.rule — match/emit + vì sao =====

export interface DerivationRuleProposal {
  rule: { match: Record<string, unknown>; emit: Record<string, unknown> };
  reason: string;
}

export function parseDerivationRule(json: unknown): DerivationRuleProposal {
  need(isPlainObject(json), 'output không phải object');
  const rule = (json as any).rule;
  need(isPlainObject(rule), 'thiếu rule (object)');
  need(isPlainObject(rule.match) && Object.keys(rule.match).length > 0, 'rule.match rỗng');
  need(isPlainObject(rule.emit) && Object.keys(rule.emit).length > 0, 'rule.emit rỗng');
  need(isNonEmptyString((json as any).reason), 'thiếu reason (explainable)');
  return { rule: { match: rule.match, emit: rule.emit }, reason: (json as any).reason };
}

export function promptDerivationRule(): string {
  return [
    'Bạn soạn derivation rule (match → emit) cho Derivation Studio iPMS.',
    'Context gồm description (mô tả người dùng) và kpiCodes (Từ điển KPI để emit).',
    'Trả JSON: {"suggestion_type":"derivation_rule","rule":{"match":{...},"emit":{...}},"reason":"vì sao rule khớp mô tả"}',
    'match dùng các khóa: function_codes, role_family_codes, org_level, grade. emit dùng: kpi_template_codes, task_cell_refs, weight, group_label.',
  ].join('\n');
}

// ===== curation.dedup — tóm tắt khác biệt + khuyến nghị =====

export interface CurationDedupProposal {
  recommendation: 'merge' | 'keep_both';
  differences: string[];
  reason: string;
}

export function parseCurationDedup(json: unknown): CurationDedupProposal {
  need(isPlainObject(json), 'output không phải object');
  const rec = (json as any).recommendation;
  need(rec === 'merge' || rec === 'keep_both', "recommendation phải là 'merge' | 'keep_both'");
  const diffs = (json as any).differences;
  need(Array.isArray(diffs) && diffs.every((d: unknown) => typeof d === 'string'), 'differences phải là string[]');
  need(isNonEmptyString((json as any).reason), 'thiếu reason (explainable)');
  return { recommendation: rec, differences: diffs, reason: (json as any).reason };
}

export function promptCurationDedup(): string {
  return [
    'Bạn hỗ trợ curator xử lý ứng viên trùng (dedup) trong thư viện Task Cell iPMS.',
    'Context gồm a (contribution đang duyệt), b (cell canonical trùng) và diffFields (trường khác nhau).',
    'Tóm tắt khác biệt rồi khuyến nghị, trả JSON:',
    '{"suggestion_type":"curation_dedup","recommendation":"merge|keep_both","differences":["..."],"reason":"vì sao"}',
  ].join('\n');
}
