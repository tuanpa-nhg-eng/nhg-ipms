import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { PERMISSION_KEY, PUBLIC_KEY, RequestUser } from './decorators';

/**
 * PermissionGuard — RBAC fail-closed:
 * - Endpoint KHÔNG khai báo @RequirePermission → từ chối (403). Không có đường "quên là mở".
 * - Load permission của user qua user_role → role_permission TRONG tenant context (RLS).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    if (!required) throw new ForbiddenException('Endpoint has no permission declared (fail-closed)');

    const tenantId: string = req.ipmsTenantId;
    const userId: string = req.ipmsClaims.sub;

    const { permissions, scopes } = await this.prisma.withTenant(tenantId, async (tx) => {
      // [F4] lọc cả role đã soft-delete — thu hồi role phải có hiệu lực ngay
      const roles = await tx.userRole.findMany({
        where: { appUserId: userId, deletedAt: null, role: { deletedAt: null } },
        select: { roleId: true, scopeType: true, scopeId: true },
      });
      if (roles.length === 0) return { permissions: new Set<string>(), scopes: [] as any[] };
      const rp = await tx.rolePermission.findMany({
        where: { roleId: { in: roles.map((r) => r.roleId) } },
        select: { roleId: true, permission: { select: { code: true } } },
      });
      const permissions = new Set(rp.map((x) => x.permission.code));
      // [F6] scope của các role CẤP permission được yêu cầu
      const grantingRoleIds = new Set(
        rp.filter((x) => x.permission.code === required).map((x) => x.roleId),
      );
      const scopes = roles
        .filter((r) => grantingRoleIds.has(r.roleId))
        .map((r) => ({ scopeType: (r.scopeType as any) ?? null, scopeId: r.scopeId ?? null }));
      return { permissions, scopes };
    });

    if (!permissions.has(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    const user: RequestUser = { claims: req.ipmsClaims, tenantId, permissions, scopes };
    req.ipmsUser = user;
    // [Lát 4c] PolicyGuard (tầng ABAC đứng sau) cần biết permission đang yêu cầu
    req.ipmsRequiredPermission = required;
    return true;
  }
}
