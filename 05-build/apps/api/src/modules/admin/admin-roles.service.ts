import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { effectiveScope } from '../../common/auth/scope.util';

/**
 * [Trục B L1 — J1] Gán/thu hồi vai trò — đường leo thang quyền kinh điển. Bê nguyên khuôn
 * đã chứng minh ở lát 4j (`authoring.service.ts`, F55/F115/F116/F117): allowlist trong
 * CODE, scope người cấp, không tự cấp, SoD tại nguồn. KHÔNG phát minh lại — đây LÀ khuôn
 * đó, mở rộng từ một capability cố định ('taskcell:author') sang MỌI role trong catalog.
 *
 * 4 lớp (đúng thứ tự, đều chạy TRONG transaction — không có race window giữa các lớp):
 *  ① không cấp role chứa quyền mà CHÍNH NGƯỜI GỌI không có (không leo thang) — TRỪ
 *     `BASE_ROLE_ALLOWLIST`, xem ghi chú ngay dưới
 *  ② scope cấp ⊆ scope người cấp (org_admin chỉ cấp trong org_unit mình phụ trách),
 *     VÀ người NHẬN cũng phải trong scope đó (không chỉ scope của vai được cấp)
 *  ③ không tự cấp cho chính mình
 *  ④ không vi phạm sod_rule — vai mới không xung đột với quyền grantee ĐANG giữ
 * Mọi từ chối → audit `admin.role_grant_denied` NGOÀI tx (J6, sống sót rollback).
 *
 * [Tự bắt — mâu thuẫn giữa J1① và chính mục tiêu §1 của trục] L0 tước SẠCH quyền ghi
 * nghiệp vụ khỏi `tenant_admin` (J2 — đúng thiết kế). Áp J1① tuyệt đối, hệ quả là
 * `tenant_admin` — người DUY NHẤT dự kiến onboard nhân sự ở pilot H.01 — không giữ
 * `goal:write`/`checkin:write`/`evidence:write`/`review:write` nên KHÔNG gán được vai
 * `employee` (vai SÀN mọi nhân viên cần) cho chính người nó vừa tạo tài khoản. Mốc demo
 * §1 ("hết L3 onboard được người thật TỪ GIAO DIỆN — tạo hồ sơ → gán vai → đăng nhập →
 * thấy đúng khu vực") sẽ không đạt được nếu áp cứng.
 *
 * KHÔNG sửa bằng cách nới quyền cho tenant_admin (J3 cấm — "không nới quyền để UI chạy").
 * Sửa đúng khuôn đã có ở `authoring.service.ts` (`CAPABILITY_ALLOWLIST`): cho phép MỘT
 * ngoại lệ hẹp, tường minh trong CODE — vai SÀN `employee` được cấp được dù người cấp
 * không giữ đủ quyền của nó, vì bản thân việc cấp KHÔNG cho người cấp thêm quyền gì (chỉ
 * người NHẬN có quyền đó, trên chính tài nguyên của họ) — khác về bản chất với cấp một vai
 * quản trị/duyệt. `auditor` KHÔNG nằm trong allowlist (J3 phải giữ nguyên: không ai thiếu
 * `audit:read` cấp được `audit:read`); các vai khác không cần ngoại lệ vì hoặc granter đã
 * đủ quyền (vd `exec_viewer` ⊆ quyền đọc của tenant_admin) hoặc đúng ý là phải chặn.
 */
const BASE_ROLE_ALLOWLIST = ['employee'] as const;

/**
 * [Trục C L1] Ngoại lệ HẸP THỨ HAI của J1① — vai `export_officer` (chỉ mang
 * `export:confidential`) được `tenant_admin` gán dù chính nó KHÔNG giữ quyền đó.
 *
 * Vì sao cần: chủ dự án chốt 30/07 "quyền xuất dữ liệu `confidential` không nằm trong vai
 * nghiệp vụ nào — B1 cấp cho 1–2 người". Quyền chỉ tới người qua một vai, và J1① tuyệt đối
 * nghĩa là KHÔNG AI trong hệ gán được vai đó (tenant_admin không giữ `export:confidential`,
 * và cấp nó cho tenant_admin thì lại là gộp quyền vào bộ mặc định — đúng cái quyết định trên
 * loại bỏ). Kết quả sẽ là "cấp bằng sửa DB tay", tức không vết, không audit.
 *
 * Vì sao ngoại lệ này KHÔNG mở đường leo thang — ba chốt độc lập, mất một vẫn còn hai:
 *   ① `export:confidential` là quyền NÂNG TRẦN, không phải quyền hành động: tự nó không gọi
 *      được endpoint nào. Muốn xuất thật vẫn phải có quyền nghiệp vụ của đường xuất
 *      (`payroll:export` = hrbp) — thứ mà tenant_admin KHÔNG có và KHÔNG gán được (vai `hrbp`
 *      mang cả tá quyền ghi mà tenant_admin không giữ ⇒ J1① chặn như thường).
 *   ② J1③ chặn tự gán ⇒ tenant_admin không tự thành người xuất được.
 *   ③ Mọi lần gán/từ chối đều vào `audit_log` (`admin.role_grant` / `_denied`), và mọi lần
 *      xuất sau đó vào `export_log` — B0 rà được cả hai đầu.
 *
 * Khác BASE_ROLE_ALLOWLIST ở scope: vai sàn `employee` mang quyền GHI nên bị ép
 * `scopeType='self'` (bài học F184). `export:confidential` không gắn với bản ghi nào — nó là
 * trần của cả đường xuất — nên scope đúng nghĩa duy nhất là `tenant`, và ép đúng bằng
 * `tenant` (không để 'self'/'org_unit' lọt: chúng gợi ý một phạm vi không tồn tại trong
 * ExportGuard, tức nói dối người quản trị về điều họ vừa cấp).
 */
const DELEGABLE_ROLE_ALLOWLIST = ['export_officer'] as const;

class GrantViolationError extends Error {
  constructor(public rule: string, public detail: object, public http: 'conflict' | 'forbidden' | 'unprocessable') {
    super('role_grant_violation');
  }
}

export interface AssignRoleInput {
  granteeId: string;
  roleCode: string;
  scopeType: 'tenant' | 'org_unit' | 'self';
  scopeId?: string;
}

@Injectable()
export class AdminRolesService {
  constructor(private prisma: PrismaService) {}

  /**
   * [J1① + J4] Danh mục role được phép cấp BỞI CHÍNH NGƯỜI GỌI — không phải toàn catalog.
   * Cách làm cho UI không thể hiện lựa chọn sẽ bị API từ chối (J4): FE liệt kê đúng những
   * gì server trả, không tự đoán theo role code. `BASE_ROLE_ALLOWLIST` phải khớp CHÍNH XÁC
   * ngoại lệ trong `doAssign` — nếu không, liệt kê một lựa chọn mà lúc bấm lại bị 403.
   *
   * [F184] `selfOnly: true` cho vai sàn — FE PHẢI khoá scopeType='self' khi chọn vai này
   * (không cho đổi sang 'tenant'/'org_unit'), đúng khuôn ngoại lệ hẹp ở `doAssign`. Thiếu
   * cờ này, FE vẫn hiện đủ 3 lựa chọn scope cho vai sàn rồi API 403 ở 'tenant'/'org_unit'
   * — chính là J4 mà cờ này tồn tại để tránh.
   */
  list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const roles = await tx.role.findMany({
        where: { tenantId: null, deletedAt: null },
        include: { rolePermissions: { include: { permission: { select: { code: true } } } } },
        orderBy: { code: 'asc' },
      });
      return roles
        .map((r) => ({
          code: r.code, nameVi: r.nameVi, nameEn: r.nameEn,
          permissions: r.rolePermissions.map((rp) => rp.permission.code),
          selfOnly: (BASE_ROLE_ALLOWLIST as readonly string[]).includes(r.code),
          // [Trục C L1] Đối xứng với `selfOnly`: vai uỷ nhiệm chỉ có nghĩa ở scope TENANT.
          // FE phải khoá cứng lựa chọn scope — J4: không hiện thứ mà API sẽ từ chối.
          tenantOnly: (DELEGABLE_ROLE_ALLOWLIST as readonly string[]).includes(r.code),
        }))
        .filter((r) =>
          (BASE_ROLE_ALLOWLIST as readonly string[]).includes(r.code)
          || (DELEGABLE_ROLE_ALLOWLIST as readonly string[]).includes(r.code)
          || r.permissions.every((p) => user.permissions.has(p)));
    });
  }

  /** [J6] Wrapper — vi phạm bị chặn vẫn để lại vết audit (ghi ngoài tx, chuẩn F48/F117). */
  async assign(user: RequestUser, input: AssignRoleInput, ip?: string) {
    try {
      return await this.doAssign(user, input);
    } catch (e) {
      if (e instanceof GrantViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'admin.role_grant_denied', entityType: 'user_role', entityId: null,
              after: { rule: e.rule, ...e.detail } as object, ip,
            },
          }),
        );
        if (e.http === 'conflict') throw new ConflictException(e.rule);
        if (e.http === 'forbidden') throw new ForbiddenException(e.rule);
        throw new UnprocessableEntityException(e.rule);
      }
      throw e;
    }
  }

  private doAssign(user: RequestUser, input: AssignRoleInput) {
    // (③) không tự cấp cho chính mình — kiểm sớm, không tốn query
    if (input.granteeId === user.claims.sub) {
      throw new GrantViolationError(
        'Không tự gán vai cho chính mình (J1③)',
        { grantee_id: input.granteeId }, 'conflict',
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { code: input.roleCode, tenantId: null, deletedAt: null },
        include: { rolePermissions: { include: { permission: { select: { code: true } } } } },
      });
      if (!role) throw new NotFoundException(`Role '${input.roleCode}' không tồn tại`);
      const rolePerms = role.rolePermissions.map((rp) => rp.permission.code);

      // (①) không cấp quyền mình không có — TRỪ vai SÀN trong allowlist (xem ghi chú đầu
      // file): cấp vai đó không cho NGƯỜI CẤP thêm quyền gì, chỉ người NHẬN có quyền đó
      // trên chính tài nguyên của họ.
      //
      // [F184 — Reviewer đối kháng, MAJOR] Bản đầu KHÔNG ép `scopeType === 'self'` cho
      // ngoại lệ này — lý do biện minh ở comment trên ("chỉ tác động tài nguyên CỦA HỌ")
      // chỉ đúng khi scope là 'self'. Với scope='tenant', vai `employee` (goal:write/
      // checkin:write/review:write/evidence:write) áp lên MỌI người trong tenant — và
      // `assertScope` cho qua ngay khi có scope tenant, không xét chủ sở hữu tài nguyên
      // (scope.util.ts). Hệ quả: tenant_admin (không giữ MỘT quyền ghi nghiệp vụ nào sau
      // L0) gán `employee` scope='tenant' cho một tài khoản BẤT KỲ ⇒ tài khoản đó ghi được
      // dữ liệu của TOÀN TENANT — dựng lại đúng god-account mà cả trục B tồn tại để đập.
      const isBaseRole = (BASE_ROLE_ALLOWLIST as readonly string[]).includes(input.roleCode)
        && input.scopeType === 'self';
      // [Trục C L1] Ngoại lệ thứ hai — vai uỷ nhiệm trần xuất, ép scope='tenant' (xem ghi chú
      // ở DELEGABLE_ROLE_ALLOWLIST). Cùng khuôn "ngoại lệ hẹp + ép scope" của F184, không
      // phát minh cơ chế mới: sai scope thì KHÔNG được miễn trừ, rơi về J1① như mọi vai khác.
      const isDelegableRole = (DELEGABLE_ROLE_ALLOWLIST as readonly string[]).includes(input.roleCode)
        && input.scopeType === 'tenant';
      const notOwned = rolePerms.filter((p) => !user.permissions.has(p));
      if (!isBaseRole && !isDelegableRole && notOwned.length > 0) {
        throw new GrantViolationError(
          `Không cấp được vai '${input.roleCode}' — bạn không giữ: ${notOwned.join(', ')} (J1①)`
          + (BASE_ROLE_ALLOWLIST.includes(input.roleCode as any)
            ? ` — vai sàn chỉ được miễn trừ khi scopeType='self'`
            : '')
          + (DELEGABLE_ROLE_ALLOWLIST.includes(input.roleCode as any)
            ? ` — vai uỷ nhiệm chỉ được miễn trừ khi scopeType='tenant'`
            : ''),
          { role_code: input.roleCode, missing: notOwned, scope_type: input.scopeType }, 'forbidden',
        );
      }

      const grantee = await tx.appUser.findFirst({
        where: { id: input.granteeId, deletedAt: null },
        include: { person: { select: { orgUnitId: true } } },
      });
      if (!grantee) throw new NotFoundException('Người nhận không tồn tại');

      // (②) scope cấp ⊆ scope người cấp
      const granterScope = effectiveScope(user);
      if (granterScope.mode === 'scoped') {
        if (input.scopeType === 'tenant') {
          throw new GrantViolationError(
            'Bạn chỉ có scope org_unit — không cấp được vai phạm vi TENANT (J1②)',
            { requested_scope: input.scopeType }, 'forbidden',
          );
        }
        if (input.scopeType === 'org_unit') {
          if (!input.scopeId || !granterScope.orgUnitIds.includes(input.scopeId)) {
            throw new GrantViolationError(
              'org_unit ngoài phạm vi phụ trách của bạn (J1②)',
              { requested_scope_id: input.scopeId ?? null }, 'forbidden',
            );
          }
        }
        // [Tự bắt trước Reviewer] Không chỉ scopeType='org_unit' mới cần kiểm — một người
        // cấp scoped (org_admin) cấp scopeType='self' cho một người NGOÀI phòng mình vẫn là
        // vượt phạm vi: người cấp không có trách nhiệm quản trị người đó. J1② là kiểm SCOPE
        // CỦA VAI ĐƯỢC CẤP lẫn NGƯỜI ĐƯỢC CẤP — thiếu vế sau thì 'self'/'org_unit' đều lách
        // được ra ngoài phòng qua đường "chọn scopeType hẹp để né kiểm scopeId".
        if (!grantee.person?.orgUnitId || !granterScope.orgUnitIds.includes(grantee.person.orgUnitId)) {
          throw new GrantViolationError(
            'Người nhận ngoài phạm vi phụ trách của bạn — chỉ gán vai cho người TRONG đơn vị mình (J1②)',
            { grantee_id: input.granteeId }, 'forbidden',
          );
        }
      }
      if (input.scopeType === 'org_unit' && input.scopeId) {
        const org = await tx.orgUnit.findFirst({ where: { id: input.scopeId, deletedAt: null } });
        if (!org) throw new UnprocessableEntityException('org_unit của scope không tồn tại');
      }

      // (④) SoD tại nguồn — vai mới không xung đột quyền grantee ĐANG giữ (chuẩn F116)
      if (rolePerms.length > 0) {
        const sodRules = await tx.sodRule.findMany({
          where: {
            deletedAt: null,
            OR: [{ permissionA: { in: rolePerms } }, { permissionB: { in: rolePerms } }],
          },
        });
        if (sodRules.length > 0) {
          const granteeRoles = await tx.userRole.findMany({
            where: { appUserId: input.granteeId, deletedAt: null, role: { deletedAt: null } },
            select: { roleId: true },
          });
          const granteePerms = new Set<string>();
          if (granteeRoles.length > 0) {
            const rp = await tx.rolePermission.findMany({
              where: { roleId: { in: granteeRoles.map((r) => r.roleId) } },
              select: { permission: { select: { code: true } } },
            });
            for (const x of rp) granteePerms.add(x.permission.code);
          }
          for (const rule of sodRules) {
            const incomingSide = rolePerms.includes(rule.permissionA) ? rule.permissionA : rule.permissionB;
            const otherSide = incomingSide === rule.permissionA ? rule.permissionB : rule.permissionA;
            if (rolePerms.includes(incomingSide) && granteePerms.has(otherSide)) {
              throw new GrantViolationError(
                `SoD: người nhận đang giữ '${otherSide}' — vai '${input.roleCode}' mang '${incomingSide}' xung đột (rule ${rule.permissionA} ⟂ ${rule.permissionB})`,
                { grantee_id: input.granteeId, conflict_permission: otherSide, severity: rule.severity },
                'conflict',
              );
            }
          }
        }
      }

      const dup = await tx.userRole.findFirst({
        where: {
          appUserId: input.granteeId, roleId: role.id, deletedAt: null,
          scopeType: input.scopeType, scopeId: input.scopeId ?? null,
        },
      });
      if (dup) throw new ConflictException('Người này đã giữ đúng vai + phạm vi này');

      const created = await tx.userRole.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, appUserId: input.granteeId,
          roleId: role.id, scopeType: input.scopeType, scopeId: input.scopeId,
          createdBy: user.claims.sub,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.role_grant', entityType: 'user_role', entityId: created.id,
          after: {
            grantee_id: input.granteeId, role_code: input.roleCode,
            scope_type: input.scopeType, scope_id: input.scopeId ?? null,
          } as object,
        },
      });
      return created;
    });
  }

  /** Soft-delete user_role — hiệu lực NGAY qua PermissionGuard (đúng khuôn 4j). */
  revoke(user: RequestUser, userRoleId: string, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const ur = await tx.userRole.findFirst({ where: { id: userRoleId, deletedAt: null } });
      if (!ur) throw new NotFoundException('user_role không tồn tại');

      const granterScope = effectiveScope(user);
      if (granterScope.mode === 'scoped') {
        // [Đối xứng với assign() — J1②] Cho thu hồi vai scopeType='org_unit' NẰM TRONG
        // phòng mình, HOẶC vai scopeType='self'/khác của người TRONG phòng mình — không thì
        // gán được nhưng không revoke lại được (cấp thiếu-đối-xứng cũng là một lỗ).
        let inScope = ur.scopeType === 'org_unit' && !!ur.scopeId && granterScope.orgUnitIds.includes(ur.scopeId);
        if (!inScope) {
          const grantee = await tx.appUser.findFirst({
            where: { id: ur.appUserId }, include: { person: { select: { orgUnitId: true } } },
          });
          inScope = !!grantee?.person?.orgUnitId && granterScope.orgUnitIds.includes(grantee.person.orgUnitId);
        }
        if (!inScope) {
          throw new ForbiddenException('Ngoài phạm vi thu hồi của bạn (chỉ thu hồi vai trong phòng mình)');
        }
      }

      const count = await tx.userRole.updateMany({
        where: { id: userRoleId, version: ur.version, deletedAt: null },
        data: { deletedAt: new Date(), revokedBy: user.claims.sub, version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Vai đã bị thu hồi hoặc version lệch');

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.role_revoke', entityType: 'user_role', entityId: userRoleId,
          after: {
            grantee_id: ur.appUserId, role_id: ur.roleId,
            scope_type: ur.scopeType, scope_id: ur.scopeId,
          } as object, ip,
        },
      });
      return { revoked: true };
    });
  }

  /** Quyền hiệu lực của MỘT người + NGUỒN từng vai (role, scope, ai cấp, khi nào). */
  async effectiveAccess(user: RequestUser, targetAppUserId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const target = await tx.appUser.findFirst({
        where: { id: targetAppUserId, deletedAt: null },
        select: { id: true, email: true, personId: true },
      });
      if (!target) throw new NotFoundException('Người dùng không tồn tại');
      if (target.personId) {
        const person = await tx.person.findFirst({ where: { id: target.personId } });
        // scope caller phải phủ được org_unit của target — không tra cứu chéo phòng
        const scope = effectiveScope(user);
        if (scope.mode === 'scoped' && !(person?.orgUnitId && scope.orgUnitIds.includes(person.orgUnitId))) {
          throw new ForbiddenException('Ngoài phạm vi của bạn');
        }
      }

      const roles = await tx.userRole.findMany({
        where: { appUserId: targetAppUserId, deletedAt: null, role: { deletedAt: null } },
        include: { role: { include: { rolePermissions: { include: { permission: { select: { code: true } } } } } } },
        orderBy: { createdAt: 'asc' },
      });
      const granterIds = [...new Set(roles.map((r) => r.createdBy).filter(Boolean))] as string[];
      const granters = granterIds.length
        ? await tx.appUser.findMany({ where: { id: { in: granterIds } }, select: { id: true, email: true } })
        : [];
      const granterEmail = new Map(granters.map((g) => [g.id, g.email]));

      const allPerms = new Set<string>();
      for (const r of roles) for (const rp of r.role.rolePermissions) allPerms.add(rp.permission.code);

      return {
        appUserId: target.id,
        email: target.email,
        permissions: [...allPerms].sort(),
        roles: roles.map((r) => ({
          userRoleId: r.id,
          roleCode: r.role.code,
          scopeType: r.scopeType,
          scopeId: r.scopeId,
          grantedAt: r.createdAt,
          grantedBy: r.createdBy ? { id: r.createdBy, email: granterEmail.get(r.createdBy) ?? null } : null,
        })),
      };
    });
  }
}
