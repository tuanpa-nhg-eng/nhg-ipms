import {
  Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { assertScope, effectiveScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

export interface CreateGoalInput {
  nameVi: string;
  nameEn?: string;
  description?: string;
  period: string;
  ownerId: string;
  objectiveId?: string;
  parentGoalId?: string;
  orgUnitId?: string;
  weight?: number;
}

/** Ngưỡng health → status (mặc định; Phase sau chuyển vào tenant_setting). */
const HEALTH_ACTIVE = 70;
const HEALTH_AT_RISK = 40;

@Injectable()
export class GoalService {
  constructor(private prisma: PrismaService) {}

  list(user: RequestUser, ownerId?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // [F32] lọc theo scope
      const scope = effectiveScope(user);
      let scopeWhere: Record<string, unknown> = {};
      if (scope.mode === 'scoped') {
        const or: Record<string, unknown>[] = [];
        if (scope.selfPersonId) or.push({ ownerId: scope.selfPersonId });
        if (scope.orgUnitIds.length > 0) {
          // Goal gắn nhãn đơn vị (cột goal.org_unit_id) — hành vi cũ, giữ nguyên.
          or.push({ orgUnitId: { in: scope.orgUnitIds } });
          // [F174] + goal của NGƯỜI thuộc đơn vị mình phụ trách.
          // Trước bản vá, phạm vi org_unit chỉ so `goal.org_unit_id`, trong khi
          // CheckinService.list / ReviewService.list / PersonService.team đều phân giải
          // qua `person.org_unit_id` của người sở hữu. `orgUnitId` lại là trường TUỲ CHỌN
          // khi tạo goal ⇒ mọi goal không gắn nhãn (tạo qua API không truyền, hoặc do
          // engine kéo theo sinh ra) trở nên VÔ HÌNH với chính trưởng phòng của người đó:
          // màn "Đội của tôi" đếm thiếu mục tiêu mà không báo lỗi gì. Bắt được khi kiểm
          // chứng sống L3 (goal có thật trong DB, API trả 0 dòng).
          const members = await tx.person.findMany({
            where: { orgUnitId: { in: scope.orgUnitIds }, deletedAt: null },
            select: { id: true },
          });
          if (members.length > 0) or.push({ ownerId: { in: members.map((m) => m.id) } });
        }
        scopeWhere = or.length > 0 ? { OR: or } : { ownerId: '00000000-0000-0000-0000-000000000000' };
      }
      return tx.goal.findMany({
        where: { deletedAt: null, ...scopeWhere, ...(ownerId ? { ownerId } : {}) },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  create(user: RequestUser, input: CreateGoalInput) {
    const tenantId = user.tenantId;
    const actorId = user.claims.sub;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const owner = await tx.person.findFirst({ where: { id: input.ownerId, deletedAt: null } });
      if (!owner) throw new UnprocessableEntityException('Owner person not found');
      // [F6] scope: self chỉ tạo goal cho chính mình; org_unit tạo cho người trong đơn vị phụ trách
      assertScope(user, { ownerPersonId: input.ownerId, orgUnitId: owner.orgUnitId }, 'goal:create');
      if (input.objectiveId) {
        const obj = await tx.objective.findFirst({ where: { id: input.objectiveId, deletedAt: null } });
        if (!obj) throw new UnprocessableEntityException('Objective not found');
        if (obj.kind !== 'kgi') throw new UnprocessableEntityException('Goal phải gắn vào KGI (không gắn thẳng OKR)');
      }
      if (input.parentGoalId) {
        const parent = await tx.goal.findFirst({ where: { id: input.parentGoalId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException('Parent goal not found');
      }
      // [F180 — Reviewer] `orgUnitId` là NHÃN do người tạo tự đặt, trước đây ghi thẳng
      // không kiểm chứng — trong khi GoalService.list (nhánh cũ F174 giữ lại) dùng chính
      // nhãn đó làm điều kiện đọc. Hệ quả kiểm chứng được: hr@ (ở ROOT) tạo goal cho
      // chính mình dán nhãn ADMISSIONS ⇒ trưởng phòng ADMISSIONS đọc được goal của người
      // NGOÀI phòng. Nay nhãn phải nằm trong phạm vi người tạo — không tự dán vào phòng
      // mình không phụ trách.
      if (input.orgUnitId) {
        const ou = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!ou) throw new UnprocessableEntityException('Org unit not found');
        assertScope(user, { ownerPersonId: null, orgUnitId: input.orgUnitId }, 'goal:label-org-unit');
      }
      return tx.goal.create({
        data: {
          id: uuidv7(), tenantId,
          nameVi: input.nameVi, nameEn: input.nameEn, description: input.description,
          period: input.period, ownerId: input.ownerId,
          objectiveId: input.objectiveId, parentGoalId: input.parentGoalId,
          orgUnitId: input.orgUnitId, weight: input.weight,
          status: 'active', createdBy: actorId, updatedBy: actorId,
        },
      });
    });
  }

  /**
   * Cập nhật tiến độ goal lá → health_score = progress; roll-up trung bình có
   * trọng số lên chuỗi goal cha (cùng transaction — nhất quán). Status tự chuyển
   * theo ngưỡng (explainable: health + status luôn suy ra được từ tiến độ con).
   */
  updateProgress(user: RequestUser, goalId: string, progressPct: number) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      this.updateProgressInTx(tx, user, goalId, progressPct),
    );
  }

  /**
   * [F34] Bản chạy TRONG transaction có sẵn — check-in gọi để checkin + goal update
   * atomic cùng nhau (không còn partial state).
   */
  async updateProgressInTx(tx: TenantTx, user: RequestUser, goalId: string, progressPct: number) {
    const tenantId = user.tenantId;
    const actorId = user.claims.sub;
    // [F17] advisory lock theo tenant goal-tree — serialize các roll-up song song,
    // tránh lost update khi 2 goal lá anh em cập nhật cùng lúc (READ COMMITTED).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId + ':goal-rollup'}))`;

    const goal = await tx.goal.findFirst({ where: { id: goalId, deletedAt: null } });
    if (!goal) throw new NotFoundException('Goal not found');
    // [F6] scope: employee (self) chỉ cập nhật goal của mình
    assertScope(user, { ownerPersonId: goal.ownerId, orgUnitId: goal.orgUnitId }, 'goal:progress');

    const children = await tx.goal.count({ where: { parentGoalId: goalId, deletedAt: null } });
    if (children > 0) {
      throw new UnprocessableEntityException('Goal cha nhận health từ roll-up — chỉ cập nhật tiến độ ở goal lá');
    }

    await this.applyHealth(tx, goalId, progressPct, actorId);

    // roll-up tổ tiên (chặn vòng lặp: tối đa 20 tầng)
    let current = goal.parentGoalId;
    let hop = 0;
    while (current && hop < 20) {
      const siblings = await tx.goal.findMany({
        where: { parentGoalId: current, deletedAt: null },
        select: { healthScore: true, weight: true },
      });
      const scored = siblings.filter((s) => s.healthScore != null);
      if (scored.length > 0) {
        const totalW = scored.reduce((a, s) => a + Number(s.weight ?? 1), 0);
        const avg = scored.reduce((a, s) => a + Number(s.healthScore) * Number(s.weight ?? 1), 0) / totalW;
        await this.applyHealth(tx, current, Math.round(avg * 100) / 100, actorId);
      }
      const parent = await tx.goal.findFirst({ where: { id: current }, select: { parentGoalId: true } });
      current = parent?.parentGoalId ?? null;
      hop++;
    }

    return tx.goal.findFirst({ where: { id: goalId } });
  }

  private async applyHealth(tx: TenantTx, goalId: string, health: number, actorId: string) {
    const status =
      health >= HEALTH_ACTIVE ? 'active' : health >= HEALTH_AT_RISK ? 'at_risk' : 'off_track';
    await tx.goal.update({
      where: { id: goalId },
      data: { healthScore: health, status, updatedBy: actorId },
    });
  }
}
