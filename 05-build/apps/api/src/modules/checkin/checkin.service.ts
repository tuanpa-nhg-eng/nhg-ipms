import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { GoalService } from '../strategy/goal.service';
import { assertScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

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
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.checkin.findMany({
        where: { deletedAt: null, ...(personId ? { personId } : {}) },
        include: { goalUpdates: { where: { deletedAt: null } } },
        orderBy: { periodKey: 'desc' },
        take: 100,
      }),
    );
  }

  /**
   * Nộp check-in: tạo bản ghi checkin (unique person+cadence+period) + goal updates;
   * tiến độ goal lá chảy vào GoalService.updateProgress → health roll-up (F17 lock).
   * Check-in là CỦA CHÍNH MÌNH (scope self) — manager/HR không nộp thay.
   */
  async submit(user: RequestUser, input: SubmitCheckinInput) {
    const personId = user.claims.person_id;
    if (!personId) throw new UnprocessableEntityException('Token không gắn person');

    const checkin = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.checkin.findFirst({
        where: { personId, cadence: input.cadence, periodKey: input.periodKey, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Đã có check-in ${input.cadence}/${input.periodKey}`);

      // goal phải tồn tại và là goal CỦA MÌNH (self) — kiểm trước khi ghi
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
      }
      return ck;
    });

    // Tiến độ chảy vào goal health (transaction riêng có advisory lock — F17)
    for (const gu of input.goalUpdates) {
      await this.goals.updateProgress(user, gu.goalId, gu.progressPct);
    }

    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.checkin.findFirst({ where: { id: checkin.id }, include: { goalUpdates: true } }),
    );
  }

  /** Manager nhận xét check-in (human-in-the-loop) — scope org_unit/tenant. */
  review(user: RequestUser, checkinId: string, managerComment: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const ck = await tx.checkin.findFirst({ where: { id: checkinId, deletedAt: null } });
      if (!ck) throw new NotFoundException('Check-in not found');
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
