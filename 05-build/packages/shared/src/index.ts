/** @ipms/shared — types + hằng số dùng chung FE/BE/AI gateway. */

/** Permission catalog Phase 0 (đồng bộ với packages/db seed). */
export const PERMISSIONS = [
  'tenant:read',
  'org:read', 'org:write',
  'person:read', 'person:write',
  'user:read', 'user:write', 'role:assign',
  'audit:read',
  'flag:read', 'flag:write',
  // Phase 1 — KPI & Scorecard
  'kpi:read', 'kpi:write', 'kpi:approve',
  'scorecard:read', 'scorecard:write',
  // Phase 1 — Strategy & Goal
  'strategy:read', 'strategy:write',
  'goal:read', 'goal:write',
  // Phase 1 — Evidence & Integration
  'evidence:read', 'evidence:write', 'evidence:verify',
  'integration:run',
  // Phase 2 — Check-in, Review, Calibration, Payroll
  'checkin:read', 'checkin:write', 'checkin:review',
  'review:read', 'review:write', 'review:manage', 'rating:approve',
  'calibration:run',
  'payroll:export',
  // Phase 3 — Configuration Studio
  'config:read', 'config:write', 'config:publish',
  'brand:write',
  'org:design',
  'derivation:run',
  'taskcell:read', 'taskcell:write',
  'process:design',
  'integration:connect', 'integration:bind',
  // Phase 3 lát 4a — ai-gateway + MCP + eval harness
  'ai:invoke', 'ai:eval',
  // Phase 3 lát 4f — BU Authoring Gate
  'taskcell:author', 'kpi:propose',
  'library:submit', 'library:curate', 'library:publish', 'library:deprecate',
  'library:import', 'library:import:canonical',
  // Phase 3 lát 4j–4k — Từ điển Tác vụ hoàn thiện (ủy quyền + vòng lặp tối ưu)
  'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
  // Go-live Từ điển Tác vụ — tra cứu canonical toàn hàng (read-only, mọi persona)
  'taskdict:read',
  // Phase 3 lát AI inline — gợi ý inline (chỉ đọc + đẻ ai_suggestion PENDING).
  // TÁCH khỏi ai:invoke (chat/MCP propose): inline nằm đúng chỗ author/curator/dept_head.
  'ai:assist',
  // [Learning Loop L1] Duyệt golden case từ tín hiệu học — TÁCH khỏi ai:eval (chạy eval)
  // và ai:assist (tạo tín hiệu): SoD trên THƯỚC ĐO — người chấp nhận gợi ý không tự
  // nạp case của mình vào golden set (bài học E2 red-team KPI Designer).
  'ai:eval:curate',
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

export type ScopeType = 'tenant' | 'org_unit' | 'self';

/** JWT claims chuẩn nội bộ — map sẵn theo Entra ID để cắm SSO sau. */
export interface IpmsJwtClaims {
  sub: string;          // app_user.id
  tid: string;          // tenant.id (Entra: tenant id — ở đây là iPMS tenant)
  oid?: string;         // Entra object id (khi có SSO)
  email: string;
  person_id?: string;
  iat?: number;
  exp?: number;
}

/** Error model chuẩn TDD §8.2 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
    trace_id?: string;
  };
}

export const ORG_LEVELS = ['group', 'bu', 'department', 'team'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

export const PERSON_STATUSES = ['active', 'leave', 'terminated'] as const;
