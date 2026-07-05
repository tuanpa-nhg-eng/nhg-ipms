import {
  Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import {
  computeScore, resolveWeights, ScoringError, ScoringItem, IpcTier, DEFAULT_IPC_MAP,
} from './scoring/engine';

export interface CreateScorecardInput {
  nameVi: string;
  nameEn?: string;
  roleFamilyId?: string;
  orgUnitId?: string;
  period?: string;
  items: Array<{
    kpiId: string;
    weight?: number;
    groupLabel?: string;
    groupWeight?: number;
    target?: number; // [F26] target server-side cho review compute
    base?: number;
  }>;
}

export interface ComputePreviewInput {
  actuals: Array<{ kpiId: string; actual: number; target: number; base?: number }>;
}

@Injectable()
export class ScorecardService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.scorecard.findMany({
        where: { deletedAt: null },
        include: { items: { where: { deletedAt: null }, include: { kpi: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  create(tenantId: string, actorId: string, input: CreateScorecardInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // KPI phải tồn tại trong tenant (RLS lo phần cô lập)
      for (const it of input.items) {
        const kpi = await tx.kpi.findFirst({ where: { id: it.kpiId, deletedAt: null } });
        if (!kpi) throw new UnprocessableEntityException(`KPI ${it.kpiId} not found`);
      }
      const sc = await tx.scorecard.create({
        data: {
          id: uuidv7(), tenantId, nameVi: input.nameVi, nameEn: input.nameEn,
          roleFamilyId: input.roleFamilyId, orgUnitId: input.orgUnitId,
          period: input.period, status: 'draft', createdBy: actorId, updatedBy: actorId,
        },
      });
      for (const it of input.items) {
        await tx.scorecardItem.create({
          data: {
            id: uuidv7(), tenantId, scorecardId: sc.id, kpiId: it.kpiId,
            weight: it.weight, groupLabel: it.groupLabel, groupWeight: it.groupWeight,
            target: it.target, base: it.base,
          },
        });
      }
      return tx.scorecard.findFirst({
        where: { id: sc.id },
        include: { items: { include: { kpi: true } } },
      });
    });
  }

  /** TDD §8.3 — validate tổng tỷ trọng scorecard = 100 ± 0.01 (dùng đúng engine). */
  async validateWeights(tenantId: string, id: string) {
    const items = await this.loadScoringSkeleton(tenantId, id);
    try {
      const weights = resolveWeights(items);
      const sum = [...weights.values()].reduce((a, b) => a + b, 0);
      return {
        valid: true,
        sum: Math.round(sum * 100) / 100,
        effectiveWeights: Object.fromEntries(weights),
      };
    } catch (e) {
      if (e instanceof ScoringError) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }

  /**
   * Chạy thử Scoring Engine trên scorecard với actual/target nhập tay —
   * phục vụ B1 kiểm tra cấu hình TRƯỚC khi gắn vào review cycle (Phase 2).
   * KHÔNG ghi kết quả vào DB — preview thuần.
   */
  async computePreview(tenantId: string, id: string, input: ComputePreviewInput) {
    const skeleton = await this.loadScoringSkeleton(tenantId, id);
    const actualByKpi = new Map(input.actuals.map((a) => [a.kpiId, a]));

    const items: ScoringItem[] = skeleton.map((it) => {
      const a = actualByKpi.get(it.kpiRef!);
      if (!a) {
        throw new UnprocessableEntityException(`Thiếu actual/target cho KPI ${it.kpiRef}`);
      }
      return { ...it, actual: a.actual, target: a.target, base: a.base };
    });

    const ipcMap = await this.loadIpcMap(tenantId);
    try {
      return computeScore(items, ipcMap);
    } catch (e) {
      if (e instanceof ScoringError) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }

  /** Load scorecard item + kpi (direction/formula/tiers) → ScoringItem chưa có actual. */
  private async loadScoringSkeleton(
    tenantId: string,
    scorecardId: string,
  ): Promise<Array<ScoringItem & { kpiRef?: string }>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const sc = await tx.scorecard.findFirst({
        where: { id: scorecardId, deletedAt: null },
        include: {
          items: {
            where: { deletedAt: null },
            include: {
              kpi: { include: { formula: true, scoreTiers: { where: { deletedAt: null } } } },
            },
          },
        },
      });
      if (!sc) throw new NotFoundException('Scorecard not found');
      if (sc.items.length === 0) throw new UnprocessableEntityException('Scorecard không có item');

      return sc.items.map((it) => ({
        id: it.id,
        kpiRef: it.kpiId,
        direction: (it.kpi.direction === 'reverse' ? 'reverse' : 'forward') as 'forward' | 'reverse',
        formula: it.kpi.formula
          ? { expression: it.kpi.formula.expression, version: it.kpi.formula.version }
          : undefined,
        tiers: it.kpi.scoreTiers.map((t) => ({ minPct: Number(t.minPct), score: Number(t.score) })),
        weight: it.weight != null ? Number(it.weight) : null,
        groupLabel: it.groupLabel,
        groupWeight: it.groupWeight != null ? Number(it.groupWeight) : null,
        actual: 0,
        target: 0,
      }));
    });
  }

  /** ipc_map cấu hình theo tenant (tenant.settings.ipc_map — TDD §7.4), fallback mặc định. */
  private async loadIpcMap(tenantId: string): Promise<IpcTier[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { deletedAt: null } });
      const cfg = (tenant?.settings as any)?.ipc_map;
      // [F20] mảng rỗng / thiếu tier đáy (minScore ≤ 1) → fallback mặc định, không âm thầm ra 'D'
      if (
        Array.isArray(cfg) && cfg.length > 0 &&
        cfg.every((t) => typeof t?.minScore === 'number' && typeof t?.grade === 'string') &&
        cfg.some((t) => t.minScore <= 1)
      ) {
        return cfg as IpcTier[];
      }
      return DEFAULT_IPC_MAP;
    });
  }
}
