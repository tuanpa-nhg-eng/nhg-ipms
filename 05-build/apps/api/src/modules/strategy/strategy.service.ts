import {
  Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';

export interface CreateObjectiveInput {
  kind: 'okr' | 'kgi';
  nameVi: string;
  nameEn?: string;
  period: string;
  parentId?: string;
  themeId?: string;
  orgUnitId?: string;
  ownerId?: string;
  weight?: number;
}

@Injectable()
export class StrategyService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.objective.findMany({ where: { deletedAt: null }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] }),
    );
  }

  create(tenantId: string, actorId: string, input: CreateObjectiveInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Ràng buộc cascade OKR→KGI: KGI phải có cha là OKR; OKR không có cha
      if (input.kind === 'kgi') {
        if (!input.parentId) throw new UnprocessableEntityException('KGI phải gắn parent OKR');
        const parent = await tx.objective.findFirst({ where: { id: input.parentId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException('Parent objective not found');
        if (parent.kind !== 'okr') throw new UnprocessableEntityException('Parent của KGI phải là OKR');
      } else if (input.parentId) {
        throw new UnprocessableEntityException('OKR là tầng gốc — không có parent');
      }
      return tx.objective.create({
        data: {
          id: uuidv7(), tenantId, kind: input.kind,
          nameVi: input.nameVi, nameEn: input.nameEn, period: input.period,
          parentId: input.parentId, themeId: input.themeId,
          orgUnitId: input.orgUnitId, ownerId: input.ownerId, weight: input.weight,
          status: 'active', createdBy: actorId, updatedBy: actorId,
        },
      });
    });
  }

  /**
   * Cây cascade OKR → KGI → Goal (lineage tường minh — nguyên tắc explainable).
   */
  cascade(tenantId: string, objectiveId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const root = await tx.objective.findFirst({ where: { id: objectiveId, deletedAt: null } });
      if (!root) throw new NotFoundException('Objective not found');

      const objectives = await tx.objective.findMany({ where: { deletedAt: null } });
      const goals = await tx.goal.findMany({ where: { deletedAt: null } });

      const childObjectives = new Map<string, typeof objectives>();
      for (const o of objectives) {
        if (o.parentId) {
          if (!childObjectives.has(o.parentId)) childObjectives.set(o.parentId, []);
          childObjectives.get(o.parentId)!.push(o);
        }
      }
      const goalsByObjective = new Map<string, typeof goals>();
      const childGoals = new Map<string, typeof goals>();
      for (const g of goals) {
        if (g.parentGoalId) {
          if (!childGoals.has(g.parentGoalId)) childGoals.set(g.parentGoalId, []);
          childGoals.get(g.parentGoalId)!.push(g);
        } else if (g.objectiveId) {
          if (!goalsByObjective.has(g.objectiveId)) goalsByObjective.set(g.objectiveId, []);
          goalsByObjective.get(g.objectiveId)!.push(g);
        }
      }

      const buildGoal = (g: (typeof goals)[number]): any => ({
        ...g,
        children: (childGoals.get(g.id) ?? []).map(buildGoal),
      });
      const buildObjective = (o: (typeof objectives)[number]): any => ({
        ...o,
        children: (childObjectives.get(o.id) ?? []).map(buildObjective),
        goals: (goalsByObjective.get(o.id) ?? []).map(buildGoal),
      });
      return buildObjective(root);
    });
  }
}
