import { Controller, Get, Query, UnprocessableEntityException } from '@nestjs/common';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma.service';

/** reward_map mặc định (TDD §7.4) — override qua tenant.settings.reward_map. */
const DEFAULT_REWARD_MAP: Array<{ grade: string; ratio: number }> = [
  { grade: 'A+', ratio: 1.0 },
  { grade: 'A', ratio: 0.8 },
  { grade: 'B', ratio: 0.6 },
  { grade: 'C', ratio: 0.3 },
  { grade: 'D', ratio: 0 },
];

/**
 * Export OneOffice — TDD §10.3. Giả định mặc định đã chốt: OneOffice nhận FILE
 * theo template (API sau khi có spec) → endpoint trả payload JSON chuẩn để
 * sinh file. CHỈ review đã FINAL (human đã duyệt) mới vào bảng lương.
 */
@Controller('export')
export class ExportController {
  constructor(private prisma: PrismaService) {}

  @Get('payroll')
  @RequirePermission('payroll:export')
  async payroll(@CurrentUser() user: RequestUser, @Query('cycle') cycleId?: string) {
    if (!cycleId) throw new UnprocessableEntityException('Thiếu ?cycle=<review_cycle_id>');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cycle = await tx.reviewCycle.findFirst({ where: { id: cycleId, deletedAt: null } });
      if (!cycle) throw new UnprocessableEntityException('Cycle not found');

      const tenant = await tx.tenant.findFirst({ where: { deletedAt: null } });
      const cfg = (tenant?.settings as any)?.reward_map;
      const rewardMap: Array<{ grade: string; ratio: number }> =
        Array.isArray(cfg) && cfg.length > 0 &&
        cfg.every((r: any) => typeof r?.grade === 'string' && typeof r?.ratio === 'number')
          ? cfg
          : DEFAULT_REWARD_MAP;
      const ratioByGrade = new Map(rewardMap.map((r) => [r.grade, r.ratio]));

      const finals = await tx.review.findMany({
        where: { cycleId, status: 'final', deletedAt: null },
      });
      const persons = await tx.person.findMany({
        where: { id: { in: finals.map((r) => r.revieweeId) } },
      });
      const personById = new Map(persons.map((p) => [p.id, p]));

      const records = [];
      for (const r of finals) {
        const p = personById.get(r.revieweeId);
        // evidence_complete: mọi KPI evidence_required của scorecard có verified evidence
        // (đã được đảm bảo bởi governance check lúc finalize → true theo thiết kế)
        records.push({
          employee_code: p?.employeeCode ?? 'UNKNOWN',
          final_score: r.finalScore != null ? Number(r.finalScore) : null,
          ipc_grade: r.ipcGrade,
          final_rating: r.finalRating,
          reward_ratio: r.ipcGrade != null ? (ratioByGrade.get(r.ipcGrade) ?? 0) : 0,
          evidence_complete: true,
        });
      }
      return { cycle: cycle.period, tenant: tenant?.code, generated_at: new Date().toISOString(), records };
    });
  }
}
