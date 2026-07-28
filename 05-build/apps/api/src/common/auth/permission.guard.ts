import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { PERMISSION_KEY, PUBLIC_KEY, RequestUser } from './decorators';

/**
 * PermissionGuard — RBAC fail-closed:
 * - Endpoint KHÔNG khai báo @RequirePermission → từ chối (403). Không có đường "quên là mở".
 * - Load permission của user qua user_role → role_permission TRONG tenant context (RLS).
 *
 * [Trục B L1 — J8] Trước lát này, guard KHÔNG kiểm `app_user.status` — chỉ lọc `user_role`
 * đã soft-delete (F4). JWT ký sống 8 giờ; nếu "khoá tài khoản" chỉ đổi status trong DB mà
 * guard không đọc lại, token phát TRƯỚC khi khoá vẫn dùng được NGUYÊN VẸN cho tới khi hết
 * hạn — "khoá" chỉ là nhãn dán vô nghĩa trong 8 tiếng. Nay đọc `status` CÙNG một query với
 * role/permission (không tốn round-trip DB thêm) và chặn NGAY nếu khác `active` — 401 vì
 * đây là vấn đề DANH TÍNH không còn hợp lệ, không phải thiếu quyền trên một hành động cụ thể.
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

    const { status, permissions, scopes } = await this.prisma.withTenant(tenantId, async (tx) => {
      // [J8] status hiện tại của tài khoản — token có hợp lệ hay không phụ thuộc CÁI NÀY,
      // không phụ thuộc claim trong JWT (JWT không mang status, và không nên mang: đổi
      // status phải có hiệu lực NGAY, không đợi token cũ tự hết hạn rồi phát lại).
      const appUser = await tx.appUser.findFirst({
        where: { id: userId, deletedAt: null },
        select: { status: true },
      });
      const status = appUser?.status ?? null;

      // [F4] lọc cả role đã soft-delete — thu hồi role phải có hiệu lực ngay
      const roles = await tx.userRole.findMany({
        where: { appUserId: userId, deletedAt: null, role: { deletedAt: null } },
        select: { roleId: true, scopeType: true, scopeId: true },
      });
      if (roles.length === 0) return { status, permissions: new Set<string>(), scopes: [] as any[] };
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
      return { status, permissions, scopes };
    });

    // [J8] Tài khoản không tồn tại (đã xoá) hoặc status khác 'active' (disabled) → 401
    // NGAY, bất kể token còn hạn bao lâu. Fail-closed: không tìm thấy row cũng chặn.
    if (status !== 'active') {
      throw new UnauthorizedException('Tài khoản không còn hoạt động — đăng nhập lại');
    }

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
