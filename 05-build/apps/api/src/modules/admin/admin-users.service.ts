import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { effectiveScope } from '../../common/auth/scope.util';
import { normalizeName } from '../library/quality-gate';

/**
 * [Trục B L1] "Người dùng & Vai trò" — hợp đồng API quản trị tenant/org.
 *
 * Bối cảnh: trước lát này KHÔNG một màn nào tạo được người dùng, gán được vai trò, hay
 * sửa được cơ cấu tổ chức — sản phẩm chạy đúng cho 12 tài khoản seed sẵn. Đây là lát biến
 * "hệ thống chạy đúng cho N tài khoản tôi seed" thành "hệ thống H.01 tự thêm người vào được".
 *
 * [J5] Bề mặt PII lớn nhất từ trước tới nay — whitelist select MỌI nơi; hireDate/
 * seniorityMonths chỉ trả cho caller có scope TENANT (không phải org_unit) — Q4 chốt
 * 24/07: org_admin thấy email (cần để liên hệ), KHÔNG thấy hireDate/seniorityMonths.
 */
const LIST_CAP = 2000;
const MAX_PAGE = 200;

export interface AdminUserListQuery {
  q?: string;
  orgUnitId?: string;
  status?: string;
  limit?: number;
  cursor?: string; // employeeCode của bản ghi cuối trang trước
}

export interface CreateAdminUserInput {
  employeeCode: string;
  fullName: string;
  email: string;
  orgUnitId?: string;
  managerId?: string;
  positionId?: string;
}

export interface UpdateAdminUserInput {
  fullName?: string;
  orgUnitId?: string;
  managerId?: string | null;
  positionId?: string | null;
  version: number;
}

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * [J5] Danh sách quản trị — lọc SCOPE ngay trong query (org_admin chỉ thấy phòng mình,
   * fail-closed nếu scope rỗng) rồi mới whitelist select. Không "trả hết rồi lọc ở FE".
   */
  async list(user: RequestUser, q: AdminUserListQuery) {
    const scope = effectiveScope(user);
    const canSeeSensitive = scope.mode === 'tenant'; // [J5][Q4] hireDate/seniority: tenant-only

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      let scopeWhere: Record<string, unknown> = {};
      if (scope.mode === 'scoped') {
        if (scope.orgUnitIds.length === 0) {
          // fail-closed: org_admin không có org unit nào gán → không thấy ai
          return { entries: [], nextCursor: null, capped: false };
        }
        scopeWhere = { orgUnitId: { in: scope.orgUnitIds } };
      }
      if (q.orgUnitId) {
        // tham số tường minh KHÔNG được vượt scope (chuẩn F115)
        if (scope.mode === 'scoped' && !scope.orgUnitIds.includes(q.orgUnitId)) {
          throw new ForbiddenException('orgUnitId ngoài scope của bạn');
        }
        scopeWhere = { orgUnitId: q.orgUnitId };
      }

      const persons = await tx.person.findMany({
        where: { deletedAt: null, ...scopeWhere },
        select: {
          id: true, employeeCode: true, fullName: true, email: true,
          orgUnitId: true, managerId: true, positionId: true, status: true,
          hireDate: true, seniorityMonths: true,
          // [Tự bắt] version PHẢI có trong list — PATCH đòi optimistic lock (J7); thiếu
          // trường này thì FE không patch được gì ngoài cách gọi GET riêng lấy version
          // trước mỗi lần sửa (round-trip thừa, và vẫn hở TOCTOU giữa 2 lần gọi).
          version: true,
          appUsers: { where: { deletedAt: null }, select: { id: true, status: true, email: true } },
        },
        orderBy: { employeeCode: 'asc' },
        take: LIST_CAP + 1,
      });
      const capped = persons.length > LIST_CAP;
      if (capped) persons.length = LIST_CAP;

      let rows = persons;
      if (q.status) rows = rows.filter((p) => p.appUsers[0]?.status === q.status || p.status === q.status);
      if (q.q) {
        const needle = normalizeName(q.q);
        rows = rows.filter((p) =>
          normalizeName(p.fullName).includes(needle)
          || p.employeeCode.toLowerCase().includes(q.q!.toLowerCase())
          || (p.email ?? '').toLowerCase().includes(q.q!.toLowerCase()));
      }
      if (q.cursor) {
        const idx = rows.findIndex((p) => p.employeeCode === q.cursor);
        rows = idx >= 0 ? rows.slice(idx + 1) : rows;
      }
      const take = Math.min(Math.max(q.limit ?? 50, 1), MAX_PAGE);
      const page = rows.slice(0, take);
      const nextCursor = rows.length > take ? page[page.length - 1]?.employeeCode ?? null : null;

      return {
        entries: page.map((p) => ({
          personId: p.id,
          appUserId: p.appUsers[0]?.id ?? null,
          employeeCode: p.employeeCode,
          fullName: p.fullName,
          email: p.appUsers[0]?.email ?? p.email, // ưu tiên email đăng nhập
          orgUnitId: p.orgUnitId,
          managerId: p.managerId,
          positionId: p.positionId,
          status: p.appUsers[0]?.status ?? p.status,
          version: p.version,
          // [J5][Q4] chỉ scope TENANT thấy — org_admin không thấy dù cùng response shape
          ...(canSeeSensitive ? { hireDate: p.hireDate, seniorityMonths: p.seniorityMonths } : {}),
        })),
        nextCursor,
        capped,
      };
    });
  }

  /** Tạo person + app_user CÙNG transaction. Chưa gửi email (§6 giả định 1). */
  create(user: RequestUser, input: CreateAdminUserInput) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dupCode = await tx.person.findFirst({
        where: { employeeCode: input.employeeCode, deletedAt: null },
      });
      if (dupCode) throw new ConflictException(`Mã nhân viên '${input.employeeCode}' đã tồn tại`);
      const dupEmail = await tx.appUser.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (dupEmail) throw new ConflictException(`Email '${input.email}' đã tồn tại`);

      if (input.orgUnitId) {
        const org = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!org) throw new UnprocessableEntityException('org_unit không tồn tại');
      }
      if (input.managerId) {
        const mgr = await tx.person.findFirst({ where: { id: input.managerId, deletedAt: null } });
        if (!mgr) throw new UnprocessableEntityException('managerId không tồn tại');
      }

      const person = await tx.person.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          employeeCode: input.employeeCode, fullName: input.fullName, email: input.email,
          status: 'active', orgUnitId: input.orgUnitId, managerId: input.managerId,
          positionId: input.positionId,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      const appUser = await tx.appUser.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, personId: person.id,
          email: input.email, status: 'active',
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.user_invite', entityType: 'app_user', entityId: appUser.id,
          after: { employeeCode: input.employeeCode, email: input.email } as object,
        },
      });
      return { personId: person.id, appUserId: appUser.id, employeeCode: person.employeeCode, email: appUser.email };
    });
  }

  /** Đổi hồ sơ (tên, phòng, người quản lý, vị trí) — optimistic lock (J7). */
  update(user: RequestUser, appUserId: string, input: UpdateAdminUserInput) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const appUser = await tx.appUser.findFirst({ where: { id: appUserId, deletedAt: null } });
      if (!appUser || !appUser.personId) throw new NotFoundException('Người dùng không tồn tại');
      const person = await tx.person.findFirst({ where: { id: appUser.personId, deletedAt: null } });
      if (!person) throw new NotFoundException('Hồ sơ không tồn tại');

      this.assertInScope(user, person.orgUnitId);

      if (input.orgUnitId) {
        const org = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!org) throw new UnprocessableEntityException('org_unit không tồn tại');
        this.assertInScope(user, input.orgUnitId);
      }
      if (input.managerId) {
        if (input.managerId === person.id) {
          throw new UnprocessableEntityException('Không thể tự làm người quản lý của chính mình');
        }
        await this.assertNoManagerCycle(tx as any, person.id, input.managerId);
      }

      const count = await tx.person.updateMany({
        where: { id: person.id, version: input.version },
        data: {
          fullName: input.fullName ?? undefined,
          orgUnitId: input.orgUnitId ?? undefined,
          managerId: input.managerId === undefined ? undefined : input.managerId,
          positionId: input.positionId === undefined ? undefined : input.positionId,
          updatedBy: user.claims.sub,
          version: { increment: 1 },
        },
      });
      if (count.count !== 1) throw new ConflictException('Version lệch — tải lại và thử lại');

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.user_update', entityType: 'person', entityId: person.id,
          before: { fullName: person.fullName, orgUnitId: person.orgUnitId, managerId: person.managerId } as object,
          after: input as object,
        },
      });
      // [Tự bắt] Bản đầu trả THẲNG row Prisma của Person — khác shape với list() (FE dùng
      // chung type AdminUserRow) và LẪN `person.status` (HR: active/leave/terminated) vào
      // chỗ FE mong đợi `appUser.status` (tài khoản: active/disabled) — hai vocabulary khác
      // hẳn nhau, gán nhầm sẽ hiện sai badge trạng thái ngay trên UI. Trả cùng shape với
      // list(), whitelist đúng khuôn J5.
      const fresh = await tx.person.findFirst({ where: { id: person.id } });
      const freshAppUser = await tx.appUser.findFirst({
        where: { personId: person.id, deletedAt: null }, select: { id: true, status: true, email: true },
      });
      const canSeeSensitive = effectiveScope(user).mode === 'tenant';
      return {
        personId: fresh!.id,
        appUserId: freshAppUser?.id ?? null,
        employeeCode: fresh!.employeeCode,
        fullName: fresh!.fullName,
        email: freshAppUser?.email ?? fresh!.email,
        orgUnitId: fresh!.orgUnitId,
        managerId: fresh!.managerId,
        positionId: fresh!.positionId,
        status: freshAppUser?.status ?? fresh!.status,
        version: fresh!.version,
        ...(canSeeSensitive ? { hireDate: fresh!.hireDate, seniorityMonths: fresh!.seniorityMonths } : {}),
      };
    });
  }

  /** [J8] Khoá tài khoản — hiệu lực NGAY qua PermissionGuard (đọc status mỗi request). */
  async disable(user: RequestUser, appUserId: string, ip?: string) {
    if (appUserId === user.claims.sub) {
      throw new ConflictException('Không tự khoá chính mình — sẽ không ai mở lại được');
    }
    return this.setStatus(user, appUserId, 'disabled', ip);
  }

  enable(user: RequestUser, appUserId: string, ip?: string) {
    return this.setStatus(user, appUserId, 'active', ip);
  }

  private setStatus(user: RequestUser, appUserId: string, status: 'active' | 'disabled', ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const target = await tx.appUser.findFirst({ where: { id: appUserId, deletedAt: null } });
      if (!target) throw new NotFoundException('Người dùng không tồn tại');
      if (target.personId) {
        const person = await tx.person.findFirst({ where: { id: target.personId } });
        this.assertInScope(user, person?.orgUnitId ?? null);
      }
      const updated = await tx.appUser.update({
        where: { id: appUserId },
        data: { status, updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: status === 'active' ? 'admin.user_enable' : 'admin.user_disable',
          entityType: 'app_user', entityId: appUserId,
          after: { status } as object, ip,
        },
      });
      return updated;
    });
  }

  effectiveScopeCheck(user: RequestUser, orgUnitId: string | null) {
    this.assertInScope(user, orgUnitId);
  }

  private assertInScope(user: RequestUser, orgUnitId: string | null) {
    const scope = effectiveScope(user);
    if (scope.mode === 'tenant') return;
    if (!orgUnitId || !scope.orgUnitIds.includes(orgUnitId)) {
      throw new ForbiddenException('Ngoài phạm vi quản trị của bạn');
    }
  }

  /** Chu trình quản lý: A quản lý B quản lý A → chặn. Duyệt ngược chuỗi managerId. */
  private async assertNoManagerCycle(
    tx: { person: { findFirst: (args: any) => Promise<any> } },
    personId: string,
    newManagerId: string,
  ) {
    let cur: string | null = newManagerId;
    const seen = new Set<string>();
    for (let i = 0; i < 100 && cur; i++) {
      if (cur === personId) {
        throw new UnprocessableEntityException('Chu trình quản lý: người này đã ở trên chuỗi quản lý của người kia');
      }
      if (seen.has(cur)) break; // vòng lặp lỗi dữ liệu cũ — không đệ quy vô hạn
      seen.add(cur);
      const m = await tx.person.findFirst({ where: { id: cur }, select: { managerId: true } });
      cur = m?.managerId ?? null;
    }
  }
}
