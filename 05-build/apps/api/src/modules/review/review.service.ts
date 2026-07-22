import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { assertScope, effectiveScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';
import {
  computeScore, ScoringError, ScoringItem, IpcTier, DEFAULT_IPC_MAP,
} from '../kpi/scoring/engine';

export interface ComputeScoreInput {
  /**
   * [F26] target/base lấy SERVER-SIDE từ scorecard_item — client KHÔNG gửi được.
   * Chỉ KPI manual nhận `actual` từ rater (người gọi đã qua scope + SoD check).
   */
  manualActuals: Array<{ kpiId: string; actual: number }>;
}

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  // ===== Cycle — [F31] permission review:manage (hrbp/tenant_admin) =====
  createCycle(user: RequestUser, input: { name: string; period: string; startDate: string; endDate: string }) {
    // [F29] cycle BẮT BUỘC có khung thời gian — evidence chỉ tính trong kỳ
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (!(start < end)) throw new UnprocessableEntityException('startDate phải trước endDate');
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.reviewCycle.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, name: input.name, period: input.period,
          startDate: start, endDate: end,
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

  /**
   * [Trục A — L1] Danh sách review. Trước lát này CHỈ có `GET /reviews/:id` ⇒ FE không
   * có cách nào dựng màn "đội của tôi" / "chu kỳ đang chạy" mà không đoán id.
   *
   * [I1 — bất biến quan trọng nhất của trục] Lọc scope NGAY TRONG QUERY, không lọc sau
   * khi đọc: employee (scope self) chỉ thấy review của CHÍNH MÌNH; trưởng phòng (org_unit)
   * thấy người thuộc phòng phụ trách; hrbp/admin (tenant) thấy toàn tenant. Fail-closed:
   * scope 'scoped' mà không có org_unit lẫn person_id ⇒ where không khớp gì.
   *
   * [I5] Whitelist select — KHÔNG trả nguyên row (row có selfReflection/managerAssessment
   * là văn bản nhạy cảm, chỉ nên đọc ở màn chi tiết qua get() đã có assertScope riêng).
   *
   * [F43 — chủ dự án chốt 22/07/2026] reviewee ĐƯỢC thấy điểm/hạng của chính mình
   * trước khi cycle final ⇒ finalScore/proposedRating không bị che cho chủ thể.
   */
  list(
    user: RequestUser,
    filter: { cycleId?: string; status?: string; revieweeId?: string; limit?: number } = {},
  ) {
    const LIST_CAP = 200;
    const take = Math.min(Math.max(filter.limit ?? LIST_CAP, 1), LIST_CAP);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const scope = effectiveScope(user);
      let scopeWhere: Record<string, unknown> = {};
      if (scope.mode === 'scoped') {
        const or: Record<string, unknown>[] = [];
        if (scope.selfPersonId) or.push({ revieweeId: scope.selfPersonId });
        if (scope.orgUnitIds.length > 0) {
          const members = await tx.person.findMany({
            where: { orgUnitId: { in: scope.orgUnitIds }, deletedAt: null },
            select: { id: true },
          });
          if (members.length > 0) or.push({ revieweeId: { in: members.map((m) => m.id) } });
        }
        // Không có scope nào khớp ⇒ deny bằng điều kiện không bao giờ đúng (fail-closed).
        scopeWhere = or.length > 0
          ? { OR: or }
          : { revieweeId: '00000000-0000-0000-0000-000000000000' };
      }

      const rows = await tx.review.findMany({
        where: {
          deletedAt: null,
          ...scopeWhere,
          ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
          ...(filter.status ? { status: filter.status as never } : {}),
          ...(filter.revieweeId ? { revieweeId: filter.revieweeId } : {}),
        },
        select: {
          id: true, cycleId: true, revieweeId: true, scorecardId: true,
          status: true, proposedRating: true, finalRating: true, finalScore: true,
          ipcGrade: true, version: true, updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      });
      const capped = rows.length > take;
      const page = capped ? rows.slice(0, take) : rows;

      // Tên người được đánh giá: 1 query gộp (không N+1). Chỉ lấy trường hiển thị.
      const persons = page.length
        ? await tx.person.findMany({
            where: { id: { in: [...new Set(page.map((r) => r.revieweeId))] } },
            select: { id: true, fullName: true, employeeCode: true, orgUnitId: true },
          })
        : [];
      const byId = new Map(persons.map((p) => [p.id, p]));

      return {
        total: page.length,
        capped,
        reviews: page.map((r) => ({
          ...r,
          reviewee: byId.get(r.revieweeId)
            ? {
                id: r.revieweeId,
                fullName: byId.get(r.revieweeId)!.fullName,
                employeeCode: byId.get(r.revieweeId)!.employeeCode,
              }
            : null,
        })),
      };
    });
  }

  /** [F27] scope check: self đọc review của mình; org_unit/tenant theo phạm vi. */
  get(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await tx.review.findFirst({
        where: { id, deletedAt: null },
        include: { itemScores: { where: { deletedAt: null } } },
      });
      if (!r) throw new NotFoundException('Review not found');
      const reviewee = await tx.person.findFirst({ where: { id: r.revieweeId } });
      assertScope(user, { ownerPersonId: r.revieweeId, orgUnitId: reviewee?.orgUnitId }, 'review:read');
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

  /** Manager assessment — scope org_unit/tenant; [F30] SoD TUYỆT ĐỐI: không tự chấm mình, không ngoại lệ. */
  manager(user: RequestUser, id: string, input: { managerAssessment: string; proposedRating?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.revieweeId === user.claims.person_id) {
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
   * Scoring — [F26] hardened:
   * - Scope org_unit/tenant + SoD (reviewee KHÔNG tự compute).
   * - Status ≥ self_done (không compute ở draft).
   * - target/base từ scorecard_item (server-side); manual actual từ rater.
   * - KPI system: evidence VERIFIED trong KHUNG KỲ cycle [start,end] (F29).
   * - Persist review_item_score kèm targetValue + formulaVersion (explainable).
   */
  computeScore(user: RequestUser, id: string, input: ComputeScoreInput) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.status === 'final') throw new ConflictException('Review đã final — khoá');
      if (r.status === 'draft') throw new ConflictException('Cần self_done trước khi chấm điểm');
      if (r.revieweeId === user.claims.person_id) {
        throw new ConflictException('Reviewee không tự chấm điểm (SoD)');
      }
      const reviewee = await tx.person.findFirst({ where: { id: r.revieweeId } });
      assertScope(user, { ownerPersonId: null, orgUnitId: reviewee?.orgUnitId }, 'review:compute');
      if (!r.scorecardId) throw new UnprocessableEntityException('Review chưa gắn scorecard');

      const cycle = await tx.reviewCycle.findFirst({ where: { id: r.cycleId } });
      if (!cycle?.startDate || !cycle?.endDate) {
        throw new UnprocessableEntityException('Cycle thiếu khung thời gian — không xác định được kỳ evidence');
      }

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

      const manualByKpi = new Map(input.manualActuals.map((i) => [i.kpiId, i.actual]));
      const scoringItems: Array<ScoringItem & { scorecardItemId: string; actualValue: number; targetValue: number; source: string }> = [];

      for (const it of sc.items) {
        if (it.target == null) {
          throw new UnprocessableEntityException(
            `Scorecard item KPI '${it.kpi.code}' chưa cấu hình target (server-side) — HR cập nhật scorecard trước`,
          );
        }
        const target = Number(it.target);
        let actual: number;
        let source: string;
        if (it.kpi.method === 'system') {
          const ev = await tx.evidence.findFirst({
            where: {
              relatedKpiId: it.kpiId, ownerId: r.revieweeId,
              status: 'verified', type: 'metric', deletedAt: null,
              occurredAt: { gte: cycle.startDate, lte: cycle.endDate }, // [F29] chỉ trong kỳ
            },
            orderBy: { occurredAt: 'desc' },
          });
          if (!ev || typeof (ev.payload as any)?.value !== 'number') {
            throw new UnprocessableEntityException(
              `KPI system '${it.kpi.code}' chưa có evidence metric VERIFIED trong kỳ ${cycle.period}`,
            );
          }
          actual = (ev.payload as any).value;
          source = 'system';
        } else {
          const m = manualByKpi.get(it.kpiId);
          if (m == null) throw new UnprocessableEntityException(`KPI manual '${it.kpi.code}' cần actual từ rater`);
          actual = m;
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
          target,
          base: it.base != null ? Number(it.base) : undefined,
          actualValue: actual,
          targetValue: target,
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
            actualValue: src.actualValue, targetValue: src.targetValue,
            achievedPct: item.achievedPct,
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
   * Finalize — HITL + [F28] CONDITIONAL UPDATE (chống race TOCTOU: where có version+status,
   * count=0 → 409) + governance evidence TRONG KỲ (F29) + SoD + audit CÙNG transaction (F5)
   * + persist finalRationale (F38).
   */
  finalize(user: RequestUser, id: string, input: { finalRating: string; rationale: string; version: number }, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await this.mustGet(tx, id);
      if (r.status === 'final') throw new ConflictException('Đã final');
      if (r.finalScore == null) throw new UnprocessableEntityException('Chưa compute-score');
      if (r.revieweeId === user.claims.person_id) {
        throw new ConflictException('Không tự finalize review của chính mình (SoD)');
      }
      const reviewee = await tx.person.findFirst({ where: { id: r.revieweeId } });
      assertScope(user, { ownerPersonId: null, orgUnitId: reviewee?.orgUnitId }, 'rating:approve');

      const cycle = await tx.reviewCycle.findFirst({ where: { id: r.cycleId } });
      if (!cycle?.startDate || !cycle?.endDate) {
        throw new UnprocessableEntityException('Cycle thiếu khung thời gian');
      }

      // Governance: KPI evidence_required phải có evidence VERIFIED TRONG KỲ (F29)
      const sc = await tx.scorecard.findFirst({
        where: { id: r.scorecardId! },
        include: { items: { where: { deletedAt: null }, include: { kpi: true } } },
      });
      for (const it of sc?.items ?? []) {
        if (!it.kpi.evidenceRequired) continue;
        const count = await tx.evidence.count({
          where: {
            relatedKpiId: it.kpiId, ownerId: r.revieweeId, status: 'verified', deletedAt: null,
            occurredAt: { gte: cycle.startDate, lte: cycle.endDate },
          },
        });
        if (count === 0) {
          throw new UnprocessableEntityException(
            `KPI '${it.kpi.code}' yêu cầu evidence verified trong kỳ — chưa có (governance check)`,
          );
        }
      }

      // [F28] atomic conditional update — version + status trong WHERE
      const count = await tx.review.updateMany({
        where: {
          id, deletedAt: null,
          version: input.version,
          status: { in: ['manager_done', 'calibrated'] },
        },
        data: {
          finalRating: input.finalRating, finalRationale: input.rationale, status: 'final',
          approvedBy: user.claims.person_id ?? null, approvedAt: new Date(),
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (count.count !== 1) {
        throw new ConflictException(
          'Finalize thất bại — version lệch, trạng thái không hợp lệ, hoặc đã bị finalize song song (reload)',
        );
      }
      // [F5] audit CÙNG transaction — không thể final mà thiếu audit
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'rating.approve', entityType: 'review', entityId: id,
          before: { status: r.status, finalRating: r.finalRating, version: r.version } as any,
          after: { status: 'final', finalRating: input.finalRating, rationale: input.rationale } as any,
          ip,
        },
      });
      return tx.review.findFirst({ where: { id } });
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
