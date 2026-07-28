/**
 * API client cho Configuration Studio — nối backend NestJS thật (:4000).
 * Auth dev: POST /auth/dev-token (env-gated ở API); production thay bằng OIDC Entra.
 * Mọi request kèm Authorization + X-Tenant-Id (guard pipeline TDD §11).
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export interface StudioSession {
  token: string;
  tenantId: string;
  tenantCode: string;
  email: string;
  userId?: string; // app_user.id (claim `sub`) — để FE lọc chính actor (không tự-cấp quyền)
}

/** Đọc `sub` từ payload JWT (không xác thực chữ ký — chỉ để hiển thị/lọc UI).
 *  BE luôn là nguồn chân lý; giá trị này KHÔNG dùng cho quyết định bảo mật. */
function decodeSub(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.sub === "string" ? json.sub : undefined;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(
  session: StudioSession | null,
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(session
      ? { Authorization: `Bearer ${session.token}`, "X-Tenant-Id": session.tenantId }
      : {}),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ApiError(0, "Không kết nối được API — backend đã chạy chưa? (pnpm api:dev, port 4000)");
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? body?.message ?? message;
      if (Array.isArray(message)) message = message.join("; ");
    } catch {}
    throw new ApiError(res.status, String(message));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ===== Trợ lý AI Copilot (P1) =====

export interface ChatModelInfo {
  code: string;
  label: string;
  provider: string;
  recommended?: boolean;
  disabled?: boolean;
}
export interface ChatModelsResponse {
  backendNote: string;
  models: ChatModelInfo[];
  efforts: string[];
}
export interface ChatConvSummary { id: string; title: string; updatedAt: string }
export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  toolCalls?: Array<{ toolName?: string; toolInput?: unknown }> | null;
  suggestionId?: string | null;
  createdAt: string;
}
/** Một mảnh SSE từ POST /ai/chat. */
export interface ChatStreamChunk {
  type: "text" | "tool_use" | "suggestion" | "done" | "error" | "end";
  text?: string;
  conversationId?: string;
  toolName?: string;
  toolInput?: unknown;
  suggestion?: { type: string; summary: string; reason?: string; payload?: { suggestionId?: string } & Record<string, unknown> };
  usage?: { model: string; tokensIn: number; tokensOut: number; costUsd: number };
  error?: string;
}

/** Stream chat qua fetch + đọc SSE (EventSource chỉ GET nên phải tự parse). */
export async function streamChat(
  session: StudioSession,
  body: { conversationId?: string; message: string; model?: string; effort?: string; context?: unknown },
  onChunk: (c: ChatStreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      "X-Tenant-Id": session.tenantId,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message ?? j?.message ?? msg; } catch {}
    throw new ApiError(res.status, String(msg));
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const f of frames) {
        const line = f.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try { onChunk(JSON.parse(line.slice(5).trim()) as ChatStreamChunk); } catch {}
      }
    }
  } finally {
    // [F150] luôn giải phóng reader (kể cả khi onChunk ném / abort) — tránh rò kết nối
    try { await reader.cancel(); } catch {}
  }
}

export async function devLogin(tenantCode: string, email: string): Promise<StudioSession> {
  const r = await apiFetch<{ access_token: string; tenant_id: string }>(null, "/auth/dev-token", {
    method: "POST",
    json: { tenantCode, email },
  });
  return { token: r.access_token, tenantId: r.tenant_id, tenantCode, email, userId: decodeSub(r.access_token) };
}

// ===== Kiểu dữ liệu tối thiểu FE cần (subset của API) =====

export interface ConfigVersion {
  id: string;
  label: string;
  status: "draft" | "preview" | "published" | "archived";
  version: number;
  note?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

export interface DiffSummary {
  configVersion: ConfigVersion;
  summary: Record<string, { create: number; update: number; delete: number; move: number }>;
  changes: Array<{ seq: number; entityType: string; op: string; entityId?: string | null }>;
}

export interface ProcessStep {
  id: string;
  seq: number;
  type: "task" | "decision" | "milestone" | "approval" | "gateway";
  nameVi: string;
  nameEn?: string | null;
  responsibleRole?: string | null;
  config?: Record<string, unknown> | null;
}

export interface ProcessEdge {
  id: string;
  fromStepId: string;
  toStepId: string;
  condition?: string | null;
}

export interface ProcessDef {
  id: string;
  code: string;
  nameVi: string;
  domain?: string | null;
  configVersionId: string;
  steps: ProcessStep[];
  edges: ProcessEdge[];
}

export interface OrgUnit {
  id: string;
  code: string;
  nameVi: string;
  nameEn?: string | null;
  level: string;
  parentId?: string | null;
  /** [Trục B L3] người quản lý đơn vị — cột thô, không FK Prisma (xem schema). */
  managerId?: string | null;
  version?: number;
}

export interface TaskCellRow {
  id: string;
  code: string;
  nameVi: string;
  responsibleRole?: string | null;
  aiLevel?: string | null;
  riskLevel?: string | null;
  kpiRef?: string | null;
  processStepId?: string | null;
}

export interface OrgFunction {
  id: string;
  code: string;
  nameVi: string;
  nameEn?: string | null;
}

export interface UnitFunction {
  functionId: string;
  weight?: number | null;
  function: OrgFunction;
}

export interface KpiTemplate {
  id: string;
  tenantId?: string | null; // null = template dùng chung (global)
  code: string;
  nameVi: string;
  method?: string | null;
  frequency?: string | null;
  functionTags: string[];
  roleFamilyCodes: string[];
  taskCellRefs: string[];
}

export interface DerivationRule {
  id: string;
  priority: number;
  match: {
    function_codes?: string[];
    role_family_codes?: string[];
    org_level?: string[];
    grade?: string[];
  };
  emit: {
    kpi_template_codes?: string[];
    task_cell_refs?: string[];
    weight?: number;
    group_label?: string;
    group_weight?: number;
  };
  note?: string | null;
}

export interface DerivationResult {
  targetType: string;
  action: "add" | "update" | "keep" | "error";
  payload: Record<string, unknown>;
  reason: string;
}

export interface DerivationRunOut {
  run: { id: string; status: string };
  summary: { add: number; update: number; keep: number; error: number };
  results: DerivationResult[];
}

export interface BrandKitData {
  id?: string;
  configVersionId: string;
  displayName?: string | null;
  logoLightUri?: string | null;
  logoDarkUri?: string | null;
  tokens: Record<string, string>;
  status?: string;
  a11yChecked?: boolean;
}

// ===== BU Authoring Gate (lát 4g) =====

export interface KpiBlock {
  code?: string;
  nameVi?: string;
  method?: "manual" | "system";
  direction?: "forward" | "reverse";
  unit?: string;
  frequency?: string;
  formulaExpr?: string;
  dataSource?: string;
}

export interface CellPayload {
  code?: string;
  nameVi?: string;
  nameEn?: string;
  responsibleRole?: string;
  accountableRole?: string;
  inputs?: string[];
  outputs?: string[];
  measures?: Array<string | { name: string }>;
  aiLevel?: string;
  riskLevel?: string;
  kpiRef?: string; // link KPI có sẵn trong Từ điển (phân biệt với kpi = đề xuất mới)
  kpi?: KpiBlock;
}

export interface GateCheck {
  id: string;
  label: string;
  passed: boolean;
  note?: string;
}

export interface DedupCandidate {
  id: string;
  similarTaskCellId?: string | null;
  similarity?: string | number | null;
  reason?: string | null;
  resolution: "pending" | "merge" | "keep_both" | "discard";
}

export interface LibraryReviewRow {
  id: string;
  action: string;
  note?: string | null;
  createdAt: string;
}

export interface LibraryContribution {
  id: string;
  type: "task_cell" | "kpi" | "task_cell_with_kpi";
  status: string;
  payload: CellPayload;
  qualityScore?: string | number | null;
  qualityReport?: { ok: boolean; score: number; checks: GateCheck[] } | null;
  orgUnitId?: string | null;
  authorId: string;
  targetScope: string;
  version: number;
  submittedAt?: string | null;
  dedupCandidates?: DedupCandidate[];
  reviews?: LibraryReviewRow[];
}

export interface CanvasLayoutData {
  kind: string;
  refId: string;
  nodes: Record<string, { x: number; y: number }>;
  edges: unknown[];
}

// ===== Từ điển Tác vụ — tra cứu canonical (read-only) =====

export interface DictCellRow {
  code: string;
  groupCode?: string | null;
  clusterCode?: string | null;
  nameVi: string;
  nameEn?: string | null;
  responsibleRole?: string | null;
  aiLevel?: string | null;
  riskLevel?: string | null;
  kpiRef?: string | null;
  origin?: string | null;
  status?: string | null;        // [4l] draft|active|reopened|deprecated
  activeVersion?: number | null; // [4l] số vòng tối ưu đã qua
}

// ===== Từ điển Tác vụ — vòng lặp tối ưu (lát 4k/4l) =====

export interface TaskFeedback {
  id: string;
  taskCellId: string;
  authorId: string;
  version?: number | null;
  body: string;
  category: string;   // optimize|defect|question
  status: string;     // open|triaged|reopened|resolved|wontfix
  createdAt: string;
}

export interface TaskRevision {
  id?: string;
  version: number;
  changeSummary?: string | null;
  contributionId?: string | null;
  activatedAt: string;
  snapshot?: Record<string, unknown>; // chỉ có ở get chi tiết
}

export interface DeptBoardCell {
  id: string;
  code: string;
  nameVi: string;
  status: string;
  activeVersion: number;
  ownerOrgUnitId?: string | null;
  kpiRef?: string | null;
  aiLevel?: string | null;
  openFeedback?: number;
}

export interface DeptBoardQueueItem {
  id: string;
  taskCellId: string;
  status: string;
  authorId: string;
  kpiRef?: string | null;
  qualityScore?: string | number | null;
  submittedAt?: string | null;
  payload: CellPayload & { code?: string; nameVi?: string };
}

export interface DeptStaff {
  userId: string;
  fullName: string;
  employeeCode?: string | null;
  orgUnitId?: string | null;
  canAuthor: boolean;
}

export interface DeptBoard {
  mine: DeptBoardCell[];
  unclaimed: DeptBoardCell[];
  queue: DeptBoardQueueItem[];
  staff: DeptStaff[];
  orgUnits: Array<{ id: string; code: string; nameVi: string }>;
}

export interface AuthoringGrant {
  id: string;
  granteeId: string;
  orgUnitId: string;
  capability: string;
  status: string;
  grantedAt: string;
}

export interface PersonRow {
  id: string;
  fullName: string;
  employeeCode?: string | null;
  orgUnitId?: string | null;
  email?: string | null;
}

/** Mục Từ điển KPI chuẩn (kpi_template isDictionary=true) — GET /kpi-dictionary. */
export interface KpiDictItem {
  id: string;
  code: string;
  nameVi: string;
  nameEn?: string | null;
  method?: string | null;
  direction?: string | null;
  unit?: string | null;
  frequency?: string | null;
  formulaExpr?: string | null;
  domain?: string | null;
  definition?: string | null;
  grain?: string | null;
  dataClassification?: string | null;
  aiBoundary?: string | null;
  sourceSystem?: string | null;
  isDictionary?: boolean;
}

export interface DictListResponse {
  total: number;
  matched: number;
  capped?: boolean; // true = vượt trần LIST_CAP, list/facet chỉ trên phần đầu
  cells: DictCellRow[];
  facets: {
    groups: Array<{ groupCode: string; groupLabel?: string | null; dept?: string | null; count: number }>;
    aiLevels: Array<{ aiLevel: string; count: number }>;
    kpis: Array<{ kpiRef: string; count: number }>;
  };
}

/** Chi tiết cell canonical — đủ 7 nhóm thuộc tính + KPI join (nếu resolve được). */
export interface DictCellDetail {
  cell: {
    code: string;
    groupCode?: string | null;
    clusterCode?: string | null;
    nameVi: string;
    nameEn?: string | null;
    responsibleRole?: string | null;
    accountableRole?: string | null;
    consulted?: unknown;
    informed?: unknown;
    inputs?: unknown;
    outputs?: unknown;
    measures?: unknown;
    aiLevel?: string | null;
    aiDimension?: unknown;
    governance?: Record<string, unknown> | null;
    riskLevel?: string | null;
    lifecycle?: Record<string, unknown> | null;
    kpiRef?: string | null;
    origin?: string | null;
    libScope?: string | null;
    usageCount?: number | null;
  };
  kpi: {
    code: string;
    nameVi: string;
    method?: string | null;
    direction?: string | null;
    unit?: string | null;
    frequency?: string | null;
    domain?: string | null;
    definition?: string | null;
    grain?: string | null;
    dataClassification?: string | null;
    aiBoundary?: string | null;
    sourceSystem?: string | null;
    isDictionary?: boolean;
  } | null;
}

// ===== Vòng đời hiệu suất — Trục A (goal · check-in · review · calibration) =====
// Kiểu là SUBSET những trường FE thật sự dùng, cố ý KHÔNG mirror nguyên row DB:
// read-model backend whitelist select (I5) nên thêm trường ở đây mà BE không trả
// sẽ lộ ra ngay lúc render, thay vì im lặng nhận dữ liệu thừa.

export interface MeResponse {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  orgUnitId?: string | null;
  managerId?: string | null;
  /** [L4] Quyền của CHÍNH người đang đăng nhập — để giao diện khoá nút trung thực (I3).
   *  Server vẫn là nơi gác duy nhất; danh sách này chỉ dùng cho hiển thị. */
  permissions?: string[];
  scopes?: Array<{ scopeType: string; scopeId: string | null }>;
}

export type GoalStatus = "draft" | "active" | "at_risk" | "off_track" | "done" | "cancelled";

export interface GoalRow {
  id: string;
  nameVi: string;
  description?: string | null;
  period: string;
  ownerId: string;
  objectiveId?: string | null;
  orgUnitId?: string | null;
  weight?: string | number | null;
  healthScore?: string | number | null;
  status: GoalStatus;
  updatedAt: string;
}

export interface ObjectiveRow {
  id: string;
  kind: "okr" | "kgi";
  nameVi: string;
  period: string;
  parentId?: string | null;
  weight?: string | number | null;
  status: string;
}

export interface CheckinGoalUpdateRow {
  id: string;
  goalId: string;
  progressPct: string | number;
  note?: string | null;
}

export interface CheckinRow {
  id: string;
  personId: string;
  cadence: "weekly" | "monthly" | "quarterly" | "yearly";
  periodKey: string;
  progressNote?: string | null;
  blocker?: string | null;
  managerComment?: string | null;
  status: "open" | "submitted" | "reviewed";
  createdAt: string;
  goalUpdates?: CheckinGoalUpdateRow[];
}

export type ReviewStatus = "draft" | "self_done" | "manager_done" | "calibrated" | "final";

export interface ReviewRow {
  id: string;
  cycleId: string;
  revieweeId: string;
  scorecardId?: string | null;
  selfReflection?: string | null;
  managerAssessment?: string | null;
  proposedRating?: string | null;
  finalRating?: string | null;
  finalScore?: string | number | null;
  ipcGrade?: string | null;
  status: ReviewStatus;
  version: number;
  updatedAt: string;
}

export interface ReviewCycleRow {
  id: string;
  name: string;
  period: string;
  startDate?: string | null;
  endDate?: string | null;
  status: "planned" | "open" | "closed";
}

/** Điểm từng dòng scorecard — explainable: giữ formulaVersion + target đã dùng. */
export interface ReviewItemScoreRow {
  id: string;
  kpiId: string;
  actualValue?: string | number | null;
  targetValue?: string | number | null;
  achievedPct?: string | number | null;
  score?: string | number | null;
  weight?: string | number | null;
  formulaVersion?: number | null;
}

// ===== Trục B — Quản trị 3 tầng (Người dùng & Vai trò) =====
// Kiểu SUBSET những trường BE thực sự trả (whitelist select, J5) — thêm trường ở
// đây mà BE không trả sẽ lộ ngay lúc render, không âm thầm nhận dữ liệu thừa.

export interface AdminUserRow {
  personId: string;
  appUserId: string | null;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  orgUnitId?: string | null;
  managerId?: string | null;
  positionId?: string | null;
  status: string;
  version: number;
  /** [J5/Q4] CHỈ có khi caller giữ scope TENANT — org_admin không nhận trường này. */
  hireDate?: string | null;
  seniorityMonths?: number | null;
}

export interface AdminUserListResponse {
  entries: AdminUserRow[];
  nextCursor: string | null;
  capped: boolean;
}

export interface AdminRoleOption {
  code: string;
  nameVi?: string | null;
  nameEn?: string | null;
  permissions: string[];
}

export interface EffectiveAccessRole {
  userRoleId: string;
  roleCode: string;
  scopeType: string;
  scopeId?: string | null;
  grantedAt: string;
  grantedBy?: { id: string; email: string | null } | null;
}

export interface EffectiveAccessResponse {
  appUserId: string;
  email: string;
  permissions: string[];
  roles: EffectiveAccessRole[];
}

/** [Trục B L3] GET /org-units/:id/tree — cây tổ chức + đếm người + tên quản lý mỗi node. */
export interface OrgTreeNode extends OrgUnit {
  personCount: number;
  managerName?: string | null;
  children: OrgTreeNode[];
}
