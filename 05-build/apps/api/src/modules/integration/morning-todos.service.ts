import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { ConnectorRegistry } from './connectors/connector.registry';

/**
 * Job "morning-todos" (Spec Config Studio §8 + master prompt ⑥):
 * mỗi sáng đẩy danh sách việc check-in từ goal ACTIVE/AT_RISK/OFF_TRACK của từng người
 * sang MS Planner/To-Do/Notion qua binding `local_type='morning_todos'`.
 * Lát 4b: mock connector (RED-LINE #2). IDEMPOTENT theo (binding, todo-<date>-<goalId>)
 * qua sync_record — chạy lại cùng ngày không nhân đôi.
 */
@Injectable()
export class MorningTodosService {
  constructor(private prisma: PrismaService, private connectors: ConnectorRegistry) {}

  async run(user: RequestUser, dateInput?: string) {
    const date = dateInput ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new UnprocessableEntityException('date phải dạng YYYY-MM-DD');
    }

    // 1. binding morning_todos outbound + connection provider hỗ trợ
    const { binding, conn, goals, owners } = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const binding = await tx.integrationBinding.findFirst({
        where: {
          localType: 'morning_todos', status: 'active',
          direction: { in: ['out', 'both'] }, deletedAt: null,
        },
      });
      if (!binding) {
        throw new UnprocessableEntityException(
          "Chưa cấu hình binding local_type='morning_todos' (direction out)",
        );
      }
      const conn = await tx.integrationConnection.findFirst({
        where: { id: binding.connectionId, deletedAt: null },
      });
      const goals = await tx.goal.findMany({
        where: { status: { in: ['active', 'at_risk', 'off_track'] }, deletedAt: null },
        select: { id: true, nameVi: true, ownerId: true, status: true, healthScore: true, period: true },
        orderBy: { id: 'asc' },
      });
      // chỉ lấy employeeCode — không kéo PII thừa vào process (chuẩn ẩn danh dự án)
      const owners = await tx.person.findMany({
        where: { id: { in: [...new Set(goals.map((g) => g.ownerId))] } },
        select: { id: true, employeeCode: true },
      });
      return { binding, conn, goals, owners };
    });
    if (!conn || !this.connectors.has(conn.provider)) {
      throw new UnprocessableEntityException(
        `Connection của binding morning_todos không khả dụng (provider mock: notion/ms_planner/ms_todo)`,
      );
    }
    const connector = this.connectors.resolve(conn.provider);
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    // 2. mở run
    const run = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.integrationRun.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, connectionId: conn.id, bindingId: binding.id,
          type: 'push', startedAt: new Date(), status: 'running', createdBy: user.claims.sub,
        },
      }),
    );

    try {
      let pushed = 0;
      let skipped = 0;
      for (const goal of goals) {
        const externalId = `todo-${date}-${goal.id}`;
        // idempotent: đã sync hôm nay → bỏ qua
        const existed = await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.syncRecord.findFirst({ where: { bindingId: binding.id, externalId } }),
        );
        if (existed) {
          skipped += 1;
          continue;
        }
        const owner = ownerById.get(goal.ownerId);
        const [res] = await connector.push(user.tenantId, binding.externalTarget as any, [{
          externalId,
          data: {
            title: `Check-in: ${goal.nameVi}`,
            date, goalId: goal.id, period: goal.period,
            goalStatus: goal.status, health: goal.healthScore != null ? Number(goal.healthScore) : null,
            // ẩn danh chuẩn dự án: chỉ mã nhân viên, không đẩy PII thừa ra hệ ngoài
            ownerEmployeeCode: owner?.employeeCode ?? null,
          },
        }]);
        try {
          await this.prisma.withTenant(user.tenantId, (tx) =>
            tx.syncRecord.create({
              data: {
                id: uuidv7(), tenantId: user.tenantId, bindingId: binding.id,
                localType: 'goal', localId: goal.id,
                externalId, externalEtag: res.etag, lastSyncedAt: new Date(), status: 'in_sync',
              },
            }),
          );
          pushed += 1;
        } catch (e: any) {
          // [F67] 2 run song song cùng ngày: run kia vừa tạo record (unique P2002)
          // → duplicate vô hại, đếm skipped thay vì fail cả run
          if (e?.code === 'P2002') skipped += 1;
          else throw e;
        }
      }

      const stats = { date, goals: goals.length, pushed, skipped, provider: conn.provider };
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.integrationRun.update({
          where: { id: run.id },
          data: { status: 'success', finishedAt: new Date(), stats: stats as any },
        }),
      );
      return { runId: run.id, ...stats };
    } catch (e) {
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.integrationRun.update({
          where: { id: run.id },
          data: { status: 'failed', finishedAt: new Date(), error: { message: (e as Error).message } as any },
        }),
      ).catch(() => undefined);
      throw e;
    }
  }
}
