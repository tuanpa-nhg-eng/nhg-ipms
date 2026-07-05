import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { ConfigService } from '../config/config.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * ⑤ Process Designer — Spec Config Studio §4.6.
 * Chuỗi bước công việc (BPMN-lite) → mỗi step type=task SINH Task Cell với 7 nhóm
 * thuộc tính (từ step.config) → feed Auto-Derivation Engine qua task_cell_refs.
 */
@Injectable()
export class ProcessService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  list(user: RequestUser, configVersionId?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.process.findMany({
        where: { deletedAt: null, ...(configVersionId ? { configVersionId } : {}) },
        include: {
          steps: { where: { deletedAt: null }, orderBy: { seq: 'asc' } },
          edges: { where: { deletedAt: null } },
        },
        orderBy: { code: 'asc' },
      }),
    );
  }

  create(user: RequestUser, input: { configVersionId: string; code: string; nameVi: string; nameEn?: string; domain?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.config.mustGetDraft(tx, input.configVersionId);
      const dup = await tx.process.findFirst({
        where: { code: input.code, configVersionId: input.configVersionId, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Process '${input.code}' exists trong version này`);
      const p = await tx.process.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, configVersionId: input.configVersionId,
          code: input.code, nameVi: input.nameVi, nameEn: input.nameEn, domain: input.domain,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      await this.config.recordChange(tx, user, input.configVersionId, 'process', p.id, 'create', null, {
        code: input.code, name: input.nameVi,
      });
      return p;
    });
  }

  addSteps(user: RequestUser, processId: string, steps: Array<{
    seq: number; type: string; nameVi: string; nameEn?: string;
    responsibleRole?: string; config?: Record<string, unknown>;
  }>) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await this.mustGetDraftProcess(tx, processId);
      const seqs = steps.map((s) => s.seq);
      if (new Set(seqs).size !== seqs.length) {
        throw new UnprocessableEntityException('seq trùng lặp trong payload');
      }
      const existing = await tx.processStep.findMany({
        where: { processId, deletedAt: null }, select: { seq: true },
      });
      const taken = new Set(existing.map((e) => e.seq));
      const dupSeq = seqs.find((s) => taken.has(s));
      if (dupSeq != null) throw new ConflictException(`seq ${dupSeq} đã tồn tại trong process`);

      const created = [];
      for (const s of steps) {
        created.push(await tx.processStep.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, processId,
            seq: s.seq, type: s.type, nameVi: s.nameVi, nameEn: s.nameEn,
            responsibleRole: s.responsibleRole, config: (s.config ?? undefined) as any,
            createdBy: user.claims.sub, updatedBy: user.claims.sub,
          },
        }));
      }
      if (p.configVersionId) {
        await this.config.recordChange(tx, user, p.configVersionId, 'process_step', processId, 'create', null, {
          process: p.code, added: steps.length,
        });
      }
      return created;
    });
  }

  addEdges(user: RequestUser, processId: string, edges: Array<{ fromStepId: string; toStepId: string; condition?: string }>) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.mustGetDraftProcess(tx, processId);
      const stepIds = new Set(
        (await tx.processStep.findMany({ where: { processId, deletedAt: null }, select: { id: true } }))
          .map((s) => s.id),
      );
      for (const e of edges) {
        if (!stepIds.has(e.fromStepId) || !stepIds.has(e.toStepId)) {
          throw new UnprocessableEntityException('Edge trỏ tới step không thuộc process');
        }
        if (e.fromStepId === e.toStepId) {
          throw new UnprocessableEntityException('Edge tự trỏ (self-loop) không hợp lệ');
        }
      }
      const created = [];
      for (const e of edges) {
        created.push(await tx.processEdge.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, processId,
            fromStepId: e.fromStepId, toStepId: e.toStepId, condition: e.condition,
          },
        }));
      }
      return created;
    });
  }

  /**
   * Sinh Task Cell từ các step type=task (idempotent — step đã có task_cell_id thì
   * đồng bộ name/RACI, không nhân đôi). Mã cell: <PROCESS>-S<seq> theo hệ mã spec.
   */
  generateCells(user: RequestUser, processId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await this.mustGetDraftProcess(tx, processId);
      const steps = await tx.processStep.findMany({
        where: { processId, type: 'task', deletedAt: null },
        orderBy: { seq: 'asc' },
      });
      if (steps.length === 0) throw new UnprocessableEntityException('Process không có step type=task');

      let created = 0, updated = 0;
      const cells = [];
      for (const s of steps) {
        const cfg = (s.config ?? {}) as any;
        const code = `${p.code}-S${String(s.seq).padStart(2, '0')}`;
        const cellData = {
          nameVi: s.nameVi, nameEn: s.nameEn,
          responsibleRole: s.responsibleRole ?? cfg.responsible_role,
          accountableRole: cfg.accountable_role,
          consulted: cfg.consulted ?? undefined,
          informed: cfg.informed ?? undefined,
          inputs: cfg.inputs ?? undefined,
          outputs: cfg.outputs ?? undefined,
          measures: cfg.measures ?? undefined,
          aiLevel: cfg.ai_level,
          aiDimension: cfg.ai_dimension ?? undefined,
          governance: cfg.governance ?? undefined,
          riskLevel: cfg.risk_level,
          kpiRef: cfg.kpi_ref,
          processStepId: s.id,
          attrs: cfg.attrs ?? {},
          updatedBy: user.claims.sub,
        };
        let cell = s.taskCellId
          ? await tx.taskCell.findFirst({ where: { id: s.taskCellId, deletedAt: null } })
          : await tx.taskCell.findFirst({
              where: { code, configVersionId: p.configVersionId, deletedAt: null },
            });
        if (cell) {
          cell = await tx.taskCell.update({
            where: { id: cell.id },
            data: { ...cellData, version: { increment: 1 } },
          });
          updated++;
        } else {
          cell = await tx.taskCell.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, configVersionId: p.configVersionId,
              code, groupCode: p.code, ...cellData, createdBy: user.claims.sub,
            },
          });
          created++;
        }
        if (!s.taskCellId) {
          await tx.processStep.update({ where: { id: s.id }, data: { taskCellId: cell.id } });
        }
        cells.push(cell);
      }
      if (p.configVersionId) {
        await this.config.recordChange(tx, user, p.configVersionId, 'task_cell', processId, 'create', null, {
          process: p.code, generated: created, synced: updated,
        });
      }
      return { processId, created, updated, cells };
    });
  }

  private async mustGetDraftProcess(tx: any, id: string) {
    const p = await tx.process.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw new NotFoundException('Process not found');
    if (p.configVersionId) await this.config.mustGetDraft(tx, p.configVersionId);
    return p;
  }
}
