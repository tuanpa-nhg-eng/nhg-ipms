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

    const permissions = await this.prisma.withTenant(tenantId, async (tx) => {
      // [F4] lọc cả role đã soft-delete — thu hồi role phải có hiệu lực ngay
      const roles = await tx.userRole.findMany({
        where: { appUserId: userId, deletedAt: null, role: { deletedAt: null } },
        select: { roleId: true },
      });
      if (roles.length === 0) return new Set<string>();
      const rp = await tx.rolePermission.findMany({
        where: { roleId: { in: roles.map((r) => r.roleId) } },
        select: { permission: { select: { code: true } } },
      });
      return new Set(rp.map((x) => x.permission.code));
    });

    if (!permissions.has(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    const user: RequestUser = { claims: req.ipmsClaims, tenantId, permissions };
    req.ipmsUser = user;
    return true;
  }
}
