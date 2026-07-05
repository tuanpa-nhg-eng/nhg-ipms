/**
 * [F6] Scope enforcement — TDD §11: RBAC + scope (self/org_unit/tenant).
 * Quy tắc: lấy scope RỘNG NHẤT trong các role cấp permission:
 *   tenant (hoặc null — role gán không khai scope, coi như tenant-wide, vd tenant_admin)
 *   > org_unit (scopeId = org_unit được phụ trách; Phase 2: so khớp trực tiếp, subtree ở phase sau)
 *   > self (chỉ tài nguyên của chính mình).
 * Fail-closed: không khớp scope nào → từ chối.
 */
import { ForbiddenException } from '@nestjs/common';
import type { PermissionScope, RequestUser } from './decorators';

export interface ScopedResource {
  ownerPersonId?: string | null; // person sở hữu tài nguyên
  orgUnitId?: string | null;     // org unit của tài nguyên (hoặc của owner)
}

export function hasTenantScope(scopes: PermissionScope[]): boolean {
  return scopes.some((s) => s.scopeType === 'tenant' || s.scopeType == null);
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
