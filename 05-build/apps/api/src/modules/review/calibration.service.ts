import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

@Injectable()
export class CalibrationService {
  constructor(private prisma: PrismaService) {}

  createSession(user: RequestUser, input: { cycleId?: string; orgUnitId?: string }) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.calibrationSession.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          cycleId: input.cycleId, orgUnitId: input.orgUnitId, status: 'running',
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      }),
    );
  }

  /**
   * Quyết định calibration: đổi proposed rating + status='calibrated'.
   * Governance TDD §12: rationale BẮT BUỘC; ghi before/after; audit CÙNG transaction (F5).
   * KHÔNG đổi review đã final.
   */
  decide(
    user: RequestUser,
    input: { sessionId: string; reviewId: string; ratingAfter: string; rationale: string },
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const session = await tx.calibrationSession.findFirst({
        where: { id: input.sessionId, deletedAt: null },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'running') throw new ConflictException('Session không ở trạng thái running');

      const review = await tx.review.findFirst({ where: { id: input.reviewId, deletedAt: null } });
      if (!review) throw new NotFoundException('Review not found');
      if (review.status === 'final') throw new ConflictException('Review đã final — không calibrate');
      if (review.status !== 'manager_done' && review.status !== 'calibrated') {
        throw new UnprocessableEntityException(`Cần manager_done trước (hiện: ${review.status})`);
      }
      if (review.revieweeId === user.claims.person_id) {
        throw new ConflictException('Không calibrate review của chính mình (SoD)');
      }

      const decision = await tx.calibrationDecision.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          sessionId: input.sessionId, reviewId: input.reviewId,
          ratingBefore: review.proposedRating, ratingAfter: input.ratingAfter,
          rationale: input.rationale, decidedBy: user.claims.person_id ?? null,
        },
      });
      await tx.review.update({
        where: { id: input.reviewId },
        data: {
          proposedRating: input.ratingAfter, status: 'calibrated',
          updatedBy: user.claims.sub, version: { increment: 1 },
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
