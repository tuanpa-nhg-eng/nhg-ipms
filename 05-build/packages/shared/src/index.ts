/** @ipms/shared — types + hằng số dùng chung FE/BE/AI gateway. */

/** Permission catalog Phase 0 (đồng bộ với packages/db seed). */
export const PERMISSIONS = [
  'tenant:read',
  'org:read', 'org:write',
  'person:read', 'person:write',
  'user:read', 'user:write', 'role:assign',
  'audit:read',
  'flag:read', 'flag:write',
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
