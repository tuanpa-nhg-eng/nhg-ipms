import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { uuidv7, type TenantTx } from '@ipms/db';
import { impersonationEscalation } from '@ipms/shared';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { getJwtSecret } from '../../common/auth/jwt.guard';
import { hasTenantScope } from '../../common/auth/scope.util';

/**
 * [Trục B L4] Impersonation CHỈ ĐỌC có kiểm soát — "cho phép NHÌN THẤY cái người dùng
 * thấy, không cho phép LÀM thay họ". Enforce chỉ-đọc nằm ở `PermissionGuard` (J11);
 * service này CHỈ lo: ai được phép mở phiên với ai (J12, 4 lớp) + vòng đời phiên (J13).
 *
 * 5 lớp J12 (đúng thứ tự, trong transaction — không có race window):
 *  ① không đóng vai người giữ quyền mà CHÍNH NGƯỜI GỌI không có (không leo thang, dù chỉ
 *     đọc — người đó vẫn KHÔNG được "mượn tầm nhìn" của người quyền lực hơn mình).
 *     [Trục C L2b] So theo QUYỀN HỮU HIỆU của phiên (= quyền target ∩ whitelist chỉ-đọc),
 *     không theo toàn bộ quyền target — xem `impersonationEscalation` ở @ipms/shared để
 *     biết vì sao bản đầu làm chết chính tính năng này.
 *  ② không đóng vai người giữ `audit:read` (J3 mở rộng: không có đường vòng đọc vết qua
 *     việc đóng vai một auditor). Luật RIÊNG, không suy ra được từ ①: `audit:read` không
 *     nằm trong whitelist nên ① không bao giờ nhìn thấy nó.
 *  ③ không tự đóng vai chính mình
 *  ④ không đóng vai lồng nhau (token đang đóng vai không mở được phiên MỚI) — trong thực
 *     tế đã bị PermissionGuard J11 chặn TRƯỚC vì `user:impersonate` không nằm trong
 *     read-whitelist, nhưng vẫn kiểm ở đây làm phòng tuyến thứ hai (bug ở tầng guard trong
 *     tương lai không được để hở đường leo thang này).
 *  ⑤ [Trục C L2b] người mở phiên phải giữ `user:impersonate` ở SCOPE TENANT.
 *     Lỗ tự bắt khi dựng vai `support`: J12 chỉ so MÃ QUYỀN, hoàn toàn không xét scope —
 *     trong khi phiên đóng vai giao cho actor đúng SCOPE CỦA TARGET (guard tính scope từ
 *     `user_role` của target). Nghĩa là một người giữ `user:impersonate` scope org_unit,
 *     đóng vai một người scope tenant, sẽ đọc được TOÀN đơn vị — leo thang theo chiều phạm
 *     vi, không theo chiều mã quyền, nên ① không thấy. Hôm nay chưa khai thác được (chỉ
 *     `tenant_admin`/`support` giữ quyền này, đều scope tenant), nhưng "chưa ai cấp sai"
 *     không phải một cơ chế bảo vệ — cấp sai chỉ là một lần bấm ở màn Người dùng & Vai trò.
 */
const READ_ONLY_TTL_MS = 30 * 60 * 1000; // [J13] TTL cứng — KHÔNG cấu hình được qua env
const MIN_REASON_LEN = 20;

class ImpersonationViolationError extends Error {
  constructor(public rule: string, public detail: object) {
    super('impersonation_violation');
  }
}

@Injectable()
export class ImpersonationService {
  constructor(private prisma: PrismaService) {}

  /** [J6] Wrapper — từ chối vẫn để lại vết audit (ghi ngoài tx, chuẩn F48/F117). */
  async start(user: RequestUser, input: { targetUserId: string; reason: string }, ip?: string) {
    try {
      return await this.doStart(user, input);
    } catch (e) {
      if (e instanceof ImpersonationViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'admin.impersonation_denied', entityType: 'impersonation_session', entityId: null,
              after: { rule: e.rule, ...e.detail } as object, ip,
            },
          }),
        );
        throw new ForbiddenException(e.rule);
      }
      throw e;
    }
  }

  private doStart(user: RequestUser, input: { targetUserId: string; reason: string }) {
    const reason = input.reason.trim();
    if (reason.length < MIN_REASON_LEN) {
      throw new UnprocessableEntityException(`Lý do phải có ít nhất ${MIN_REASON_LEN} ký tự — "test" không phải lý do`);
    }
    // (③) không tự đóng vai chính mình — kiểm sớm, không tốn query
    if (input.targetUserId === user.claims.sub) {
      throw new ImpersonationViolationError('Không tự đóng vai chính mình (J12③)', {});
    }
    // (④) phòng tuyến thứ hai — xem ghi chú đầu file
    if (user.claims.act) {
      throw new ImpersonationViolationError('Đang trong phiên đóng vai — không mở phiên lồng nhau (J12④)', {});
    }
    // (⑤) [Trục C L2b] scope của quyền `user:impersonate` phải là TENANT — `user.scopes` là
    // scope của đúng các vai CẤP quyền đang được yêu cầu (PermissionGuard, F6), nên phép kiểm
    // này nói về quyền đóng vai chứ không về scope chung chung của người gọi.
    if (!hasTenantScope(user.scopes)) {
      throw new ImpersonationViolationError(
        'Quyền đóng vai chỉ có nghĩa ở phạm vi TENANT — vai của bạn cấp nó ở phạm vi hẹp hơn (J12⑤)',
        { scopes: user.scopes.map((s) => s.scopeType) },
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const target = await tx.appUser.findFirst({ where: { id: input.targetUserId, deletedAt: null } });
      if (!target) throw new NotFoundException('Người dùng không tồn tại');
      if (target.status !== 'active') {
        throw new UnprocessableEntityException('Không đóng vai người đã bị khoá tài khoản');
      }

      const roles = await tx.userRole.findMany({
        where: { appUserId: target.id, deletedAt: null, role: { deletedAt: null } },
        select: { roleId: true },
      });
      const targetPerms = new Set<string>();
      if (roles.length > 0) {
        const rp = await tx.rolePermission.findMany({
          where: { roleId: { in: roles.map((r) => r.roleId) } },
          select: { permission: { select: { code: true } } },
        });
        for (const x of rp) targetPerms.add(x.permission.code);
      }

      // (②) không đóng vai người giữ audit:read
      if (targetPerms.has('audit:read')) {
        throw new ImpersonationViolationError(
          'Không đóng vai người giữ audit:read (J12②)', { target_id: input.targetUserId },
        );
      }
      // (①) không nhận được qua phiên thứ quyền mình không có — so theo QUYỀN HỮU HIỆU
      const notOwned = impersonationEscalation(user.permissions, targetPerms);
      if (notOwned.length > 0) {
        throw new ImpersonationViolationError(
          `Không đóng vai được — phiên này sẽ cho bạn quyền đọc bạn không có: ${notOwned.join(', ')} (J12①)`,
          { target_id: input.targetUserId, missing: notOwned },
        );
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + READ_ONLY_TTL_MS);
      const sessionId = uuidv7();
      await tx.impersonationSession.create({
        data: {
          id: sessionId, tenantId: user.tenantId,
          actorUserId: user.claims.sub, targetUserId: target.id,
          reason, startedAt: now, expiresAt, tokenJti: sessionId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.impersonation_started', entityType: 'impersonation_session', entityId: sessionId,
          after: { target_id: target.id, target_email: target.email, reason, expires_at: expiresAt } as object,
        },
      });

      // [J13] danh tính kép: sub = TARGET (quyền/scope tính theo người này) ⟂ act = actor thật.
      // exp ≤30 phút CỨNG — không đọc từ config, không gia hạn được (ký lại = phiên mới).
      const claims = {
        sub: target.id, tid: user.tenantId, email: target.email,
        person_id: target.personId ?? undefined,
        act: user.claims.sub, imp_sid: sessionId,
      };
      const token = jwt.sign(claims, getJwtSecret(), {
        expiresIn: Math.floor(READ_ONLY_TTL_MS / 1000), jwtid: sessionId,
      });
      return { token, expiresAt, targetEmail: target.email, sessionId };
    });
  }

  /**
   * Kết thúc phiên CỦA CHÍNH TOKEN ĐANG GỌI (xác định qua `imp_sid`, không nhận
   * targetUserId từ client) — luôn gọi được, PermissionGuard đã miễn trừ permission-check
   * cho endpoint này (xem `ImpersonationExitExempt`).
   */
  end(user: RequestUser, ip?: string) {
    const sid = user.claims.imp_sid;
    if (!sid) throw new ForbiddenException('Không đang trong phiên đóng vai');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const count = await tx.impersonationSession.updateMany({
        where: { id: sid, endedAt: null },
        data: { endedAt: new Date(), endedReason: 'manual' },
      });
      if (count.count === 1) {
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId, actorUserId: user.claims.act ?? user.claims.sub,
            action: 'admin.impersonation_ended', entityType: 'impersonation_session', entityId: sid,
            after: { ended_reason: 'manual', target_id: user.claims.sub } as object, ip,
          },
        });
      }
      return { ended: true };
    });
  }

  /** Nhật ký phiên — permission audit:read (tenant_admin KHÔNG có, J3 áp lại cho impersonation). */
  async list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.impersonationSession.findMany({
        orderBy: { startedAt: 'desc' },
        take: 200,
      });
      const userIds = [...new Set(rows.flatMap((r) => [r.actorUserId, r.targetUserId]))];
      const users = userIds.length
        ? await tx.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
        : [];
      const emailOf = new Map(users.map((u) => [u.id, u.email]));
      const now = Date.now();
      return rows.map((r) => ({
        id: r.id,
        actor: { id: r.actorUserId, email: emailOf.get(r.actorUserId) ?? null },
        target: { id: r.targetUserId, email: emailOf.get(r.targetUserId) ?? null },
        reason: r.reason,
        startedAt: r.startedAt,
        expiresAt: r.expiresAt,
        endedAt: r.endedAt,
        endedReason: r.endedReason,
        // trạng thái HIỂN THỊ suy ra tại chỗ đọc — không cần job nền cập nhật cột riêng
        status: r.endedAt ? 'ended' : r.expiresAt.getTime() < now ? 'expired' : 'active',
      }));
    });
  }

  /**
   * [J13] "Ai đã đóng vai tôi". Nhận `tx` trực tiếp — gọi từ BÊN TRONG transaction của
   * `MeService.access()` (không mở `withTenant` lồng: nếu mở transaction MỚI ở đây, đó là
   * kết nối pool RIÊNG, tuy không sai logic (chỉ đọc, không có vấn đề đọc-lại-sau-ghi như
   * bug đã tự bắt ở `updateNotifications()`) nhưng tốn round-trip vô ích cho MỌI lượt gọi
   * `/me/access` — chỗ này chắc chắn luôn đi kèm một `withTenant` khác đang mở sẵn.
   */
  async impersonatedByMeTx(tx: TenantTx, targetUserId: string) {
    const rows = await tx.impersonationSession.findMany({
      where: { targetUserId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const actorIds = [...new Set(rows.map((r) => r.actorUserId))];
    const actors = actorIds.length
      ? await tx.appUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
      : [];
    const emailOf = new Map(actors.map((a) => [a.id, a.email]));
    return rows.map((r) => ({
      actorEmail: emailOf.get(r.actorUserId) ?? null,
      reason: r.reason,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    }));
  }
}
