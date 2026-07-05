import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';

export interface CreateEvidenceInput {
  type: string;
  sourceSystem?: string; // manual mặc định
  externalId?: string;
  uri?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
  relatedGoalId?: string;
  relatedKpiId?: string;
  taskCellRef?: string;
  ownerId?: string;
}

export interface BulkEvidenceRecord {
  externalId: string;
  type: string;
  occurredAt?: string;
  uri?: string;
  payload?: Record<string, unknown>;
  relatedKpiCode?: string; // map theo kpi.code — connector không biết uuid nội bộ
  ownerEmployeeCode?: string;
  taskCellRef?: string;
}

@Injectable()
export class EvidenceService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string, filter?: { kpiId?: string; status?: string }) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.evidence.findMany({
        where: {
          deletedAt: null,
          ...(filter?.kpiId ? { relatedKpiId: filter.kpiId } : {}),
          ...(filter?.status ? { status: filter.status as any } : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
    );
  }

  create(tenantId: string, actorId: string, personId: string | undefined, input: CreateEvidenceInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (input.relatedGoalId) {
        const g = await tx.goal.findFirst({ where: { id: input.relatedGoalId, deletedAt: null } });
        if (!g) throw new UnprocessableEntityException('Goal not found');
      }
      if (input.relatedKpiId) {
        const k = await tx.kpi.findFirst({ where: { id: input.relatedKpiId, deletedAt: null } });
        if (!k) throw new UnprocessableEntityException('KPI not found');
      }
      return tx.evidence.create({
        data: {
          id: uuidv7(), tenantId,
          type: input.type,
          sourceSystem: input.sourceSystem ?? 'manual',
          externalId: input.externalId,
          uri: input.uri,
          payload: (input.payload ?? undefined) as any,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
          relatedGoalId: input.relatedGoalId,
          relatedKpiId: input.relatedKpiId,
          taskCellRef: input.taskCellRef,
          ownerId: input.ownerId ?? personId,
          createdBy: actorId, updatedBy: actorId,
        },
      });
    });
  }

  /** Human-in-the-loop: verify/reject evidence — reviewer ghi danh, audit ở interceptor. */
  review(tenantId: string, actorId: string, personId: string | undefined, id: string, decision: 'verified' | 'rejected') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const ev = await tx.evidence.findFirst({ where: { id, deletedAt: null } });
      if (!ev) throw new NotFoundException('Evidence not found');
      if (ev.status !== 'pending') throw new ConflictException(`Evidence đã ở trạng thái ${ev.status}`);
      return tx.evidence.update({
        where: { id },
        data: { status: decision, reviewerId: personId ?? null, updatedBy: actorId, version: { increment: 1 } },
      });
    });
  }

  /**
   * Connector pipeline (TDD §10.1): map(đã chuẩn hoá) → validate → UPSERT idempotent
   * theo (tenant, source_system, external_id) → báo cáo created/updated/failed.
   * Fallback CSV/ETL cho AIC/Salesforce/CRM khi API chưa mở (giả định mặc định đã chốt).
   */
  bulkUpsert(tenantId: string, actorId: string, sourceSystem: string, records: BulkEvidenceRecord[]) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // resolve kpi.code & employee_code → id (trong tenant context)
      const kpiCodes = [...new Set(records.map((r) => r.relatedKpiCode).filter(Boolean))] as string[];
      const empCodes = [...new Set(records.map((r) => r.ownerEmployeeCode).filter(Boolean))] as string[];
      const kpis = kpiCodes.length
        ? await tx.kpi.findMany({ where: { code: { in: kpiCodes }, deletedAt: null } })
        : [];
      const persons = empCodes.length
        ? await tx.person.findMany({ where: { employeeCode: { in: empCodes }, deletedAt: null } })
        : [];
      const kpiByCode = new Map(kpis.map((k) => [k.code, k.id]));
      const personByCode = new Map(persons.map((p) => [p.employeeCode, p.id]));

      let created = 0, updated = 0;
      const failed: Array<{ externalId: string; issue: string }> = [];

      for (const r of records) {
        if (!r.externalId || !r.type) {
          failed.push({ externalId: r.externalId ?? '?', issue: 'thiếu externalId/type' });
          continue;
        }
        if (r.relatedKpiCode && !kpiByCode.has(r.relatedKpiCode)) {
          failed.push({ externalId: r.externalId, issue: `KPI code '${r.relatedKpiCode}' không tồn tại` });
          continue;
        }
        const data = {
          type: r.type,
          uri: r.uri,
          payload: (r.payload ?? undefined) as any,
          occurredAt: r.occurredAt ? new Date(r.occurredAt) : new Date(),
          relatedKpiId: r.relatedKpiCode ? kpiByCode.get(r.relatedKpiCode) : undefined,
          ownerId: r.ownerEmployeeCode ? personByCode.get(r.ownerEmployeeCode) : undefined,
          taskCellRef: r.taskCellRef,
          updatedBy: actorId,
        };
        const existing = await tx.evidence.findFirst({
          where: { sourceSystem, externalId: r.externalId },
        });
        if (existing) {
          await tx.evidence.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await tx.evidence.create({
            data: { id: uuidv7(), tenantId, sourceSystem, externalId: r.externalId, createdBy: actorId, ...data },
          });
          created++;
        }
      }
      return { sourceSystem, received: records.length, created, updated, failed };
    });
  }
}
