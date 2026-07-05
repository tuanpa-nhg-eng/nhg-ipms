import {
  Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';

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

  list(tenantId: string, ownerId?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.goal.findMany({
        where: { deletedAt: null, ...(ownerId ? { ownerId } : {}) },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  create(tenantId: string, actorId: string, input: CreateGoalInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const owner = await tx.person.findFirst({ where: { id: input.ownerId, deletedAt: null } });
      if (!owner) throw new UnprocessableEntityException('Owner person not found');
      if (input.objectiveId) {
        const obj = await tx.objective.findFirst({ where: { id: input.objectiveId, deletedAt: null } });
        if (!obj) throw new UnprocessableEntityException('Objective not found');
        if (obj.kind !== 'kgi') throw new UnprocessableEntityException('Goal phải gắn vào KGI (không gắn thẳng OKR)');
      }
      if (input.parentGoalId) {
        const parent = await tx.goal.findFirst({ where: { id: input.parentGoalId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException('Parent goal not found');
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
  updateProgress(tenantId: string, actorId: string, goalId: string, progressPct: number) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // [F17] advisory lock theo tenant goal-tree — serialize các roll-up song song,
      // tránh lost update khi 2 goal lá anh em cập nhật cùng lúc (READ COMMITTED).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId + ':goal-rollup'}))`;

      const goal = await tx.goal.findFirst({ where: { id: goalId, deletedAt: null } });
      if (!goal) throw new NotFoundException('Goal not found');

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
    });
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
