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

export async function devLogin(tenantCode: string, email: string): Promise<StudioSession> {
  const r = await apiFetch<{ access_token: string; tenant_id: string }>(null, "/auth/dev-token", {
    method: "POST",
    json: { tenantCode, email },
  });
  return { token: r.access_token, tenantId: r.tenant_id, tenantCode, email };
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
