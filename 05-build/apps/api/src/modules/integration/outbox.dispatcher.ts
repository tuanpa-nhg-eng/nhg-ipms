import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { ConnectorRegistry } from './connectors/connector.registry';

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

  constructor(private prisma: PrismaService, private connectors: ConnectorRegistry) {
    if (process.env.ENABLE_OUTBOX_WORKER === 'true' && process.env.REDIS_URL) {
      // Nạp lười BullMQ — test/CI không đụng Redis
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Queue, Worker } = require('bullmq') as typeof import('bullmq');
      const connection = { url: process.env.REDIS_URL };
      this.queue = new Queue('outbox-dispatch', { connection });
      this.worker = new Worker(
        'outbox-dispatch',
        async (job) => this.dispatchTenant(job.data.tenantId),
        { connection, concurrency: 2 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`outbox job ${job?.id} failed: ${err.message}`));
      this.logger.log('BullMQ outbox worker ON');
    }
  }

  /** Gọi sau khi ghi outbox_event — debounce theo tenant (jobId cố định + delay). */
  notify(tenantId: string): void {
    // [F61] removeOnFail bắt buộc: job fail mà ở lại failed-set thì jobId cố định
    // chặn mọi notify() sau đó vĩnh viễn (BullMQ bỏ qua add() trùng jobId mọi state)
    void this.queue
      ?.add('dispatch', { tenantId }, {
        jobId: `t-${tenantId}`, delay: 2_000,
        removeOnComplete: true, removeOnFail: true,
      })
      .catch((e) => this.logger.warn(`notify enqueue lỗi: ${e.message}`));
  }

  /** Đẩy tối đa `max` event pending của tenant. An toàn chạy lặp (idempotent theo sync_record). */
  async dispatchTenant(tenantId: string, max = 50): Promise<DispatchStats> {
    const stats: DispatchStats = { scanned: 0, dispatched: 0, skipped: 0, retried: 0, dead: 0 };

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
