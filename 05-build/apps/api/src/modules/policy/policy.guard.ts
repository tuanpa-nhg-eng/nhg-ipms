import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { POLICY_EXEMPT_KEY, PUBLIC_KEY, RequestUser } from '../../common/auth/decorators';
import { PolicyService } from './policy.service';
import { decideAccess } from './cedar.engine';

/**
 * PolicyGuard (#2) — tầng 4 pipeline (Spec §7): Jwt → Tenant → Permission(RBAC) → Policy(ABAC).
 * Chỉ chạy khi RBAC đã cho phép; đánh giá access_policy active (global + tenant, RLS lo
 * visibility) như GUARDRAIL: forbid khớp ⇒ 403 kèm audit `policy.denied` (explainable —
 * ghi rõ policy nào chặn); engine/policy lỗi eval ⇒ 403 fail-closed.
 * Không có policy active trong scope ⇒ cho qua (RBAC là quyết định nền).
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  private logger = new Logger('PolicyGuard');

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private policies: PolicyService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    // [F68] van an toàn chống tự khoá — chỉ bề mặt quản trị policy (list/get/disable),
    // RBAC (PermissionGuard) đã gác trước đó
    if (this.reflector.getAllAndOverride<boolean>(POLICY_EXEMPT_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    const user: RequestUser | undefined = req.ipmsUser;
    const required: string | undefined = req.ipmsRequiredPermission;
    // PermissionGuard đứng trước luôn set cả hai — thiếu nghĩa là pipeline bị lắp sai: deny
    if (!user || !required) {
      throw new ForbiddenException('Policy guard thiếu ngữ cảnh RBAC (fail-closed)');
    }

    const active = await this.policies.activeForAction(user.tenantId, required);
    if (active.length === 0) return true;

    const decision = decideAccess(active, {
      principalId: user.claims.sub,
      principalAttrs: {
        email: user.claims.email ?? '',
        permissions: [...user.permissions].sort(),
        scopeTypes: [...new Set(user.scopes.map((s) => s.scopeType ?? '').filter(Boolean))].sort(),
        personId: user.claims.person_id ?? '',
      },
      action: required,
      context: {
        permission: required,
        method: String(req.method ?? ''),
        path: String(req.path ?? req.url ?? ''),
      },
    });
    if (decision.decision === 'allow') return true;

    // Audit deny — best-effort (deny không được phụ thuộc audit thành công)
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'policy.denied', entityType: 'access_policy',
          after: {
            permission: required,
            denied_by: decision.deniedBy,
            errors: decision.errors.map((e) => ({ policy_id: e.policyId, message: e.message })),
          } as object,
          ip: req.ip,
        },
      }),
    ).catch((e) => this.logger.warn(`audit policy.denied lỗi: ${(e as Error).message}`));

    if (decision.errors.length > 0) {
      this.logger.warn(
        `policy eval error (fail-closed deny) tenant=${user.tenantId} action=${required}: ` +
        decision.errors.map((e) => `${e.policyId}: ${e.message}`).join(' | '),
      );
      throw new ForbiddenException('Access policy lỗi đánh giá — từ chối fail-closed (liên hệ quản trị)');
    }
    throw new ForbiddenException('Bị chặn bởi access policy của tổ chức');
  }
}
