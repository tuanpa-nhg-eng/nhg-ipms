import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

/** Marker nội bộ: vi phạm SoD phát hiện trong transaction — audit incident ghi ở catch. */
class SodViolationError extends Error {
  constructor(public severity: string) {
    super('sod_violation');
  }
}

/**
 * Config-as-Data (#1) — GitOps cho cấu hình tenant:
 * draft (sửa tự do, mọi thao tác ghi config_change) → preview/diff → publish (SoD,
 * audit cùng transaction) → rollback (clone archived → draft mới).
 */
@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.configVersion.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    );
  }

  create(user: RequestUser, input: { label: string; note?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.configVersion.findFirst({ where: { label: input.label, deletedAt: null } });
      if (dup) throw new ConflictException(`Label '${input.label}' đã tồn tại`);
      return tx.configVersion.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, label: input.label, note: input.note,
          status: 'draft', createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  /** Diff = danh sách config_change theo thứ tự + tổng hợp theo entity_type. */
  diff(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cv = await tx.configVersion.findFirst({ where: { id, deletedAt: null } });
      if (!cv) throw new NotFoundException('Config version not found');
      const changes = await tx.configChange.findMany({
        where: { configVersionId: id },
        orderBy: { seq: 'asc' },
      });
      const summary: Record<string, { create: number; update: number; delete: number; move: number }> = {};
      for (const c of changes) {
        summary[c.entityType] ??= { create: 0, update: 0, delete: 0, move: 0 };
        (summary[c.entityType] as any)[c.op] = ((summary[c.entityType] as any)[c.op] ?? 0) + 1;
      }
      return { configVersion: cv, summary, changes };
    });
  }

  /**
   * Publish — permission config:publish (guard) + SoD RUNTIME check:
   * nếu tenant bật sod_rule(config:write ⟂ config:publish) mà user giữ CẢ HAI
   * permission → block + audit incident (không ai vừa sửa vừa duyệt).
   * Conditional update chống race (chuẩn F28). Audit CÙNG transaction.
   */
  async publish(user: RequestUser, id: string, expectedVersion: number, ip?: string) {
    // [F48] SoD check TRONG transaction chính (fail-closed — không có race window giữa
    // check và publish); vi phạm → throw marker, audit incident ghi ở tx RIÊNG sau catch
    // (sống sót rollback).
    try {
      return await this.doPublish(user, id, expectedVersion, ip);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'config_version', entityId: id,
              after: { rule: 'config:write ⟂ config:publish', severity: e.severity } as any,
              ip,
            },
          }),
        );
        throw new ConflictException('SoD: người giữ config:write không được publish (tách vai Designer/Approver)');
      }
      throw e;
    }
  }

  private doPublish(user: RequestUser, id: string, expectedVersion: number, ip?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cv = await tx.configVersion.findFirst({ where: { id, deletedAt: null } });
      if (!cv) throw new NotFoundException('Config version not found');

      // [F48] SoD check trong CÙNG tx với conditional update — không còn race window
      const sod = await tx.sodRule.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { permissionA: 'config:write', permissionB: 'config:publish' },
            { permissionA: 'config:publish', permissionB: 'config:write' },
          ],
        },
      });
      if (sod && user.permissions.has('config:write') && user.permissions.has('config:publish')) {
        throw new SodViolationError(sod.severity);
      }

      // archive bản published hiện tại (nếu có)
      await tx.configVersion.updateMany({
        where: { status: 'published', deletedAt: null },
        data: { status: 'archived', updatedBy: user.claims.sub },
      });

      // conditional update: draft/preview + đúng version → published
      const count = await tx.configVersion.updateMany({
        where: { id, deletedAt: null, version: expectedVersion, status: { in: ['draft', 'preview'] } },
        data: {
          status: 'published', publishedAt: new Date(), publishedBy: user.claims.sub,
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (count.count !== 1) {
        throw new ConflictException('Publish thất bại — version lệch hoặc trạng thái không hợp lệ (reload)');
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'config.publish', entityType: 'config_version', entityId: id,
          before: { status: cv.status } as any,
          after: { status: 'published', label: cv.label } as any,
          ip,
        },
      });
      return tx.configVersion.findFirst({ where: { id } });
    });
  }

  /** Rollback: clone version archived/published → draft mới (based_on), copy cấu hình version-scoped. */
  rollback(user: RequestUser, sourceId: string, label: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const src = await tx.configVersion.findFirst({ where: { id: sourceId, deletedAt: null } });
      if (!src) throw new NotFoundException('Config version not found');
      if (src.status !== 'archived' && src.status !== 'published') {
        throw new UnprocessableEntityException('Chỉ rollback từ version archived/published');
      }
      const dup = await tx.configVersion.findFirst({ where: { label, deletedAt: null } });
      if (dup) throw new ConflictException(`Label '${label}' đã tồn tại`);

      const draft = await tx.configVersion.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, label,
          status: 'draft', basedOnId: sourceId,
          note: `rollback từ '${src.label}'`,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });

      // copy cấu hình version-scoped (brand_kit + derivation_rule + task_cell)
      const brands = await tx.brandKit.findMany({ where: { configVersionId: sourceId, deletedAt: null } });
      for (const b of brands) {
        await tx.brandKit.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, configVersionId: draft.id,
            displayName: b.displayName, logoLightUri: b.logoLightUri, logoDarkUri: b.logoDarkUri,
            faviconUri: b.faviconUri, customDomain: b.customDomain,
            tokens: b.tokens as any, a11yChecked: b.a11yChecked, status: 'draft',
            createdBy: user.claims.sub,
          },
        });
      }
      const rules = await tx.derivationRule.findMany({ where: { configVersionId: sourceId, deletedAt: null } });
      for (const r of rules) {
        await tx.derivationRule.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, configVersionId: draft.id,
            priority: r.priority, match: r.match as any, emit: r.emit as any,
            note: r.note, status: r.status, createdBy: user.claims.sub,
          },
        });
      }
      // [F47] clone task_cell ĐỦ 7 nhóm thuộc tính (không rơi cột)
      const cells = await tx.taskCell.findMany({ where: { configVersionId: sourceId, deletedAt: null } });
      for (const c of cells) {
        await tx.taskCell.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, configVersionId: draft.id,
            code: c.code, groupCode: c.groupCode, clusterCode: c.clusterCode,
            nameVi: c.nameVi, nameEn: c.nameEn,
            responsibleRole: c.responsibleRole, accountableRole: c.accountableRole,
            consulted: c.consulted as any, informed: c.informed as any,
            inputs: c.inputs as any, outputs: c.outputs as any,
            measures: c.measures as any,
            aiLevel: c.aiLevel, aiDimension: c.aiDimension as any,
            governance: c.governance as any, riskLevel: c.riskLevel,
            lifecycle: c.lifecycle as any, processStepId: c.processStepId,
            attrs: c.attrs as any, kpiRef: c.kpiRef, createdBy: user.claims.sub,
          },
        });
      }
      // [F47] scorecard_item/cascade_link version-scoped KHÔNG clone tự động —
      // quyết định tường minh: version rollback cần chạy lại Derivation Engine.
      const linkCount = await tx.cascadeLink.count({ where: { configVersionId: sourceId, deletedAt: null } });
      await this.recordChange(tx, user, draft.id, 'config_version', draft.id, 'create', null, {
        rollback_from: src.label,
        requires_rederive: linkCount > 0,
        note: linkCount > 0 ? 'scorecard/cascade_link không clone — chạy lại derivation trên draft mới' : undefined,
      });
      return { ...draft, requiresRederive: linkCount > 0 };
    });
  }

  /** Helper dùng chung: ghi config_change (seq tự tăng trong version). */
  async recordChange(
    tx: TenantTx, user: RequestUser, configVersionId: string,
    entityType: string, entityId: string | null, op: string,
    before: unknown, after: unknown,
  ) {
    const last = await tx.configChange.findFirst({
      where: { configVersionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    await tx.configChange.create({
      data: {
        id: uuidv7(), tenantId: user.tenantId, configVersionId,
        entityType, entityId, op,
        before: (before ?? undefined) as any, after: (after ?? undefined) as any,
        seq: (last?.seq ?? 0) + 1,
      },
    });
  }

  /** Version draft hợp lệ để sửa — helper cho brand/derivation. */
  async mustGetDraft(tx: TenantTx, id: string) {
    const cv = await tx.configVersion.findFirst({ where: { id, deletedAt: null } });
    if (!cv) throw new NotFoundException('Config version not found');
    if (cv.status !== 'draft' && cv.status !== 'preview') {
      throw new ConflictException(`Chỉ sửa được version draft/preview (hiện: ${cv.status})`);
    }
    return cv;
  }
}
