import {
  ConflictException, ForbiddenException, Injectable, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { effectiveScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

export interface CreatePersonInput {
  employeeCode: string;
  fullName: string;
  email?: string;
  status: string;
  orgUnitId?: string;
  managerId?: string;
}

@Injectable()
export class PersonService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.person.findMany({ where: { deletedAt: null }, orderBy: { employeeCode: 'asc' } }),
    );
  }

  me(tenantId: string, personId: string | undefined) {
    if (!personId) return null;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.person.findFirst({ where: { id: personId, deletedAt: null } }),
    );
  }

  /**
   * [Trục A — L1] Roster đội cho màn Trưởng phòng: ai thuộc quyền mình + kỳ này đã
   * check-in chưa + review trong chu kỳ tới đâu. Gộp sẵn ở BE vì nếu để FE ghép thì
   * mỗi lần mở màn là N+2 request và mỗi request lại là một cửa rò quyền phải gác.
   *
   * "Đội" = báo cáo trực tiếp (person.managerId = mình) ∪ thành viên các org_unit mình
   * phụ trách. Cột `manager_id` có sẵn trong schema từ Phase 0 nhưng tới trục này mới
   * có luồng dùng thật (seed:perfdemo gán).
   *
   * [I1] orgUnitId truyền tường minh PHẢI nằm trong scope người gọi — nếu không thì
   * trưởng phòng A soi được phòng B (đúng lỗ F115 đã bị bắt ở lát 4j, không lặp lại).
   * Người scope tenant (hrbp/admin) được phép chỉ định bất kỳ đơn vị nào.
   */
  team(
    user: RequestUser,
    filter: { orgUnitId?: string; periodKey?: string; cycleId?: string; cadence?: string } = {},
  ) {
    const cadence = filter.cadence ?? 'monthly';
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const scope = effectiveScope(user);
      const selfPersonId = user.claims.person_id ?? null;

      let orgUnitIds: string[];
      if (filter.orgUnitId) {
        if (scope.mode !== 'tenant' && !scope.orgUnitIds.includes(filter.orgUnitId)) {
          throw new ForbiddenException('Không có quyền xem đơn vị này');
        }
        orgUnitIds = [filter.orgUnitId];
      } else {
        orgUnitIds = scope.mode === 'tenant' ? [] : scope.orgUnitIds;
      }

      const or: Record<string, unknown>[] = [];
      if (orgUnitIds.length > 0) or.push({ orgUnitId: { in: orgUnitIds } });
      if (selfPersonId) or.push({ managerId: selfPersonId });
      // Fail-closed: không xác định được đội ⇒ trả rỗng, KHÔNG mặc định "cả tenant".
      if (or.length === 0) {
        return { orgUnitIds, periodKey: filter.periodKey ?? null, members: [] };
      }

      // Trần 500 người/đội. Trả kèm cờ `capped` thay vì cắt im lặng: trưởng phòng phải
      // biết mình đang nhìn thiếu người, nếu không sẽ tưởng đội chỉ có bấy nhiêu và ra
      // quyết định trên danh sách khuyết (cùng tinh thần cờ `capped` của Từ điển Tác vụ).
      const CAP = 500;
      const rows = await tx.person.findMany({
        where: { deletedAt: null, status: 'active', OR: or },
        select: {
          id: true, employeeCode: true, fullName: true, email: true,
          orgUnitId: true, managerId: true, positionId: true,
        },
        orderBy: { employeeCode: 'asc' },
        take: CAP + 1,
      });
      const capped = rows.length > CAP;
      const members = capped ? rows.slice(0, CAP) : rows;
      if (members.length === 0) {
        return { orgUnitIds, periodKey: filter.periodKey ?? null, capped: false, members: [] };
      }
      const ids = members.map((m) => m.id);

      // 3 query gộp cho toàn đội — không lặp theo từng người (N+1 là lỗi hiệu năng
      // KIÊM lỗi bảo mật: mỗi vòng lặp là một chỗ dễ quên gác scope).
      const checkins = filter.periodKey
        ? await tx.checkin.findMany({
            where: { personId: { in: ids }, cadence, periodKey: filter.periodKey, deletedAt: null },
            select: { id: true, personId: true, status: true, blocker: true, periodKey: true },
          })
        : [];
      const reviews = filter.cycleId
        ? await tx.review.findMany({
            where: { revieweeId: { in: ids }, cycleId: filter.cycleId, deletedAt: null },
            select: {
              id: true, revieweeId: true, status: true, proposedRating: true,
              finalRating: true, finalScore: true, version: true,
            },
          })
        : [];
      const goalRows = await tx.goal.groupBy({
        by: ['ownerId', 'status'],
        where: { ownerId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      });

      const checkinBy = new Map(checkins.map((c) => [c.personId, c]));
      const reviewBy = new Map(reviews.map((r) => [r.revieweeId, r]));
      const goalsBy = new Map<string, Record<string, number>>();
      for (const g of goalRows) {
        const cur = goalsBy.get(g.ownerId) ?? {};
        cur[g.status] = g._count._all;
        goalsBy.set(g.ownerId, cur);
      }

      return {
        orgUnitIds,
        periodKey: filter.periodKey ?? null,
        cycleId: filter.cycleId ?? null,
        capped,
        members: members.map((m) => ({
          ...m,
          checkin: checkinBy.get(m.id) ?? null,
          review: reviewBy.get(m.id) ?? null,
          goalCounts: goalsBy.get(m.id) ?? {},
        })),
      };
    });
  }

  create(tenantId: string, actorId: string, input: CreatePersonInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const dup = await tx.person.findFirst({ where: { employeeCode: input.employeeCode } });
      if (dup) throw new ConflictException(`employee code '${input.employeeCode}' exists`);
      if (input.orgUnitId) {
        const ou = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!ou) throw new UnprocessableEntityException('org unit not found');
      }
      if (input.managerId) {
        const mgr = await tx.person.findFirst({ where: { id: input.managerId, deletedAt: null } });
        if (!mgr) throw new UnprocessableEntityException('manager not found');
      }
      return tx.person.create({
        data: {
          id: uuidv7(),
          tenantId,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          email: input.email,
          status: input.status,
          orgUnitId: input.orgUnitId,
          managerId: input.managerId,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
    });
  }
}
