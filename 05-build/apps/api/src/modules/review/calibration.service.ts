import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

@Injectable()
export class CalibrationService {
  constructor(private prisma: PrismaService) {}

  /**
   * [Trục A — L1] Đọc phiên cân chỉnh. Trước lát này calibration CHỈ có POST ⇒ mở màn
   * /hr/calibration là mất trắng phiên đang chạy, không xem lại được quyết định đã ra.
   *
   * Permission `calibration:run` (hrbp/admin) — cố ý KHÔNG hạ xuống review:read: bảng
   * quyết định cân chỉnh lộ rating so sánh giữa các cá nhân, rộng hơn nhiều so với
   * "đọc review trong phạm vi của mình". Vì permission đã hẹp (scope tenant), không
   * lọc scope thêm ở đây; nếu sau này cấp cho vai scope org_unit thì PHẢI lọc như
   * ReviewService.list().
   */
  listSessions(user: RequestUser, filter: { cycleId?: string } = {}) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const sessions = await tx.calibrationSession.findMany({
        where: { deletedAt: null, ...(filter.cycleId ? { cycleId: filter.cycleId } : {}) },
        select: {
          id: true, cycleId: true, orgUnitId: true, status: true,
          scheduledAt: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      // Đếm quyết định trong 1 lượt (không N+1 theo số phiên)
      const counts = sessions.length
        ? await tx.calibrationDecision.groupBy({
            by: ['sessionId'],
            where: { sessionId: { in: sessions.map((s) => s.id) }, deletedAt: null },
            _count: { _all: true },
          })
        : [];
      const byId = new Map(counts.map((c) => [c.sessionId, c._count._all]));
      return sessions.map((s) => ({ ...s, decisionCount: byId.get(s.id) ?? 0 }));
    });
  }

  /** Chi tiết 1 phiên + các quyết định (kèm tên người được cân chỉnh để hiển thị). */
  getSession(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const session = await tx.calibrationSession.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true, cycleId: true, orgUnitId: true, status: true,
          scheduledAt: true, createdAt: true, updatedAt: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const decisions = await tx.calibrationDecision.findMany({
        where: { sessionId: id, deletedAt: null },
        select: {
          id: true, reviewId: true, ratingBefore: true, ratingAfter: true,
          rationale: true, decidedBy: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      // Gộp tên reviewee: 2 query, không lặp theo số quyết định.
      const reviews = decisions.length
        ? await tx.review.findMany({
            where: { id: { in: [...new Set(decisions.map((d) => d.reviewId))] } },
            select: { id: true, revieweeId: true, status: true },
          })
        : [];
      const persons = reviews.length
        ? await tx.person.findMany({
            where: { id: { in: [...new Set(reviews.map((r) => r.revieweeId))] } },
            select: { id: true, fullName: true, employeeCode: true },
          })
        : [];
      const personById = new Map(persons.map((p) => [p.id, p]));
      const reviewById = new Map(reviews.map((r) => [r.id, r]));

      return {
        ...session,
        decisions: decisions.map((d) => {
          const rv = reviewById.get(d.reviewId);
          const p = rv ? personById.get(rv.revieweeId) : undefined;
          return {
            ...d,
            reviewStatus: rv?.status ?? null,
            reviewee: p ? { id: p.id, fullName: p.fullName, employeeCode: p.employeeCode } : null,
          };
        }),
      };
    });
  }

  createSession(user: RequestUser, input: { cycleId?: string; orgUnitId?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // [F40] validate tham chiếu tồn tại
      if (input.cycleId) {
        const c = await tx.reviewCycle.findFirst({ where: { id: input.cycleId, deletedAt: null } });
        if (!c) throw new UnprocessableEntityException('Cycle not found');
      }
      if (input.orgUnitId) {
        const o = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!o) throw new UnprocessableEntityException('Org unit not found');
      }
      return tx.calibrationSession.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          cycleId: input.cycleId, orgUnitId: input.orgUnitId, status: 'running',
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  /**
   * Quyết định calibration: đổi proposed rating + status='calibrated'.
   * Governance TDD §12: rationale BẮT BUỘC; ghi before/after; audit CÙNG transaction (F5).
   * KHÔNG đổi review đã final.
   */
  decide(
    user: RequestUser,
    input: { sessionId: string; reviewId: string; ratingAfter: string; rationale: string; version: number },
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const session = await tx.calibrationSession.findFirst({
        where: { id: input.sessionId, deletedAt: null },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'running') throw new ConflictException('Session không ở trạng thái running');

      const review = await tx.review.findFirst({ where: { id: input.reviewId, deletedAt: null } });
      if (!review) throw new NotFoundException('Review not found');
      // [F40] review phải thuộc cycle của session (nếu session gắn cycle)
      if (session.cycleId && review.cycleId !== session.cycleId) {
        throw new UnprocessableEntityException('Review không thuộc cycle của session');
      }
      if (review.revieweeId === user.claims.person_id) {
        throw new ConflictException('Không calibrate review của chính mình (SoD)');
      }

      // [F28] atomic conditional update — version + status trong WHERE, chống race với finalize
      const count = await tx.review.updateMany({
        where: {
          id: input.reviewId, deletedAt: null,
          version: input.version,
          status: { in: ['manager_done', 'calibrated'] },
        },
        data: {
          proposedRating: input.ratingAfter, status: 'calibrated',
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (count.count !== 1) {
        throw new ConflictException(
          'Calibrate thất bại — version lệch, review đã final, hoặc trạng thái không hợp lệ (reload)',
        );
      }

      const decision = await tx.calibrationDecision.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          sessionId: input.sessionId, reviewId: input.reviewId,
          ratingBefore: review.proposedRating, ratingAfter: input.ratingAfter,
          rationale: input.rationale, decidedBy: user.claims.person_id ?? null,
        },
      });
      // [F5] audit cùng transaction
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'calibration.decide', entityType: 'review', entityId: input.reviewId,
          before: { proposedRating: review.proposedRating, status: review.status } as any,
          after: { proposedRating: input.ratingAfter, status: 'calibrated', rationale: input.rationale } as any,
        },
      });
      return decision;
    });
  }
}
