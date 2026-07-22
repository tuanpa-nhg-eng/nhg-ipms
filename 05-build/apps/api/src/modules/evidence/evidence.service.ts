import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { assertScope, effectiveScope, hasTenantScope } from '../../common/auth/scope.util';
import type { RequestUser } from '../../common/auth/decorators';

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

  list(user: RequestUser, filter?: { kpiId?: string; status?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // [F32] lọc theo scope: self → evidence của mình; org_unit → của người trong đơn vị
      const scope = effectiveScope(user);
      let scopeWhere: Record<string, unknown> = {};
      if (scope.mode === 'scoped') {
        const or: Record<string, unknown>[] = [];
        if (scope.selfPersonId) or.push({ ownerId: scope.selfPersonId });
        if (scope.orgUnitIds.length > 0) {
          const members = await tx.person.findMany({
            where: { orgUnitId: { in: scope.orgUnitIds }, deletedAt: null },
            select: { id: true },
          });
          or.push({ ownerId: { in: members.map((m) => m.id) } });
        }
        scopeWhere = or.length > 0 ? { OR: or } : { ownerId: '00000000-0000-0000-0000-000000000000' };
      }
      return tx.evidence.findMany({
        where: {
          deletedAt: null,
          ...scopeWhere,
          ...(filter?.kpiId ? { relatedKpiId: filter.kpiId } : {}),
          ...(filter?.status ? { status: filter.status as any } : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      });
    });
  }

  create(user: RequestUser, input: CreateEvidenceInput) {
    const tenantId = user.tenantId;
    const actorId = user.claims.sub;
    const personId = user.claims.person_id;
    return this.prisma.withTenant(tenantId, async (tx) => {
      // [F32/F22] ownerId chỉ định phải trong scope + tồn tại; mặc định là chính mình
      if (input.ownerId && input.ownerId !== personId) {
        const ownerPerson = await tx.person.findFirst({ where: { id: input.ownerId, deletedAt: null } });
        if (!ownerPerson) throw new UnprocessableEntityException('Owner person not found');
        assertScope(user, { ownerPersonId: input.ownerId, orgUnitId: ownerPerson.orgUnitId }, 'evidence:create-for');
      }
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

  /**
   * Human-in-the-loop: verify/reject evidence — reviewer ghi danh, audit ở interceptor.
   *
   * [F22 — TRẢ NỢ, mở từ Phase 1] Trước bản vá, hàm này KHÔNG có kiểm tra nào ngoài
   * trạng thái pending: không SoD, không scope. Hậu quả kiểm chứng được (script độc lập
   * trên API dev): một trưởng phòng tạo bằng chứng CHO CHÍNH MÌNH rồi TỰ XÁC MINH
   * (`reviewerId === ownerId`), và xác minh được cả bằng chứng của người thuộc PHÒNG KHÁC.
   *
   * Vì sao nghiêm trọng: KPI phương pháp `system` lấy bằng chứng VERIFIED trong khung kỳ
   * để tính điểm (F29) ⇒ đây là đường tự thổi điểm của chính mình, đi vòng qua toàn bộ
   * SoD của vòng đánh giá (F26/F30 chỉ chặn tự chấm, không chặn tự cấp bằng chứng).
   *
   * Hai lớp gác, cùng khuôn với phần còn lại của hệ:
   *   ① SoD tuyệt đối — không tự xác minh bằng chứng của chính mình (kể cả admin).
   *   ② Scope — chỉ xác minh trong phạm vi phụ trách (self/org_unit/tenant).
   */
  review(
    user: RequestUser,
    id: string,
    decision: 'verified' | 'rejected',
  ) {
    const tenantId = user.tenantId;
    const actorId = user.claims.sub;
    const personId = user.claims.person_id;
    return this.prisma.withTenant(tenantId, async (tx) => {
      const ev = await tx.evidence.findFirst({ where: { id, deletedAt: null } });
      if (!ev) throw new NotFoundException('Evidence not found');
      if (ev.status !== 'pending') throw new ConflictException(`Evidence đã ở trạng thái ${ev.status}`);

      // ① SoD: người cấp bằng chứng ⟂ người xác minh
      if (ev.ownerId && personId && ev.ownerId === personId) {
        throw new ConflictException('Không tự xác minh bằng chứng của chính mình (SoD)');
      }
      // ② Scope: bằng chứng phải thuộc phạm vi phụ trách.
      // [F179 — Reviewer] Bản vá đầu bọc cả hai lớp trong `if (ev.ownerId)`, nên bằng
      // chứng KHÔNG CHỦ (connector nạp thiếu/sai mã nhân viên) đi lọt cả hai — ai có
      // `evidence:verify` cũng xác minh được, kể cả người không liên quan. Nay FAIL-CLOSED:
      // không xác định được chủ thì chỉ vai scope TENANT mới được quyết.
      if (ev.ownerId) {
        const owner = await tx.person.findFirst({ where: { id: ev.ownerId, deletedAt: null } });
        assertScope(user, { ownerPersonId: ev.ownerId, orgUnitId: owner?.orgUnitId }, 'evidence:verify');
      } else if (!hasTenantScope(user.scopes)) {
        throw new ForbiddenException(
          'Bằng chứng chưa gắn chủ sở hữu — chỉ vai phạm vi toàn đơn vị mới xác minh được',
        );
      }
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
        // [F179 — Reviewer] Bất đối xứng cũ: mã KPI sai thì vào failed[], còn mã nhân
        // viên sai bị NUỐT IM LẶNG (`personByCode.get()` trả undefined ⇒ ownerId=null)
        // — connector báo "created" trong khi bằng chứng vĩnh viễn không tính cho ai.
        // Lỗi toàn vẹn dữ liệu thật: KPI `system` chấm theo owner, bản ghi mồ côi
        // không bao giờ vào điểm mà cũng không ai biết là đã hỏng.
        if (r.ownerEmployeeCode && !personByCode.has(r.ownerEmployeeCode)) {
          failed.push({
            externalId: r.externalId,
            issue: `Mã nhân viên '${r.ownerEmployeeCode}' không tồn tại`,
          });
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
        // [F13] không đụng record đã soft-delete; record đã verified/rejected mà nguồn
        // thay đổi nội dung → reset về pending + xoá reviewer (bằng chứng phải duyệt lại)
        const existing = await tx.evidence.findFirst({
          where: { sourceSystem, externalId: r.externalId, deletedAt: null },
        });
        if (existing) {
          const resetReview = existing.status !== 'pending';
          await tx.evidence.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(resetReview ? { status: 'pending' as const, reviewerId: null } : {}),
              version: { increment: 1 },
            },
          });
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
