/**
 * [F6] Scope enforcement — TDD §11: RBAC + scope (self/org_unit/tenant).
 * Quy tắc: lấy scope RỘNG NHẤT trong các role cấp permission:
 *   tenant > org_unit (scopeId = org_unit phụ trách; so khớp trực tiếp, subtree ở phase sau)
 *   > self (chỉ tài nguyên của chính mình).
 * [F33] Fail-closed TUYỆT ĐỐI: scopeType null/lạ → KHÔNG khớp gì (deny) — không còn
 * "null coi như tenant". DB đã NOT NULL DEFAULT 'self'.
 */
import { ForbiddenException } from '@nestjs/common';
import type { PermissionScope, RequestUser } from './decorators';

export interface ScopedResource {
  ownerPersonId?: string | null; // person sở hữu tài nguyên
  orgUnitId?: string | null;     // org unit của tài nguyên (hoặc của owner)
}

export function hasTenantScope(scopes: PermissionScope[]): boolean {
  return scopes.some((s) => s.scopeType === 'tenant'); // [F33] null KHÔNG còn là tenant
}

/** Mô tả scope hiệu dụng để service tự build where-filter danh sách (F32). */
export interface EffectiveScope {
  mode: 'tenant' | 'scoped';
  orgUnitIds: string[];       // org_unit user phụ trách (rỗng nếu không có)
  selfPersonId: string | null; // person id của chính user (nếu có scope self)
}

export function effectiveScope(user: RequestUser): EffectiveScope {
  if (hasTenantScope(user.scopes)) return { mode: 'tenant', orgUnitIds: [], selfPersonId: null };
  return {
    mode: 'scoped',
    orgUnitIds: user.scopes
      .filter((s) => s.scopeType === 'org_unit' && s.scopeId)
      .map((s) => s.scopeId!),
    selfPersonId: user.scopes.some((s) => s.scopeType === 'self')
      ? (user.claims.person_id ?? null)
      : null,
  };
}

/** Ném 403 nếu user không có scope phù hợp trên tài nguyên. */
export function assertScope(user: RequestUser, resource: ScopedResource, action: string): void {
  if (hasTenantScope(user.scopes)) return;

  const orgScopes = user.scopes.filter((s) => s.scopeType === 'org_unit' && s.scopeId);
  if (resource.orgUnitId && orgScopes.some((s) => s.scopeId === resource.orgUnitId)) return;

  const hasSelf = user.scopes.some((s) => s.scopeType === 'self');
  if (hasSelf && resource.ownerPersonId && resource.ownerPersonId === user.claims.person_id) return;

  throw new ForbiddenException(`Scope không cho phép ${action} trên tài nguyên này`);
}
