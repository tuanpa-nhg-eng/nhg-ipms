import {
  Injectable, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { EvidenceService, BulkEvidenceRecord } from '../evidence/evidence.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * ⑥ Integration Hub — lát CSV/ETL (fallback đã chốt cho AIC/Salesforce/CRM).
 * Pipeline TDD §10.1 + Spec §8.5: rows → validate(data_contract) → map →
 * upsert evidence idempotent → integration_run stats → outbox_event.
 * Notion/MS Planner: lát sau (cần token thật — chạm RED-LINE nếu đẩy data thật).
 */

interface ContractSchema {
  required?: string[];
  fields?: Record<string, { type: 'string' | 'number' | 'boolean' }>;
}

@Injectable()
export class IntegrationService {
  constructor(
    private prisma: PrismaService,
    private evidence: EvidenceService,
    private outbox: OutboxDispatcher,
  ) {}

  /** Binding local↔external (lát 4b) — connection phải tồn tại trong tenant. */
  createBinding(user: RequestUser, input: {
    connectionId: string; localType: string; localId?: string; direction: string;
    externalTarget?: Record<string, unknown>; fieldMap: Record<string, unknown>;
    syncPolicy?: Record<string, unknown>;
  }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const conn = await tx.integrationConnection.findFirst({
        where: { id: input.connectionId, deletedAt: null },
      });
      if (!conn) throw new UnprocessableEntityException('connectionId không tồn tại trong tenant');
      return tx.integrationBinding.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, connectionId: conn.id,
          localType: input.localType, localId: input.localId,
          direction: input.direction,
          externalTarget: (input.externalTarget ?? undefined) as any,
          fieldMap: input.fieldMap as any,
          syncPolicy: (input.syncPolicy ?? undefined) as any,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  createConnection(user: RequestUser, input: { provider: string; displayName?: string; config?: Record<string, unknown> }) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.integrationConnection.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          provider: input.provider, displayName: input.displayName,
          config: (input.config ?? {}) as any,
          // authRef: gắn khi có Key Vault — KHÔNG bao giờ nhận token thô qua API
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      }),
    );
  }

  createContract(user: RequestUser, input: { provider: string; direction?: string; schema: ContractSchema }) {
    if (!input.schema || (!input.schema.required?.length && !input.schema.fields)) {
      throw new UnprocessableEntityException('Contract schema cần required[] hoặc fields{}');
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.dataContract.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          provider: input.provider, direction: input.direction ?? 'in',
          schema: input.schema as any, createdBy: user.claims.sub,
        },
      }),
    );
  }

  listRuns(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.integrationRun.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  /**
   * Import CSV (đã parse thành rows JSON phía client/CLI):
   * validate từng row theo data_contract (tenant → fallback global provider='csv')
   * → map sang evidence bulk → run stats. Row lỗi contract vào failed[], không chặn row khác.
   */
  async importCsv(
    user: RequestUser,
    input: { sourceSystem: string; connectionId?: string; rows: Array<Record<string, unknown>> },
  ) {
    // 1. mở run (transaction riêng — run phải tồn tại kể cả import fail)
    const run = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.integrationRun.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          connectionId: input.connectionId, type: 'pull',
          startedAt: new Date(), status: 'running', createdBy: user.claims.sub,
        },
      }),
    );

    try {
      // 2. load contract (tenant ưu tiên, fallback global)
      const contract = await this.prisma.withTenant(user.tenantId, async (tx) => {
        const own = await tx.dataContract.findFirst({
          where: { provider: 'csv', direction: 'in', tenantId: user.tenantId, deletedAt: null },
          orderBy: { version: 'desc' },
        });
        if (own) return own;
        return tx.dataContract.findFirst({
          where: { provider: 'csv', direction: 'in', tenantId: null, deletedAt: null },
          orderBy: { version: 'desc' },
        });
      });

      // 3. validate theo contract
      const schema = (contract?.schema ?? { required: ['externalId', 'type'] }) as ContractSchema;
      const valid: BulkEvidenceRecord[] = [];
      const contractFailed: Array<{ row: number; issue: string }> = [];
      input.rows.forEach((row, i) => {
        for (const req of schema.required ?? []) {
          if (row[req] == null || row[req] === '') {
            contractFailed.push({ row: i, issue: `thiếu field bắt buộc '${req}' (data_contract v${contract?.version ?? 'default'})` });
            return;
          }
        }
        for (const [name, def] of Object.entries(schema.fields ?? {})) {
          if (row[name] != null && typeof row[name] !== def.type) {
            contractFailed.push({ row: i, issue: `field '${name}' phải là ${def.type}` });
            return;
          }
        }
        valid.push({
          externalId: String(row.externalId),
          type: String(row.type),
          occurredAt: row.occurredAt ? String(row.occurredAt) : undefined,
          uri: row.uri ? String(row.uri) : undefined,
          payload: (row.payload as Record<string, unknown>) ??
            (typeof row.value === 'number' ? { value: row.value } : undefined),
          relatedKpiCode: row.relatedKpiCode ? String(row.relatedKpiCode) : undefined,
          ownerEmployeeCode: row.ownerEmployeeCode ? String(row.ownerEmployeeCode) : undefined,
          taskCellRef: row.taskCellRef ? String(row.taskCellRef) : undefined,
        });
      });

      // 4. upsert idempotent (tái dùng pipeline evidence — F13-safe)
      const result = valid.length > 0
        ? await this.evidence.bulkUpsert(user.tenantId, user.claims.sub, input.sourceSystem, valid)
        : { received: 0, created: 0, updated: 0, failed: [] as any[] };

      // 5. đóng run + outbox event
      const stats = {
        rows: input.rows.length,
        contract_failed: contractFailed.length,
        created: result.created,
        updated: result.updated,
        upsert_failed: result.failed.length,
      };
      const status =
        contractFailed.length + result.failed.length === 0 ? 'success'
        : result.created + result.updated > 0 ? 'partial'
        : 'failed';

      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.integrationRun.update({
          where: { id: run.id },
          data: {
            status, finishedAt: new Date(), stats: stats as any,
            error: contractFailed.length > 0 ? ({ contract_failed: contractFailed } as any) : undefined,
          },
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: user.tenantId,
            aggregateType: 'integration_run', aggregateId: run.id,
            eventType: 'evidence.batch_imported',
            payload: { source: input.sourceSystem, ...stats } as any,
          },
        });
      });

      // đánh thức worker outbox (debounce theo tenant — no-op khi worker tắt)
      this.outbox.notify(user.tenantId);

      return { runId: run.id, status, stats, contractFailed, upsertFailed: result.failed };
    } catch (e: any) {
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.integrationRun.update({
          where: { id: run.id },
          data: { status: 'failed', finishedAt: new Date(), error: { message: e.message } as any },
        }),
      ).catch(() => undefined);
      throw e;
    }
  }
}
