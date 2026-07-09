import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { IpmsJwtClaims, PermissionCode } from '@ipms/shared';

export const PERMISSION_KEY = 'ipms:permission';
export const AUDIT_KEY = 'ipms:audit';
export const PUBLIC_KEY = 'ipms:public';

/** Endpoint yêu cầu permission (PermissionGuard enforce, fail-closed). */
export const RequirePermission = (code: PermissionCode) => SetMetadata(PERMISSION_KEY, code);

/** Mutation phát sinh audit_log (AuditInterceptor). */
export const Audited = (action: string) => SetMetadata(AUDIT_KEY, action);

/** Endpoint public (bỏ qua guard pipeline) — chỉ dùng cho /auth/dev-token & health. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const POLICY_EXEMPT_KEY = 'ipms:policy-exempt';

/**
 * [F68] VAN AN TOÀN — miễn trừ tầng PolicyGuard (ABAC), RBAC vẫn gác đầy đủ.
 * CHỈ dùng cho bề mặt quản trị chính access_policy (list/get/disable): nếu không,
 * một policy forbid config:publish tự khoá tenant vĩnh viễn (không ai disable được nữa,
 * chỉ còn đường owner/B3 sửa DB). KHÔNG miễn trừ create/update/activate/test.
 */
export const PolicyExempt = () => SetMetadata(POLICY_EXEMPT_KEY, true);

/** Scope mà user có cho permission đang yêu cầu (từ các role cấp permission đó). */
export interface PermissionScope {
  scopeType: 'tenant' | 'org_unit' | 'self' | null; // null = coi như tenant (role cũ)
  scopeId: string | null;
}

export interface RequestUser {
  claims: IpmsJwtClaims;
  tenantId: string;
  permissions: Set<string>;
  /** [F6] scopes của các role cấp permission được yêu cầu ở endpoint hiện tại. */
  scopes: PermissionScope[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser =>
    ctx.switchToHttp().getRequest().ipmsUser,
);
