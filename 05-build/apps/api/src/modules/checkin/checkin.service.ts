import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { GoalService } from '../strategy/goal.service';
import { assertScope, effectiveScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

/** [F37] periodKey đúng format theo cadence. */
function validatePeriodKey(cadence: string, periodKey: string): void {
  const patterns: Record<string, RegExp> = {
    weekly: /^\d{4}-W\d{2}$/,      // 2026-W26
    monthly: /^\d{4}-\d{2}$/,      // 2026-07
    quarterly: /^\d{4}-Q[1-4]$/,   // 2026-Q3
    yearly: /^\d{4}$/,             // 2026
  };
  if (!patterns[cadence]?.test(periodKey)) {
    throw new UnprocessableEntityException(
      `periodKey '${periodKey}' sai format cho cadence '${cadence}' (vd: monthly=YYYY-MM, weekly=YYYY-Wnn)`,
    );
  }
}

export interface SubmitCheckinInput {
  cadence: string;   // weekly|monthly|quarterly|yearly
  periodKey: string; // '2026-07'
  progressNote?: string;
  blocker?: string;
  goalUpdates: Array<{ goalId: string; progressPct: number; note?: string }>;
}

@Injectable()
export class CheckinService {
  constructor(private prisma: PrismaService, private goals: GoalService) {}

  list(user: RequestUser, personId?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // [F32] lọc theo scope: self → chỉ của mình; org_unit → người trong đơn vị phụ trách
      const scope = effectiveScope(user);
      let scopeWhere: Record<string, unknown> = {};
      if (scope.mode === 'scoped') {
        const or: Record<string, unknown>[] = [];
        if (scope.selfPersonId) or.push({ personId: scope.selfPersonId });
        if (scope.orgUnitIds.length > 0) {
          const members = await tx.person.findMany({
            where: { orgUnitId: { in: scope.orgUnitIds }, deletedAt: null },
            select: { id: true },
          });
          or.push({ personId: { in: members.map((m) => m.id) } });
        }
        scopeWhere = or.length > 0 ? { OR: or } : { personId: '00000000-0000-0000-0000-000000000000' };
      }
      return tx.checkin.findMany({
        where: { deletedAt: null, ...scopeWhere, ...(personId ? { personId } : {}) },
        include: { goalUpdates: { where: { deletedAt: null } } },
        orderBy: { periodKey: 'desc' },
        take: 100,
      });
    });
  }

  /**
   * Nộp check-in: tạo bản ghi checkin (unique person+cadence+period) + goal updates;
   * tiến độ goal lá chảy vào GoalService.updateProgress → health roll-up (F17 lock).
   * Check-in là CỦA CHÍNH MÌNH (scope self) — manager/HR không nộp thay.
   */
  async submit(user: RequestUser, input: SubmitCheckinInput) {
    const personId = user.claims.person_id;
    if (!personId) throw new UnprocessableEntityException('Token không gắn person');

    // [F37] validate periodKey theo cadence
    validatePeriodKey(input.cadence, input.periodKey);

    // [F34] TOÀN BỘ trong MỘT transaction: checkin + goal updates + health roll-up
    // — không còn partial state (fail bất kỳ đâu → rollback tất cả).
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.checkin.findFirst({
        where: { personId, cadence: input.cadence, periodKey: input.periodKey, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Đã có check-in ${input.cadence}/${input.periodKey}`);
      // (double-submit song song: unique index bắn P2002 → filter map 409 — F36)

      for (const gu of input.goalUpdates) {
        const goal = await tx.goal.findFirst({ where: { id: gu.goalId, deletedAt: null } });
        if (!goal) throw new UnprocessableEntityException(`Goal ${gu.goalId} not found`);
        assertScope(user, { ownerPersonId: goal.ownerId, orgUnitId: goal.orgUnitId }, 'checkin:goal-update');
      }

      const ck = await tx.checkin.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, personId,
          cadence: input.cadence, periodKey: input.periodKey,
          progressNote: input.progressNote, blocker: input.blocker,
          status: 'submitted',
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      for (const gu of input.goalUpdates) {
        await tx.checkinGoalUpdate.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, checkinId: ck.id,
            goalId: gu.goalId, progressPct: gu.progressPct, note: gu.note,
          },
        });
        await this.goals.updateProgressInTx(tx, user, gu.goalId, gu.progressPct);
      }
      return tx.checkin.findFirst({ where: { id: ck.id }, include: { goalUpdates: true } });
    });
  }

  /** Manager nhận xét check-in (human-in-the-loop) — scope org_unit/tenant. */
  review(user: RequestUser, checkinId: string, managerComment: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const ck = await tx.checkin.findFirst({ where: { id: checkinId, deletedAt: null } });
      if (!ck) throw new NotFoundException('Check-in not found');
      if (ck.personId === user.claims.person_id) {
        throw new ConflictException('Không tự review check-in của chính mình (SoD)'); // [F41]
      }
      if (ck.status !== 'submitted') throw new ConflictException(`Check-in ở trạng thái ${ck.status}`);
      const person = await tx.person.findFirst({ where: { id: ck.personId } });
      assertScope(user, { ownerPersonId: ck.personId, orgUnitId: person?.orgUnitId }, 'checkin:review');
      return tx.checkin.update({
        where: { id: checkinId },
        data: { managerComment, status: 'reviewed', updatedBy: user.claims.sub, version: { increment: 1 } },
      });
    });
  }
}
