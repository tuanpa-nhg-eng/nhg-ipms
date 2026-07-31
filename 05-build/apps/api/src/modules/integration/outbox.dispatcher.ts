import { ForbiddenException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { exportDecision } from '@ipms/shared';
import { PrismaService } from '../../prisma.service';
import { DataCatalogService } from '../datacatalog/datacatalog.service';
import { ConnectorRegistry } from './connectors/connector.registry';

/**
 * [Trục C L6] Khai báo đường xuất của outbox — TRƯỚC ĐÂY nằm ở decorator `@Exported` trên
 * route HTTP; dời xuống đây vì worker không đi qua route đó. Giữ nguyên nội dung khai báo
 * (kể cả giả định về mã `system.log`, xem ghi chú ở `integration.controller.ts`).
 */
const OUTBOX_EXPORT = {
  asset: 'system.log',
  destination: 'integration_connector',
  destinationKind: 'external_service' as const,
};

/** Sau MAX_RETRY lần đẩy lỗi → dead-letter (không retry vô hạn). */
export const OUTBOX_MAX_RETRY = 5;

interface DispatchStats {
  scanned: number;
  dispatched: number;
  skipped: number; // không có binding outbound khớp
  retried: number;
  dead: number;
}

/**
 * Outbox dispatcher (#6 iPaaS+Outbox) — đọc outbox_event PENDING của MỘT tenant
 * (RLS giữ nguyên — không cross-tenant), đẩy tới mọi integration_binding outbound
 * khớp event qua connector (lát này: mock). Lỗi → retry_count++, quá MAX → dead.
 *
 * Kích hoạt 2 đường:
 * 1. API `POST /integrations/outbox/dispatch` (permission integration:run).
 * 2. BullMQ worker (env ENABLE_OUTBOX_WORKER=true — cần Redis): job theo tenant,
 *    enqueue debounce qua notify(tenantId) sau khi ghi outbox. Test/CI không cần Redis.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleDestroy {
  private logger = new Logger('OutboxDispatcher');
  private queue?: import('bullmq').Queue;
  private worker?: import('bullmq').Worker;

  constructor(
    private prisma: PrismaService,
    private connectors: ConnectorRegistry,
    private catalog: DataCatalogService,
  ) {
    if (process.env.ENABLE_OUTBOX_WORKER === 'true' && process.env.REDIS_URL) {
      // Nạp lười BullMQ — test/CI không đụng Redis
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Queue, Worker } = require('bullmq') as typeof import('bullmq');
      const connection = { url: process.env.REDIS_URL };
      this.queue = new Queue('outbox-dispatch', { connection });
      this.worker = new Worker(
        'outbox-dispatch',
        // [Trục C L6] Actor đi THEO JOB: người gây ra dòng dữ liệu này là người đã nạp dữ
        // liệu sinh ra outbox_event. Không có actor thì `dispatchTenant` từ chối đẩy — xem
        // ghi chú ở đó.
        async (job) => this.dispatchTenant(job.data.tenantId, 50, job.data.actorUserId),
        { connection, concurrency: 2 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`outbox job ${job?.id} failed: ${err.message}`));
      this.logger.log('BullMQ outbox worker ON');
    }
  }

  /** Gọi sau khi ghi outbox_event — debounce theo tenant (jobId cố định + delay). */
  notify(tenantId: string, actorUserId?: string): void {
    // [F61] removeOnFail bắt buộc: job fail mà ở lại failed-set thì jobId cố định
    // chặn mọi notify() sau đó vĩnh viễn (BullMQ bỏ qua add() trùng jobId mọi state)
    void this.queue
      ?.add('dispatch', { tenantId, actorUserId }, {
        jobId: `t-${tenantId}`, delay: 2_000,
        removeOnComplete: true, removeOnFail: true,
      })
      .catch((e) => this.logger.warn(`notify enqueue lỗi: ${e.message}`));
  }

  /**
   * [Trục C L6] Ghi vết một lần đẩy BỊ CHẶN — cùng action `export.blocked` mà `ExportGuard`
   * dùng, nên nó chảy thẳng vào bộ sinh cờ rủi ro của L4 mà không phải khai thêm luật nào.
   *
   * Dời cổng xuống service (để worker cũng đi qua) suýt làm MẤT nhánh này: guard ghi vết khi
   * chặn, service thì ban đầu chỉ ném lỗi. Driver sống bắt được — "chặn xuất nhưng không sinh
   * cờ". Bài học: khi dời một chốt kiểm soát, phải dời CẢ phần ghi vết của nó, không chỉ phần
   * từ chối; phần từ chối thì người dùng thấy ngay, phần ghi vết thì không ai thấy thiếu.
   */
  private async recordBlocked(
    tenantId: string, actorUserId: string, reason: string, classification: string,
  ) {
    try {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId, actorUserId,
            action: 'export.blocked', entityType: 'export_route', entityId: null,
            after: {
              route: 'service OutboxDispatcher.dispatchTenant',
              reason, asset: OUTBOX_EXPORT.asset, classification,
              destination: OUTBOX_EXPORT.destination,
              destination_kind: OUTBOX_EXPORT.destinationKind,
            } as object,
          },
        }),
      );
    } catch (e: any) {
      // Không nuốt im: request này đang bị từ chối vì lý do khác, nhưng mất vết là mất tín
      // hiệu an ninh — ghi log ứng dụng để còn dấu hiệu điều tra.
      this.logger.error(`không ghi được vết export.blocked: ${e?.message}`);
    }
  }

  /**
   * Đẩy tối đa `max` event pending của tenant. An toàn chạy lặp (idempotent theo sync_record).
   *
   * [Trục C L6 — trám nợ ghi từ L2] CỔNG XUẤT nằm Ở ĐÂY, không ở route HTTP.
   *
   * Từ L1 tới L5, `POST /integrations/outbox/dispatch` khai `@Exported` và `ExportGuard` gác
   * đúng như K2 đòi. Nhưng worker BullMQ gọi thẳng hàm này — không qua HTTP, không qua guard,
   * không ghi `export_log`. Nghĩa là đường đẩy dữ liệu ra ngoài CHẠY THẬT trong production
   * (worker) hoàn toàn nằm ngoài cổng, trong khi đường ít dùng hơn (bấm tay qua API) thì được
   * gác. Đúng họ với bài học `POST /ai/chat` — bề mặt không đi qua guard là bề mặt vô hình.
   *
   * Sửa bằng cách dời cổng xuống tầng service: cả hai người gọi đều đi qua cùng một phép kiểm
   * và cùng một lần ghi vết. Route HTTP đổi sang `@ExportExempt` (kèm lý do trỏ về đây) để
   * KHÔNG ghi vết hai lần.
   *
   * `actorUserId` bắt buộc: không có người chịu trách nhiệm thì không đẩy. Với worker, actor
   * đi theo job từ `notify()` — người đã nạp dữ liệu sinh ra event. Fail-closed ở đây có giá
   * đúng chỗ: một job thiếu actor sẽ fail và event nằm lại `pending`, chứ dữ liệu không rời hệ.
   */
  async dispatchTenant(tenantId: string, max = 50, actorUserId?: string): Promise<DispatchStats> {
    const stats: DispatchStats = { scanned: 0, dispatched: 0, skipped: 0, retried: 0, dead: 0 };

    if (!actorUserId) {
      throw new ForbiddenException(
        'Đẩy outbox phải có người chịu trách nhiệm (K2) — job thiếu actor thì event nằm lại pending.',
      );
    }
    const { classification } = await this.catalog.resolve(tenantId, OUTBOX_EXPORT.asset);
    const verdict = exportDecision(classification, OUTBOX_EXPORT.destinationKind);
    if (!verdict.allowed) {
      await this.recordBlocked(tenantId, actorUserId, verdict.rule, classification);
      throw new ForbiddenException(
        `Chặn đẩy outbox: '${OUTBOX_EXPORT.asset}' (${classification}) → `
        + `${OUTBOX_EXPORT.destination}: ${verdict.rule}`,
      );
    }
    if (verdict.requires) {
      await this.recordBlocked(
        tenantId, actorUserId, `thiếu quyền '${verdict.requires}' (job nền không mang quyền của ai)`,
        classification,
      );
      // Worker KHÔNG mang theo quyền của ai (nó không chạy trong ngữ cảnh request). Nên mọi
      // mã dữ liệu cần quyền bổ sung đều không đẩy tự động được — fail-closed đúng chiều: một
      // ngày nào đó có người đổi `system.log` thành `confidential`, đường này ĐÓNG chứ không
      // âm thầm mang dữ liệu nhạy cảm ra ngoài bằng quyền của một tiến trình nền.
      throw new ForbiddenException(
        `Đẩy outbox tự động không mang được quyền '${verdict.requires}' — `
        + `'${OUTBOX_EXPORT.asset}' hiện ở mức '${classification}', cần người bấm qua API có quyền đó.`,
      );
    }

    // Nạp events + bindings outbound (1 transaction đọc)
    const { events, bindings, connections } = await this.prisma.withTenant(tenantId, async (tx) => {
      // [F62-recovery] event kẹt 'processing' >10 phút (process chết giữa chừng) → trả về pending
      await tx.outboxEvent.updateMany({
        where: { status: 'processing', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } },
        data: { status: 'pending' },
      });
      const events = await tx.outboxEvent.findMany({
        where: { status: 'pending' },
        orderBy: { id: 'asc' },
        take: max,
      });
      const bindings = await tx.integrationBinding.findMany({
        where: { status: 'active', direction: { in: ['out', 'both'] }, deletedAt: null },
      });
      // [F63] connection bị disable/revoke không được đẩy dữ liệu qua
      const connections = await tx.integrationConnection.findMany({
        where: { id: { in: bindings.map((b) => b.connectionId) }, status: 'active', deletedAt: null },
      });
      return { events, bindings, connections };
    });
    const connById = new Map(connections.map((c) => [c.id, c]));

    for (const event of events) {
      // [F62] CLAIM chống double-push: chuyển pending→processing bằng conditional update;
      // dispatcher khác (API song song worker) claim trượt → bỏ qua event này
      const claimed = await this.prisma.withTenant(tenantId, (tx) =>
        tx.outboxEvent.updateMany({
          where: { id: event.id, status: 'pending' },
          data: { status: 'processing' },
        }),
      );
      if (claimed.count !== 1) continue;

      stats.scanned += 1;
      const matched = bindings.filter((b) => {
        const policy = (b.syncPolicy ?? {}) as { events?: string[] };
        return !policy.events?.length || policy.events.includes(event.eventType);
      });

      if (matched.length === 0) {
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'skipped', dispatchedAt: new Date() },
          }),
        );
        stats.skipped += 1;
        continue;
      }

      try {
        for (const binding of matched) {
          const conn = connById.get(binding.connectionId);
          if (!conn || !this.connectors.has(conn.provider)) {
            throw new Error(`connection/provider không khả dụng cho binding ${binding.id}`);
          }
          const connector = this.connectors.resolve(conn.provider);
          const externalId = `obx-${event.id}`;
          const [pushed] = await connector.push(tenantId, binding.externalTarget as any, [{
            externalId,
            data: { eventType: event.eventType, aggregateType: event.aggregateType, payload: event.payload },
          }]);
          // sync_record idempotent theo (tenant, binding, external_id)
          await this.prisma.withTenant(tenantId, async (tx) => {
            const existing = await tx.syncRecord.findFirst({
              where: { bindingId: binding.id, externalId },
            });
            if (existing) {
              await tx.syncRecord.update({
                where: { id: existing.id },
                data: { externalEtag: pushed.etag, lastSyncedAt: new Date(), status: 'in_sync' },
              });
            } else {
              await tx.syncRecord.create({
                data: {
                  id: uuidv7(), tenantId, bindingId: binding.id,
                  localType: event.aggregateType, localId: event.aggregateId,
                  externalId, externalEtag: pushed.etag,
                  lastSyncedAt: new Date(), status: 'in_sync',
                },
              });
            }
          });
        }
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'dispatched', dispatchedAt: new Date() },
          }),
        );
        stats.dispatched += 1;
      } catch (e) {
        const retryCount = event.retryCount + 1;
        const dead = retryCount >= OUTBOX_MAX_RETRY;
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.outboxEvent.update({
            where: { id: event.id },
            data: { retryCount, status: dead ? 'dead' : 'pending' },
          }),
        );
        if (dead) stats.dead += 1;
        else stats.retried += 1;
        this.logger.warn(`event ${event.id} đẩy lỗi (retry ${retryCount}/${OUTBOX_MAX_RETRY}): ${(e as Error).message}`);
      }
    }
    // Ghi vết MỘT LẦN cho cả hai đường gọi (API + worker). `recordCount` = số event thực sự
    // đẩy đi; một lượt quét không đẩy gì vẫn ghi vết (0) — "không có gì để đẩy" cũng là một
    // sự thật kiểm toán được, và im lặng ở đây sẽ làm sổ vết trông như worker chưa từng chạy.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.exportLog.create({
        data: {
          tenantId, actorUserId,
          assetCode: OUTBOX_EXPORT.asset,
          classification,
          destination: OUTBOX_EXPORT.destination,
          destinationKind: OUTBOX_EXPORT.destinationKind,
          recordCount: stats.dispatched,
          route: 'service OutboxDispatcher.dispatchTenant',
          rule: verdict.rule,
        },
      }),
    );

    return stats;
  }

  /**
   * [F65] Replay event skipped/dead → pending để dispatch quét lại.
   * Dùng khi: (skipped) tenant vừa thêm binding khớp event cũ · (dead) sự cố hệ ngoài
   * đã khắc phục. Reset retry_count để dead-letter được chu kỳ retry mới đầy đủ.
   * Per-tenant qua RLS; idempotent theo sync_record như dispatch bình thường.
   */
  async replayTenant(
    tenantId: string, status: 'skipped' | 'dead', eventIds?: bigint[],
  ): Promise<{ replayed: number }> {
    const result = await this.prisma.withTenant(tenantId, (tx) =>
      tx.outboxEvent.updateMany({
        where: { status, ...(eventIds?.length ? { id: { in: eventIds } } : {}) },
        data: { status: 'pending', retryCount: 0, dispatchedAt: null },
      }),
    );
    return { replayed: result.count };
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
