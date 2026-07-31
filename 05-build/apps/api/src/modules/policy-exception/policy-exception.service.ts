import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EXCEPTION_GRANTABLE_PERMISSIONS, resolveExceptionTtlCap, EXCEPTION_MAX_TTL_HOURS,
} from '@ipms/shared';
import { uuidv7, type TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục C L3] NGOẠI LỆ CHÍNH SÁCH CÓ THỜI HẠN.
 *
 * Đường nới quyền HỢP LỆ duy nhất của hệ. Lý do nó tồn tại: mọi bất biến của trục này đúng
 * cho ngày thường và sai cho một ca sự cố lúc 2 giờ sáng — hệ không có đường nới hợp lệ thì
 * người ta nới bằng đường không hợp lệ (cấp vai thẳng trong DB, mượn tài khoản), và cả hai
 * đều không để lại vết đọc được.
 *
 * Bốn chốt, mỗi chốt ở đúng tầng của nó:
 *  · K4 trần thời hạn — service (trần cứng 72h ∩ cấu hình đơn vị, `resolveExceptionTtlCap`)
 *  · K4 không gia hạn — TRIGGER DB (`policy_exception_immutable` + `user_role_no_extend`);
 *    service không phải nơi giữ bất biến này vì một bản deploy sau có thể quên nó
 *  · K4 hết hạn là hết — `PermissionGuard` lọc `user_role.expires_at` tại cửa MỖI request;
 *    không có job nào nằm giữa "hết hạn" và "mất quyền"
 *  · K5 người xin ≠ người duyệt ≠ người nhận — service (xem `decide`)
 *
 * Quyền được nới lấy từ allowlist trong MÃ (`EXCEPTION_GRANTABLE_PERMISSIONS`): chỉ quyền
 * ĐỌC. Ngoại lệ không mở đường XUẤT (K3) và không mở quyền GHI — bất đối xứng về khả năng
 * hoàn tác, xem ghi chú ở @ipms/shared.
 */

/** Tiền tố vai tạm. Một vai cho mỗi permission, dùng lại — không đẻ vai theo từng đơn. */
const EXC_ROLE_PREFIX = 'exception:';

@Injectable()
export class PolicyExceptionService {
  constructor(private prisma: PrismaService) {}

  /** [J6] Từ chối vẫn để lại vết — audit ghi NGOÀI tx để sống sót rollback. */
  private async denied(user: RequestUser, rule: string, detail: object, ip?: string) {
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'policy.exception_denied', entityType: 'policy_exception', entityId: null,
          after: { rule, ...detail } as object, ip,
        },
      }),
    );
  }

  async request(
    user: RequestUser,
    input: { granteeUserId: string; permissionCode: string; scopeType?: string; scopeId?: string; reason: string; requestedHours: number },
    ip?: string,
  ) {
    const reason = input.reason.trim();

    // Allowlist quyền — kiểm TRƯỚC mọi thứ khác: một đơn xin `payroll:export` không nên tồn
    // tại trong DB dù ở trạng thái `pending`. Hàng `pending` là hàng chờ ai đó bấm duyệt.
    if (!(EXCEPTION_GRANTABLE_PERMISSIONS as readonly string[]).includes(input.permissionCode)) {
      await this.denied(user, 'K4: quyền không nằm trong allowlist ngoại lệ', {
        permission_code: input.permissionCode,
      }, ip);
      throw new UnprocessableEntityException(
        `Quyền '${input.permissionCode}' không nới được bằng ngoại lệ — ngoại lệ chỉ mở quyền ĐỌC, `
        + `không mở đường xuất (K3) và không mở quyền ghi. Danh sách: ${EXCEPTION_GRANTABLE_PERMISSIONS.join(', ')}`,
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cap = await this.ttlCap(tx, user.tenantId);
      if (!Number.isInteger(input.requestedHours) || input.requestedHours < 1 || input.requestedHours > cap) {
        throw new UnprocessableEntityException(
          `Thời hạn xin phải từ 1 đến ${cap} giờ (trần cứng ${EXCEPTION_MAX_TTL_HOURS}h, đơn vị hạ được, không nâng)`,
        );
      }
      const grantee = await tx.appUser.findFirst({ where: { id: input.granteeUserId, deletedAt: null } });
      if (!grantee) throw new NotFoundException('Người nhận không tồn tại');
      if (grantee.status !== 'active') {
        throw new UnprocessableEntityException('Không xin quyền tạm cho tài khoản đã bị khoá');
      }

      const id = uuidv7();
      await tx.policyException.create({
        data: {
          id, tenantId: user.tenantId,
          requesterUserId: user.claims.sub, granteeUserId: input.granteeUserId,
          permissionCode: input.permissionCode,
          scopeType: input.scopeType ?? 'tenant', scopeId: input.scopeId ?? null,
          reason,
          // `expiresAt` CHỦ ĐÍCH để trống: người xin ĐỀ NGHỊ thời hạn, người duyệt CHỐT nó.
          // Ghi sẵn ở đây rồi "duyệt nguyên trạng" là cách một trần bị người xin tự đặt.
          decisionNote: null,
          status: 'pending',
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'policy.exception_requested', entityType: 'policy_exception', entityId: id,
          after: {
            grantee_id: input.granteeUserId, permission_code: input.permissionCode,
            requested_hours: input.requestedHours, reason,
          } as object, ip,
        },
      });
      return {
        id, status: 'pending', requestedHours: input.requestedHours, ttlCapHours: cap,
      };
    });
  }

  /**
   * Duyệt / từ chối. K5 nằm ở đây và kiểm BA vế, không phải hai:
   *   · người duyệt ≠ người xin      — hiển nhiên
   *   · người duyệt ≠ người NHẬN     — thiếu vế này thì `data_steward` nhờ người khác đứng
   *     tên xin hộ rồi tự duyệt cho chính mình, K5 chỉ còn là một thủ tục giấy tờ
   *   · người xin ≠ người nhận thì KHÔNG cấm — xin hộ là ca dùng thật (trưởng nhóm hỗ trợ
   *     xin cho kỹ sư đang trực), và nó không tạo ra đường tự cấp nào vì vẫn cần người duyệt
   */
  async decide(
    user: RequestUser,
    id: string,
    input: { approve: boolean; hours?: number; note?: string },
    ip?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const exc = await tx.policyException.findFirst({ where: { id } });
      if (!exc) throw new NotFoundException('Đơn ngoại lệ không tồn tại');
      if (exc.status !== 'pending') {
        throw new ConflictException(`Đơn đã ở trạng thái '${exc.status}' — không quyết định lại`);
      }
      if (exc.requesterUserId === user.claims.sub) {
        await this.denied(user, 'K5: người xin không tự duyệt đơn của mình', { exception_id: id }, ip);
        throw new ForbiddenException('K5: người xin không tự duyệt đơn của mình');
      }
      if (exc.granteeUserId === user.claims.sub) {
        await this.denied(user, 'K5: người duyệt không tự cấp quyền cho chính mình', { exception_id: id }, ip);
        throw new ForbiddenException('K5: người duyệt không tự cấp quyền cho chính mình');
      }

      if (!input.approve) {
        await tx.policyException.update({
          where: { id },
          data: {
            status: 'rejected', approverUserId: user.claims.sub, decidedAt: new Date(),
            decisionNote: input.note ?? null, version: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId, actorUserId: user.claims.sub,
            action: 'policy.exception_rejected', entityType: 'policy_exception', entityId: id,
            after: { note: input.note ?? null } as object, ip,
          },
        });
        return { id, status: 'rejected' };
      }

      const cap = await this.ttlCap(tx, user.tenantId);
      const hours = input.hours ?? cap;
      if (!Number.isInteger(hours) || hours < 1 || hours > cap) {
        throw new UnprocessableEntityException(`Thời hạn duyệt phải từ 1 đến ${cap} giờ`);
      }
      const expiresAt = new Date(Date.now() + hours * 3600_000);

      // Materialize: vai TẠM mang đúng một quyền. Vai dùng lại giữa các đơn (một vai cho
      // mỗi permission) — đẻ vai theo từng đơn sẽ làm bảng `role` phình theo số lần sự cố.
      const roleId = await this.findExceptionRole(tx, user.tenantId, exc.permissionCode);
      await tx.userRole.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, appUserId: exc.granteeUserId, roleId,
          scopeType: exc.scopeType, scopeId: exc.scopeId,
          createdBy: user.claims.sub,
          expiresAt, policyExceptionId: id,
        },
      });
      await tx.policyException.update({
        where: { id },
        data: {
          status: 'approved', approverUserId: user.claims.sub, decidedAt: new Date(),
          expiresAt, decisionNote: input.note ?? null, version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'policy.exception_approved', entityType: 'policy_exception', entityId: id,
          after: {
            grantee_id: exc.granteeUserId, permission_code: exc.permissionCode,
            expires_at: expiresAt, hours, requester_id: exc.requesterUserId,
          } as object, ip,
        },
      });
      return { id, status: 'approved', expiresAt, hours };
    });
  }

  /**
   * Thu hồi SỚM một ngoại lệ đang hiệu lực. Ngược chiều với "gia hạn" (bị trigger cấm):
   * rút ngắn luôn được phép, và phải luôn được phép — không có nó thì một ngoại lệ cấp nhầm
   * chỉ còn cách chờ hết giờ.
   */
  async revoke(user: RequestUser, id: string, note?: string, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const exc = await tx.policyException.findFirst({ where: { id } });
      if (!exc) throw new NotFoundException('Đơn ngoại lệ không tồn tại');
      if (exc.status !== 'approved') {
        throw new ConflictException(`Chỉ thu hồi được đơn đang hiệu lực (đang '${exc.status}')`);
      }
      const now = new Date();
      // Soft-delete vai tạm: có hiệu lực NGAY qua PermissionGuard (F4 lọc deletedAt), không
      // đợi `expires_at`. Không UPDATE `expires_at` về quá khứ vì trigger `user_role_no_extend`
      // cho phép rút ngắn, nhưng soft-delete mới là cơ chế thu hồi đã có sẵn của hệ.
      await tx.userRole.updateMany({
        where: { policyExceptionId: id, deletedAt: null },
        data: { deletedAt: now, revokedBy: user.claims.sub, version: { increment: 1 } },
      });
      await tx.policyException.update({
        where: { id },
        data: { status: 'revoked', decidedAt: now, decisionNote: note ?? null, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'policy.exception_revoked', entityType: 'policy_exception', entityId: id,
          after: { note: note ?? null, grantee_id: exc.granteeUserId } as object, ip,
        },
      });
      return { id, status: 'revoked' };
    });
  }

  /**
   * Danh sách. Ai đọc được gì:
   *  · có `exception:approve` hoặc `audit:read` → thấy TẤT CẢ (người duyệt phải thấy hàng
   *    chờ; B0 phải rà được đơn mình không dính vào)
   *  · còn lại → chỉ đơn mình XIN hoặc mình NHẬN. Không phải để giấu, mà vì một người vận
   *    hành đọc được toàn bộ đơn của đơn vị là đọc được bản đồ "ai đang thiếu quyền gì" —
   *    thông tin trinh sát tốt hơn nhiều hệ thống nghĩ.
   */
  async list(user: RequestUser, status?: string) {
    const seesAll = user.permissions.has('exception:approve') || user.permissions.has('audit:read');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.policyException.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(seesAll ? {} : {
            OR: [{ requesterUserId: user.claims.sub }, { granteeUserId: user.claims.sub }],
          }),
        },
        orderBy: { requestedAt: 'desc' },
        take: 200,
      });
      const ids = [...new Set(rows.flatMap((r) => [r.requesterUserId, r.granteeUserId, r.approverUserId].filter(Boolean)))] as string[];
      const users = ids.length
        ? await tx.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
        : [];
      const emailOf = new Map(users.map((u) => [u.id, u.email]));
      const now = Date.now();
      return {
        entries: rows.map((r) => ({
          id: r.id,
          requester: { id: r.requesterUserId, email: emailOf.get(r.requesterUserId) ?? null },
          grantee: { id: r.granteeUserId, email: emailOf.get(r.granteeUserId) ?? null },
          approver: r.approverUserId
            ? { id: r.approverUserId, email: emailOf.get(r.approverUserId) ?? null } : null,
          permissionCode: r.permissionCode,
          scopeType: r.scopeType,
          scopeId: r.scopeId,
          reason: r.reason,
          requestedAt: r.requestedAt,
          expiresAt: r.expiresAt,
          decidedAt: r.decidedAt,
          decisionNote: r.decisionNote,
          usedCount: r.usedCount,
          lastUsedAt: r.lastUsedAt,
          // Trạng thái HIỂN THỊ suy ra tại chỗ đọc (khuôn `impersonation.list`): `approved`
          // đã quá hạn hiện là `expired` mà không cần job nào chạy. Cột `status` trong DB
          // vẫn là `approved` — và điều đó KHÔNG sai, vì cái thi hành quyền là `expires_at`
          // trên `user_role`, không phải chuỗi này.
          status: r.status === 'approved' && r.expiresAt && r.expiresAt.getTime() < now
            ? 'expired' : r.status,
        })),
        total: rows.length,
        seesAll,
      };
    });
  }

  /**
   * Job dọn — CHỈ dọn dẹp, KHÔNG phải cơ chế bảo vệ (§4 L3: "kiểm tại cửa mỗi request, không
   * tin job dọn"). Nếu job này không bao giờ chạy, quyền vẫn mất đúng giờ; nó chỉ đóng sổ các
   * đơn đã hết hạn để danh sách sạch và để L4 có mốc sinh cờ rủi ro.
   */
  async sweepExpired(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const stale = await tx.policyException.findMany({
        where: { status: 'approved', expiresAt: { lt: now } },
        select: { id: true },
      });
      for (const s of stale) {
        await tx.policyException.update({
          where: { id: s.id }, data: { status: 'expired', version: { increment: 1 } },
        });
      }
      const roles = await tx.userRole.updateMany({
        where: { policyExceptionId: { not: null }, deletedAt: null, expiresAt: { lt: now } },
        data: { deletedAt: now },
      });
      return { closed: stale.length, rolesCleaned: roles.count };
    });
  }

  /** Trần hiệu lực của đơn vị = min(72h, cấu hình đơn vị) — không bao giờ nâng được. */
  private async ttlCap(tx: TenantTx, tenantId: string): Promise<number> {
    const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return resolveExceptionTtlCap(settings['exceptionMaxTtlHours']);
  }

  /**
   * Vai tạm cho một permission — TRA CỨU, không tạo.
   *
   * [Tự bắt khi chạy thật] Bản đầu tạo vai lúc duyệt (`tx.role.create`) và ăn ngay
   * `permission denied for table role`: `ipms_app` KHÔNG có quyền INSERT vào `role` /
   * `role_permission`. Đó không phải thiếu sót cấu hình mà là một bất biến có từ Phase 0 —
   * tầng ứng dụng KHÔNG đúc ra vai và quyền, danh mục vai là việc của admin-plane (cùng họ
   * với [F1] "app chỉ ĐỌC feature_flag").
   *
   * Cách sửa SAI mà tôi đã loại: `GRANT INSERT ON role TO ipms_app`. Nó biến "một request
   * bất kỳ đúc được một vai mang quyền bất kỳ" thành chuyện có thể xảy ra — đắt hơn nhiều
   * lần cái tiện lợi đổi lấy, và mở đúng loại bề mặt mà cả trục này dựng lên để đóng.
   *
   * Cách chọn: seed dựng sẵn ĐÚNG một vai cho mỗi quyền trong `EXCEPTION_GRANTABLE_PERMISSIONS`
   * (tenant-scoped, xem `seed.ts`). Hệ quả phụ đáng giá: tập vai mà một ngoại lệ có thể cấp
   * bị chốt lúc seed, không phải lúc chạy — thiếu vai thì FAIL-CLOSED (422), không có đường
   * "tự tạo cho tiện".
   */
  private async findExceptionRole(tx: TenantTx, tenantId: string, permissionCode: string): Promise<string> {
    const code = `${EXC_ROLE_PREFIX}${permissionCode}`;
    const role = await tx.role.findFirst({ where: { tenantId, code, deletedAt: null } });
    if (!role) {
      throw new UnprocessableEntityException(
        `Chưa có vai tạm cho quyền '${permissionCode}' trong đơn vị này — chạy lại seed để dựng `
        + `(tầng ứng dụng cố ý KHÔNG tạo được vai).`,
      );
    }
    return role.id;
  }

  /**
   * [K4 — ghi vết mỗi lần DÙNG] Gọi từ `PermissionGuard` khi một request đi qua được nhờ một
   * vai tạm. Đếm + audit ở đây chứ không ở chỗ khác vì guard là nơi DUY NHẤT biết chắc quyền
   * đó đã thực sự được dùng (đơn được duyệt mà không ai gọi endpoint nào thì không phải "dùng").
   *
   * Cố ý KHÔNG ném lỗi ra ngoài: một lỗi khi ghi vết dùng ngoại lệ không nên biến một request
   * hợp lệ thành 500 — ngược với `ExportLogInterceptor` (ở đó không ghi được vết thì KHÔNG
   * được phép xuất, vì vết là điều kiện của hành động). Ở đây quyền đã hợp lệ trước khi ghi.
   */
  async recordUse(tenantId: string, exceptionIds: string[], actorUserId: string, route: string) {
    if (exceptionIds.length === 0) return;
    try {
      await this.prisma.withTenant(tenantId, async (tx) => {
        for (const id of exceptionIds) {
          await tx.policyException.updateMany({
            where: { id, status: 'approved' },
            data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              tenantId, actorUserId,
              action: 'policy.exception_used', entityType: 'policy_exception', entityId: id,
              after: { route } as object,
            },
          });
        }
      });
    } catch { /* xem ghi chú trên — không làm hỏng request hợp lệ */ }
  }
}
