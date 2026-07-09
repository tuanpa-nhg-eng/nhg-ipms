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

export interface CanvasLayoutData {
  kind: string;
  refId: string;
  nodes: Record<string, { x: number; y: number }>;
  edges: unknown[];
}
