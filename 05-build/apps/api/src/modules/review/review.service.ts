import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { assertScope, hasTenantScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';
import {
  computeScore, ScoringError, ScoringItem, IpcTier, DEFAULT_IPC_MAP,
} from '../kpi/scoring/engine';

export interface ComputeScoreInput {
  /** target bắt buộc mọi KPI; actual bắt buộc với KPI manual (system lấy từ evidence verified). */
  inputs: Array<{ kpiId: string; target: number; actual?: number; base?: number }>;
}

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  // ===== Cycle =====
  createCycle(user: RequestUser, input: { name: string; period: string }) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.reviewCycle.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, name: input.name, period: input.period,
          status: 'open', createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      }),
    );
  }

  listCycles(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.reviewCycle.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    );
  }

  // ===== Review =====
  createReview(user: RequestUser, input: { cycleId: string; revieweeId: string; scorecardId: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cycle = await tx.reviewCycle.findFirst({ where: { id: input.cycleId, deletedAt: null } });
      if (!cycle || cycle.status !== 'open') throw new UnprocessableEntityException('Cycle không mở');
      const reviewee = await tx.person.findFirst({ where: { id: input.revieweeId, deletedAt: null } });
      if (!reviewee) throw new UnprocessableEntityException('Reviewee not found');
      const sc = await tx.scorecard.findFirst({ where: { id: input.scorecardId, deletedAt: null } });
      if (!sc) throw new UnprocessableEntityException('Scorecard not found');
      const dup = await tx.review.findFirst({
        where: { cycleId: input.cycleId, revieweeId: input.revieweeId, deletedAt: null },
      });
      if (dup) throw new ConflictException('Review đã tồn tại cho người này trong cycle');
      return tx.review.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          cycleId: input.cycleId, revieweeId: input.revieweeId, scorecardId: input.scorecardId,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  get(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await tx.review.findFirst({
        where: { id, deletedAt: null },
        include: { itemScores: { where: { deletedAt: null } } },
      });
      if (!r) throw new NotFoundException('Review not found');
      return r;
    });
  }

  /** Self assessment — CHỈ reviewee. */
  self(user: RequestUser, id: string, selfReflection: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.revieweeId !== user.claims.person_id) {
        throw new ConflictException('Chỉ reviewee tự đánh giá phần self');
      }
      if (r.status !== 'draft') throw new ConflictException(`Review ở trạng thái ${r.status}`);
      return tx.review.update({
        where: { id },
        data: { selfReflection, status: 'self_done', updatedBy: user.claims.sub, version: { increment: 1 } },
      });
    });
  }

  /** Manager assessment — scope org_unit/tenant, KHÔNG tự đánh giá chính mình (SoD). */
  manager(user: RequestUser, id: string, input: { managerAssessment: string; proposedRating?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.revieweeId === user.claims.person_id && !hasTenantScope(user.scopes)) {
        throw new ConflictException('Không tự chấm phần manager cho chính mình (SoD)');
      }
      const reviewee = await tx.person.findFirst({ where: { id: r.revieweeId } });
      assertScope(user, { ownerPersonId: null, orgUnitId: reviewee?.orgUnitId }, 'review:manager');
      if (r.status !== 'self_done') {
        throw new ConflictException(`Cần self_done trước (hiện: ${r.status})`);
      }
      return tx.review.update({
        where: { id },
        data: {
          managerAssessment: input.managerAssessment,
          proposedRating: input.proposedRating,
          status: 'manager_done', updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
    });
  }

  /**
   * Chạy Scoring Engine và LƯU kết quả vào review_item_score kèm SNAPSHOT formula
   * version (explainable — recompute lịch sử đúng version). KPI method=system lấy
   * actual từ evidence VERIFIED mới nhất (payload.value); manual lấy từ input.
   */
  computeScore(user: RequestUser, id: string, input: ComputeScoreInput) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.status === 'final') throw new ConflictException('Review đã final — khoá');
      if (!r.scorecardId) throw new UnprocessableEntityException('Review chưa gắn scorecard');

      const sc = await tx.scorecard.findFirst({
        where: { id: r.scorecardId, deletedAt: null },
        include: {
          items: {
            where: { deletedAt: null },
            include: { kpi: { include: { formula: true, scoreTiers: { where: { deletedAt: null } } } } },
          },
        },
      });
      if (!sc || sc.items.length === 0) throw new UnprocessableEntityException('Scorecard rỗng');

      const inputByKpi = new Map(input.inputs.map((i) => [i.kpiId, i]));
      const scoringItems: Array<ScoringItem & { scorecardItemId: string; actualValue: number; source: string }> = [];

      for (const it of sc.items) {
        const inp = inputByKpi.get(it.kpiId);
        if (!inp) throw new UnprocessableEntityException(`Thiếu target cho KPI ${it.kpi.code}`);
        let actual: number;
        let source: string;
        if (it.kpi.method === 'system') {
          const ev = await tx.evidence.findFirst({
            where: {
              relatedKpiId: it.kpiId, ownerId: r.revieweeId,
              status: 'verified', type: 'metric', deletedAt: null,
            },
            orderBy: { occurredAt: 'desc' },
          });
          if (!ev || typeof (ev.payload as any)?.value !== 'number') {
            throw new UnprocessableEntityException(
              `KPI system '${it.kpi.code}' chưa có evidence metric VERIFIED (payload.value)`,
            );
          }
          actual = (ev.payload as any).value;
          source = 'system';
        } else {
          if (inp.actual == null) {
            throw new UnprocessableEntityException(`KPI manual '${it.kpi.code}' cần actual`);
          }
          actual = inp.actual;
          source = 'manual';
        }
        scoringItems.push({
          id: it.kpiId,
          scorecardItemId: it.id,
          direction: (it.kpi.direction === 'reverse' ? 'reverse' : 'forward') as any,
          formula: it.kpi.formula
            ? { expression: it.kpi.formula.expression, version: it.kpi.formula.version }
            : undefined,
          tiers: it.kpi.scoreTiers.map((t) => ({ minPct: Number(t.minPct), score: Number(t.score) })),
          weight: it.weight != null ? Number(it.weight) : null,
          groupLabel: it.groupLabel,
          groupWeight: it.groupWeight != null ? Number(it.groupWeight) : null,
          actual,
          target: inp.target,
          base: inp.base,
          actualValue: actual,
          source,
        });
      }

      let result;
      try {
        result = computeScore(scoringItems, await this.loadIpcMap(tx));
      } catch (e) {
        if (e instanceof ScoringError) throw new UnprocessableEntityException(e.message);
        throw e;
      }

      // thay bộ điểm cũ (soft-delete) → ghi bộ mới kèm snapshot
      await tx.reviewItemScore.updateMany({
        where: { reviewId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const item of result.items) {
        const src = scoringItems.find((s) => s.id === item.id)!;
        await tx.reviewItemScore.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, reviewId: id,
            scorecardItemId: src.scorecardItemId, raterId: user.claims.person_id ?? null,
            actualValue: src.actualValue, achievedPct: item.achievedPct,
            rawScore: item.rawScore, weightedScore: item.weightedScore,
            source: src.source, formulaVersion: item.formulaVersion ?? null,
          },
        });
      }
      const updated = await tx.review.update({
        where: { id },
        data: {
          finalScore: result.finalScore, ipcGrade: result.ipcGrade,
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      return { review: updated, computed: result };
    });
  }

  /**
   * Finalize — HUMAN-IN-THE-LOOP (rating:approve) + optimistic lock (409 khi version lệch)
   * + governance check TDD §12: KPI evidence_required phải có ≥1 evidence VERIFIED.
   * [F5] audit ghi CÙNG transaction — mutation nhạy cảm nhất của hệ thống.
   */
  finalize(user: RequestUser, id: string, input: { finalRating: string; rationale: string; version: number }, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.status === 'final') throw new ConflictException('Đã final');
      if (r.status !== 'manager_done' && r.status !== 'calibrated') {
        throw new ConflictException(`Cần manager_done/calibrated trước (hiện: ${r.status})`);
      }
      if (r.version !== input.version) {
        throw new ConflictException(`Version lệch (hiện ${r.version}, gửi ${input.version}) — reload trước khi duyệt`);
      }
      if (r.finalScore == null) throw new UnprocessableEntityException('Chưa compute-score');
      if (r.revieweeId === user.claims.person_id) {
        throw new ConflictException('Không tự finalize review của chính mình (SoD)');
      }

      // Governance: KPI bắt buộc evidence phải có verified evidence của reviewee
      const sc = await tx.scorecard.findFirst({
        where: { id: r.scorecardId! },
        include: { items: { where: { deletedAt: null }, include: { kpi: true } } },
      });
      for (const it of sc?.items ?? []) {
        if (!it.kpi.evidenceRequired) continue;
        const count = await tx.evidence.count({
          where: { relatedKpiId: it.kpiId, ownerId: r.revieweeId, status: 'verified', deletedAt: null },
        });
        if (count === 0) {
          throw new UnprocessableEntityException(
            `KPI '${it.kpi.code}' yêu cầu evidence verified — chưa có (governance check)`,
          );
        }
      }

      const updated = await tx.review.update({
        where: { id },
        data: {
          finalRating: input.finalRating, status: 'final',
          approvedBy: user.claims.person_id ?? null, approvedAt: new Date(),
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      // [F5] audit trong CÙNG transaction — không thể final mà thiếu audit
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'rating.approve', entityType: 'review', entityId: id,
          before: { status: r.status, finalRating: r.finalRating } as any,
          after: { status: 'final', finalRating: input.finalRating, rationale: input.rationale } as any,
          ip,
        },
      });
      return updated;
    });
  }

  private async mustGet(tx: any, id: string) {
    const r = await tx.review.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException('Review not found');
    return r;
  }

  private async loadIpcMap(tx: any): Promise<IpcTier[]> {
    const tenant = await tx.tenant.findFirst({ where: { deletedAt: null } });
    const cfg = (tenant?.settings as any)?.ipc_map;
    if (
      Array.isArray(cfg) && cfg.length > 0 &&
      cfg.every((t: any) => typeof t?.minScore === 'number' && typeof t?.grade === 'string') &&
      cfg.some((t: any) => t.minScore <= 1)
    ) {
      return cfg as IpcTier[];
    }
    return DEFAULT_IPC_MAP;
  }
}
