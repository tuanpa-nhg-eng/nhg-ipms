import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { effectiveScope } from '../../common/auth/scope.util';
import { activeUserRoleWhere } from '../../common/auth/user-role.where';

/**
 * [Lát 4j] Ủy quyền phân cấp (Spec Task Dictionary §3.A + §4.4 + §5):
 * trưởng phòng (dept_head, permission taskcell:delegate scope org_unit) cấp/thu
 * quyền soạn tác vụ cho nhân viên TRONG phòng mình.
 *
 * LEAST-PRIVILEGE ENFORCE TRONG CODE (chuẩn F55 — không tin client):
 * 1. capability allowlist CỐ ĐỊNH = ['taskcell:author'] — không thể cấp quyền
 *    duyệt/publish/delegate (không leo thang, kể cả admin gọi API này).
 * 2. orgUnitId phải thuộc scope org_unit của granter (tenant-scope thì tự do trong tenant).
 * 3. grantee phải là app_user active có person thuộc ĐÚNG org_unit đó (cùng phòng).
 * 4. không tự cấp cho chính mình (SoD chủ động — dept_head giữ taskcell:approve,
 *    tự cấp author sẽ vừa soạn vừa duyệt).
 * Hiệu lực RBAC materialize qua user_role(staff_author, scope org_unit) CÙNG transaction;
 * revoke soft-delete đúng user_role đã cấp (authoring_grant.user_role_id).
 */
const CAPABILITY_ALLOWLIST = ['taskcell:author'] as const;

/** [F117] Marker vi phạm bị chặn — audit incident ghi NGOÀI tx (chuẩn F48). */
class GrantViolationError extends Error {
  constructor(public rule: string, public detail: object, public http: 'conflict' | 'unprocessable') {
    super('grant_violation');
  }
}

@Injectable()
export class AuthoringService {
  constructor(private prisma: PrismaService) {}

  /** orgUnitId bắt buộc thuộc scope của granter — fail-closed. */
  private assertGranterScope(user: RequestUser, orgUnitId: string) {
    const scope = effectiveScope(user);
    if (scope.mode === 'tenant') return;
    if (!scope.orgUnitIds.includes(orgUnitId)) {
      throw new ForbiddenException('Chỉ được ủy quyền trong org_unit thuộc scope của bạn (trưởng phòng chỉ cấp trong phòng mình)');
    }
  }

  list(user: RequestUser, orgUnitId?: string, status?: string) {
    const scope = effectiveScope(user);
    // [F115] param tường minh KHÔNG được vượt scope — dept_head không soi phòng khác
    if (orgUnitId && scope.mode === 'scoped' && !scope.orgUnitIds.includes(orgUnitId)) {
      throw new ForbiddenException('orgUnitId ngoài scope của bạn');
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.authoringGrant.findMany({
        where: {
          ...(orgUnitId
            ? { orgUnitId }
            // scoped granter không khai orgUnitId → chỉ thấy các phòng của mình (fail-closed)
            : scope.mode === 'scoped' ? { orgUnitId: { in: scope.orgUnitIds } } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { grantedAt: 'desc' },
      }),
    );
  }

  /** [F117] Wrapper — vi phạm bị chặn vẫn để lại vết audit (ghi ngoài tx, chuẩn F48). */
  async grant(user: RequestUser, input: { granteeId: string; orgUnitId: string; capability?: string }, ip?: string) {
    try {
      return await this.doGrant(user, input);
    } catch (e) {
      if (e instanceof GrantViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'authoring.grant_denied', entityType: 'authoring_grant', entityId: null,
              after: { rule: e.rule, ...e.detail } as object, ip,
            },
          }),
        );
        if (e.http === 'conflict') throw new ConflictException(e.rule);
        throw new UnprocessableEntityException(e.rule);
      }
      throw e;
    }
  }

  private doGrant(user: RequestUser, input: { granteeId: string; orgUnitId: string; capability?: string }) {
    const capability = input.capability ?? 'taskcell:author';
    // (1) allowlist trong CODE — chặn leo thang trước mọi thứ khác (F55)
    if (!(CAPABILITY_ALLOWLIST as readonly string[]).includes(capability)) {
      throw new GrantViolationError(
        `capability '${capability}' không được phép ủy quyền — allowlist: ${CAPABILITY_ALLOWLIST.join(', ')} (không cấp được quyền duyệt/publish/delegate)`,
        { attempted_capability: capability, grantee_id: input.granteeId },
        'unprocessable',
      );
    }
    // (2) phạm vi granter
    this.assertGranterScope(user, input.orgUnitId);
    // (4) không tự cấp cho mình
    if (input.granteeId === user.claims.sub) {
      throw new GrantViolationError(
        'SoD: không tự cấp quyền soạn cho chính mình (trưởng phòng giữ quyền duyệt)',
        { grantee_id: input.granteeId, self_grant: true },
        'conflict',
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const orgUnit = await tx.orgUnit.findFirst({
        where: { id: input.orgUnitId, deletedAt: null },
      });
      if (!orgUnit) throw new NotFoundException('org_unit không tồn tại');

      // (3) grantee active + person thuộc đúng phòng (RLS đã chặn cross-tenant)
      const grantee = await tx.appUser.findFirst({
        where: { id: input.granteeId, status: 'active', deletedAt: null },
        include: { person: { select: { orgUnitId: true } } },
      });
      if (!grantee) throw new NotFoundException('Người nhận không tồn tại hoặc không active');
      if (grantee.person?.orgUnitId !== input.orgUnitId) {
        throw new UnprocessableEntityException('Người nhận không thuộc org_unit này — chỉ ủy quyền cho nhân viên TRONG phòng');
      }

      // [F116] SoD chặn TẠI NGUỒN (không đợi 4k detect muộn): không cấp capability
      // cho người đang giữ permission xung đột theo sod_rule (vd taskcell:approve —
      // vừa soạn vừa duyệt). Check trong tx (chuẩn F48).
      const sodRules = await tx.sodRule.findMany({
        where: {
          deletedAt: null,
          OR: [{ permissionA: capability }, { permissionB: capability }],
        },
      });
      if (sodRules.length > 0) {
        const granteeRoles = await tx.userRole.findMany({
          where: { appUserId: input.granteeId, ...activeUserRoleWhere() },
          select: { roleId: true },
        });
        const rps = granteeRoles.length > 0
          ? await tx.rolePermission.findMany({
              where: { roleId: { in: granteeRoles.map((r) => r.roleId) } },
              select: { permission: { select: { code: true } } },
            })
          : [];
        const granteePerms = new Set(rps.map((x) => x.permission.code));
        for (const rule of sodRules) {
          const other = rule.permissionA === capability ? rule.permissionB : rule.permissionA;
          if (granteePerms.has(other)) {
            throw new GrantViolationError(
              `SoD: người nhận đang giữ '${other}' — không cấp '${capability}' (rule ${rule.permissionA} ⟂ ${rule.permissionB})`,
              { grantee_id: input.granteeId, conflict_permission: other, severity: rule.severity },
              'conflict',
            );
          }
        }
      }

      const existing = await tx.authoringGrant.findFirst({
        where: {
          granteeId: input.granteeId, orgUnitId: input.orgUnitId,
          capability, status: 'active',
        },
      });
      if (existing) {
        throw new ConflictException('Đã có grant active cho người này trong phòng — thu hồi trước nếu muốn cấp lại');
      }

      // materialize hiệu lực RBAC: user_role(staff_author, scope org_unit) — CÙNG tx
      const staffRole = await tx.role.findFirst({
        where: { code: 'staff_author', tenantId: null, deletedAt: null },
      });
      if (!staffRole) {
        throw new UnprocessableEntityException("Role 'staff_author' chưa seed — chạy pnpm db:seed");
      }
      const userRole = await tx.userRole.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, appUserId: input.granteeId,
          roleId: staffRole.id, scopeType: 'org_unit', scopeId: input.orgUnitId,
        },
      });
      const grant = await tx.authoringGrant.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          granterId: user.claims.sub, granteeId: input.granteeId,
          orgUnitId: input.orgUnitId, capability,
          userRoleId: userRole.id,
        },
      });
      // audit tường minh trong tx (interceptor @Audited ghi thêm vết request)
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'authoring.grant', entityType: 'authoring_grant', entityId: grant.id,
          after: {
            grantee_id: input.granteeId, org_unit_id: input.orgUnitId,
            capability, user_role_id: userRole.id,
          } as object,
        },
      });
      return grant;
    });
  }

  revoke(user: RequestUser, grantId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const grant = await tx.authoringGrant.findFirst({ where: { id: grantId } });
      if (!grant) throw new NotFoundException('Grant không tồn tại');
      // thu hồi cũng chỉ trong phạm vi phòng của mình
      this.assertGranterScope(user, grant.orgUnitId);

      // conditional update chống race (chuẩn F28) — revoke đúng 1 lần
      const count = await tx.authoringGrant.updateMany({
        where: { id: grantId, status: 'active', version: grant.version },
        data: {
          status: 'revoked', revokedAt: new Date(), revokedBy: user.claims.sub,
          version: { increment: 1 },
        },
      });
      if (count.count !== 1) {
        throw new ConflictException('Grant đã revoked hoặc version lệch (reload)');
      }

      // thu hồi hiệu lực NGAY: soft-delete đúng user_role đã materialize
      if (grant.userRoleId) {
        await tx.userRole.updateMany({
          where: { id: grant.userRoleId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'authoring.revoke', entityType: 'authoring_grant', entityId: grantId,
          after: {
            grantee_id: grant.granteeId, org_unit_id: grant.orgUnitId,
            user_role_id: grant.userRoleId,
          } as object,
        },
      });
      return tx.authoringGrant.findFirst({ where: { id: grantId } });
    });
  }
}
