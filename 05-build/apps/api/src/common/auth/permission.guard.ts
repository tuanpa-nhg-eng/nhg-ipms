import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { effectiveImpersonationPermissions } from '@ipms/shared';
import { PrismaService } from '../../prisma.service';
import { PolicyExceptionService } from '../../modules/policy-exception/policy-exception.service';
import { IMPERSONATION_EXIT_EXEMPT_KEY, PERMISSION_KEY, PUBLIC_KEY, RequestUser } from './decorators';

/**
 * [Trục C L3 — K4] Vai TẠM còn hiệu lực hay không được quyết ĐÚNG TẠI ĐÂY, mỗi request.
 *
 * Đây là chỗ bất biến "hết hạn là hết" thực sự sống. Cách làm sai hiển nhiên là để một job
 * nền quét và soft-delete các vai hết hạn: khi đó giữa mốc hết hạn và lần job chạy kế tiếp
 * là một khoảng thời gian quyền vẫn dùng được, và độ dài khoảng đó phụ thuộc vào việc job có
 * còn sống hay không — tức bất biến an ninh phụ thuộc vào sức khoẻ của một tiến trình nền.
 * Lọc ở cửa thì job dọn chỉ còn là dọn dẹp, hỏng cũng không mở ra quyền nào.
 */
const notExpired = () => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

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
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private exceptions: PolicyExceptionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();

    // [Trục B L4] Van an toàn kết thúc phiên đóng vai — PHẢI luôn gọi được kể cả khi J11
    // đã tước sạch quyền ghi. Bỏ qua HOÀN TOÀN bước kiểm permission bên dưới; chỉ đòi JWT
    // hợp lệ (JwtGuard đã chạy trước) + đang thực sự trong một phiên (`imp_sid`) — không
    // phụ thuộc còn giữ quyền gì. Không tốn round-trip DB (không cần biết permissions/scopes
    // để kết thúc phiên của chính mình).
    if (this.reflector.getAllAndOverride<boolean>(IMPERSONATION_EXIT_EXEMPT_KEY, [ctx.getHandler(), ctx.getClass()])) {
      if (!req.ipmsClaims?.imp_sid) {
        throw new ForbiddenException('Không đang trong phiên đóng vai');
      }
      const user: RequestUser = {
        claims: req.ipmsClaims, tenantId: req.ipmsTenantId, permissions: new Set(), scopes: [],
      };
      req.ipmsUser = user;
      return true;
    }

    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) throw new ForbiddenException('Endpoint has no permission declared (fail-closed)');

    const tenantId: string = req.ipmsTenantId;
    const userId: string = req.ipmsClaims.sub;
    const impSid: string | undefined = req.ipmsClaims.imp_sid;

    const { status, sessionLive, permissions, scopes, usedExceptionIds } = await this.prisma.withTenant(tenantId, async (tx) => {
      // [J8] status hiện tại của tài khoản — token có hợp lệ hay không phụ thuộc CÁI NÀY,
      // không phụ thuộc claim trong JWT (JWT không mang status, và không nên mang: đổi
      // status phải có hiệu lực NGAY, không đợi token cũ tự hết hạn rồi phát lại).
      const appUser = await tx.appUser.findFirst({
        where: { id: userId, deletedAt: null },
        select: { status: true },
      });
      const status = appUser?.status ?? null;

      // [Trục B L4 — Tự bắt] Kết thúc phiên (DELETE /admin/impersonation/current) chỉ đổi
      // MỘT DÒNG trong DB — nếu guard không đọc lại, JWT vẫn hợp lệ về mặt chữ ký/exp cho
      // tới hết 30 phút, tức "Thoát" chỉ là trang trí UI chứ không thực sự chặn được token
      // cũ. Đọc lại `endedAt` mỗi request (như J8 đọc lại status) để nút Thoát có tác dụng
      // NGAY, không đợi TTL tự nhiên.
      const sessionLive = impSid
        ? (await tx.impersonationSession.findFirst({
            where: { id: impSid, endedAt: null }, select: { id: true },
          })) !== null
        : true;

      // [F4] lọc cả role đã soft-delete — thu hồi role phải có hiệu lực ngay
      // [Trục C L3 — K4] …và lọc cả vai TẠM đã hết hạn, xem ghi chú ở `notExpired`.
      const roles = await tx.userRole.findMany({
        where: { appUserId: userId, deletedAt: null, role: { deletedAt: null }, ...notExpired() },
        select: { roleId: true, scopeType: true, scopeId: true, policyExceptionId: true },
      });
      if (roles.length === 0) {
        return {
          status, sessionLive, permissions: new Set<string>(), scopes: [] as any[],
          usedExceptionIds: [] as string[],
        };
      }
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
      // [Trục C L3] Quyền này có đang đi bằng một NGOẠI LỆ không? Chỉ tính vai cấp ĐÚNG
      // permission đang được yêu cầu — người giữ một ngoại lệ `exportlog:read` mà gọi
      // `GET /goals` (quyền vai thường) thì đó không phải một lần "dùng ngoại lệ".
      const usedExceptionIds = roles
        .filter((r) => grantingRoleIds.has(r.roleId) && r.policyExceptionId)
        .map((r) => r.policyExceptionId!);
      return { status, sessionLive, permissions, scopes, usedExceptionIds };
    });

    // [J8] Tài khoản không tồn tại (đã xoá) hoặc status khác 'active' (disabled) → 401
    // NGAY, bất kể token còn hạn bao lâu. Fail-closed: không tìm thấy row cũng chặn. Khi
    // `sub` là TARGET của một phiên đóng vai, đây cũng là nơi tự động vô hiệu hoá phiên nếu
    // target bị khoá GIỮA CHỪNG — không cần job nền riêng (status luôn đọc lại mỗi request).
    if (status !== 'active') {
      throw new UnauthorizedException('Tài khoản không còn hoạt động — đăng nhập lại');
    }
    if (!sessionLive) {
      throw new UnauthorizedException('Phiên đóng vai đã kết thúc — đăng nhập lại');
    }

    // [Trục B L4 — J11] Đang đóng vai (`act` có mặt) → giao đúng GIAO CỦA quyền target thật
    // sự giữ với whitelist chỉ-đọc. KHÔNG dùng blacklist (loại trừ permission có hậu tố ghi)
    // — dùng whitelist TƯỜNG MINH nghĩa là quyền target giữ mà admin quên liệt kê vào
    // whitelist thì mặc định BỊ LOẠI, không phải mặc định lọt qua. Đây là chỗ enforce DUY
    // NHẤT của bất biến J11 — không có đường vòng nào khác chạm được RequestUser.permissions.
    //
    // [Trục C L2b] Phép cắt này giờ nằm ở `effectiveImpersonationPermissions` (@ipms/shared)
    // — CÙNG hàm mà `ImpersonationService` dùng để quyết cho mở phiên hay không (J12①). Hai
    // nơi phải tính GIỐNG HỆT: chỗ quyết định "actor nhận được gì" và chỗ thật sự giao thứ
    // đó phải là một, không phải hai bản sao trông giống nhau.
    const effectivePermissions = req.ipmsClaims.act
      ? effectiveImpersonationPermissions(permissions)
      : permissions;

    if (!effectivePermissions.has(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    // [Trục C L3 — K4] Ghi vết SAU khi đã cho qua, và chỉ khi quyền thực sự đi bằng ngoại lệ.
    // Trong phiên đóng vai thì bỏ qua: quyền hữu hiệu lúc đó do whitelist J11 quyết, và một
    // dòng "đã dùng ngoại lệ" mang tên người BỊ đóng vai sẽ là vết sai người (bài học F188).
    if (usedExceptionIds.length > 0 && !req.ipmsClaims.act) {
      await this.exceptions.recordUse(
        tenantId, usedExceptionIds, userId, `${req.method} ${req.route?.path ?? req.url}`,
      );
    }

    const user: RequestUser = { claims: req.ipmsClaims, tenantId, permissions: effectivePermissions, scopes };
    req.ipmsUser = user;
    // [Lát 4c] PolicyGuard (tầng ABAC đứng sau) cần biết permission đang yêu cầu
    req.ipmsRequiredPermission = required;
    return true;
  }
}
