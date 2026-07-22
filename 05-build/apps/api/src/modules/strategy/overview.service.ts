import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { effectiveScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục A — L1] Read-model tổng hợp cho màn Điều hành (/exec/cockpit).
 *
 * [I1 — điểm dễ sai nhất của endpoint tổng hợp] Endpoint gác bằng `goal:read`, mà
 * `goal:read` được cấp cho CẢ role employee. Nếu chỉ dựa vào permission thì nhân viên
 * mở được bảng điều khiển toàn tenant — số tổng hợp vẫn là rò rỉ (biết phân bố lương/
 * hiệu suất toàn công ty). Vì vậy MỌI phép đếm ở đây đều đi qua cùng bộ lọc scope như
 * GoalService.list: tenant → toàn tenant · org_unit → phòng phụ trách · self → của mình.
 * Người scope self gọi endpoint này nhận về đúng số của chính họ, không phải 403 —
 * trung thực và không lộ gì.
 */
@Injectable()
export class OverviewService {
  constructor(private prisma: PrismaService) {}

  overview(user: RequestUser, filter: { cycleId?: string } = {}) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const scope = effectiveScope(user);

      // ----- phạm vi: danh sách person được phép tổng hợp -----
      let personIds: string[] | null = null; // null = toàn tenant
      if (scope.mode === 'scoped') {
        const ids = new Set<string>();
        if (scope.selfPersonId) ids.add(scope.selfPersonId);
        if (scope.orgUnitIds.length > 0) {
          const members = await tx.person.findMany({
            where: { orgUnitId: { in: scope.orgUnitIds }, deletedAt: null },
            select: { id: true },
          });
          for (const m of members) ids.add(m.id);
        }
        personIds = [...ids];
        if (personIds.length === 0) {
          return {
            scope: 'scoped' as const, coverage: { persons: 0 },
            goals: { total: 0, byStatus: {}, avgHealth: null },
            atRisk: [], cycles: [], kpi: null,
          };
        }
      }
      const goalWhere = personIds ? { ownerId: { in: personIds } } : {};

      // ----- goal: phân bố trạng thái + sức khoẻ trung bình -----
      const byStatus = await tx.goal.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...goalWhere },
        _count: { _all: true },
      });
      const health = await tx.goal.aggregate({
        where: { deletedAt: null, healthScore: { not: null }, ...goalWhere },
        _avg: { healthScore: true },
      });
      const statusMap: Record<string, number> = {};
      let totalGoals = 0;
      for (const s of byStatus) {
        statusMap[s.status] = s._count._all;
        totalGoals += s._count._all;
      }

      // ----- goal đang gặp rủi ro: danh sách hành động được, không phải con số suông -----
      const atRiskRows = await tx.goal.findMany({
        where: { deletedAt: null, status: { in: ['at_risk', 'off_track'] }, ...goalWhere },
        select: {
          id: true, nameVi: true, status: true, healthScore: true,
          period: true, ownerId: true, orgUnitId: true, updatedAt: true,
        },
        orderBy: [{ healthScore: 'asc' }, { updatedAt: 'desc' }],
        take: 20,
      });
      const ownerIds = [...new Set(atRiskRows.map((g) => g.ownerId))];
      const owners = ownerIds.length
        ? await tx.person.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, fullName: true, employeeCode: true },
          })
        : [];
      const ownerById = new Map(owners.map((p) => [p.id, p]));

      // ----- tiến độ chu kỳ đánh giá đang mở -----
      const cycles = await tx.reviewCycle.findMany({
        where: { deletedAt: null, status: 'open', ...(filter.cycleId ? { id: filter.cycleId } : {}) },
        select: { id: true, name: true, period: true, startDate: true, endDate: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const cycleProgress = [];
      for (const c of cycles) {
        const counts = await tx.review.groupBy({
          by: ['status'],
          where: {
            cycleId: c.id, deletedAt: null,
            ...(personIds ? { revieweeId: { in: personIds } } : {}),
          },
          _count: { _all: true },
        });
        const m: Record<string, number> = {};
        let total = 0;
        for (const x of counts) {
          m[x.status] = x._count._all;
          total += x._count._all;
        }
        cycleProgress.push({ ...c, total, byStatus: m });
      }

      // ----- độ phủ KPI (catalog cấu hình, không phải dữ liệu cá nhân) -----
      // Chỉ trả khi người gọi thực sự có kpi:read — không lợi dụng endpoint tổng hợp
      // để đưa thêm dữ liệu ngoài quyền của họ.
      const kpi = user.permissions.has('kpi:read')
        ? await (async () => {
            const rows = await tx.kpi.groupBy({
              by: ['status'], where: { deletedAt: null }, _count: { _all: true },
            });
            const map: Record<string, number> = {};
            for (const r of rows) map[r.status] = r._count._all;
            return map;
          })()
        : null;

      return {
        scope: scope.mode,
        coverage: { persons: personIds ? personIds.length : null },
        goals: {
          total: totalGoals,
          byStatus: statusMap,
          avgHealth: health._avg.healthScore != null ? Number(health._avg.healthScore) : null,
        },
        atRisk: atRiskRows.map((g) => ({
          ...g,
          healthScore: g.healthScore != null ? Number(g.healthScore) : null,
          owner: ownerById.get(g.ownerId)
            ? {
                id: g.ownerId,
                fullName: ownerById.get(g.ownerId)!.fullName,
                employeeCode: ownerById.get(g.ownerId)!.employeeCode,
              }
            : null,
        })),
        cycles: cycleProgress,
        kpi,
      };
    });
  }
}
