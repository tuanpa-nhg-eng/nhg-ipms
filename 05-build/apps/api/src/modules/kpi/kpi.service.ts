import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { evaluateFormula, FormulaError } from './scoring/formula';

export interface CreateKpiInput {
  code: string;
  nameVi: string;
  nameEn?: string;
  definition?: string;
  method: string;      // manual | system
  direction: string;   // forward | reverse
  unit?: string;
  frequency: string;
  dataSource?: string;
  taskCellRef?: string;
  categoryId?: string;
  formulaExpression?: string; // tạo kpi_formula kèm theo (versioned)
  scoreTiers?: Array<{ minPct: number; score: number }>;
}

@Injectable()
export class KpiService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.kpi.findMany({
        where: { deletedAt: null },
        include: { formula: true, scoreTiers: { where: { deletedAt: null } } },
        orderBy: { code: 'asc' },
      }),
    );
  }

  get(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const kpi = await tx.kpi.findFirst({
        where: { id, deletedAt: null },
        include: { formula: true, scoreTiers: { where: { deletedAt: null } }, applicability: true },
      });
      if (!kpi) throw new NotFoundException('KPI not found');
      return kpi;
    });
  }

  create(tenantId: string, actorId: string, input: CreateKpiInput) {
    // Validate công thức TRƯỚC khi lưu — parser whitelist, dry-run với biến mẫu
    if (input.formulaExpression) {
      try {
        evaluateFormula(input.formulaExpression, { actual: 80, target: 100, base: 1 });
      } catch (e) {
        if (e instanceof FormulaError) {
          throw new UnprocessableEntityException(`Công thức không hợp lệ: ${e.message}`);
        }
        throw e;
      }
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const dup = await tx.kpi.findFirst({ where: { code: input.code, deletedAt: null } });
      if (dup) throw new ConflictException(`KPI code '${input.code}' exists`);

      let formulaId: string | undefined;
      if (input.formulaExpression) {
        const f = await tx.kpiFormula.create({
          data: {
            id: uuidv7(), tenantId, expression: input.formulaExpression,
            version: 1, createdBy: actorId, updatedBy: actorId,
          },
        });
        formulaId = f.id;
      }

      const kpi = await tx.kpi.create({
        data: {
          id: uuidv7(), tenantId,
          code: input.code, nameVi: input.nameVi, nameEn: input.nameEn,
          definition: input.definition, method: input.method, direction: input.direction,
          unit: input.unit, frequency: input.frequency, dataSource: input.dataSource,
          taskCellRef: input.taskCellRef, categoryId: input.categoryId,
          formulaId, status: 'draft',
          createdBy: actorId, updatedBy: actorId,
        },
      });

      if (input.scoreTiers?.length) {
        for (const t of input.scoreTiers) {
          await tx.kpiScoreTier.create({
            data: { id: uuidv7(), tenantId, kpiId: kpi.id, minPct: t.minPct, score: t.score },
          });
        }
      }
      return this.reloadWithRelations(tx, kpi.id);
    });
  }

  /** Human-in-the-loop: duyệt KPI draft → active. Người duyệt ghi vào approval_owner + audit. */
  approve(tenantId: string, actorId: string, id: string, personId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const kpi = await tx.kpi.findFirst({ where: { id, deletedAt: null } });
      if (!kpi) throw new NotFoundException('KPI not found');
      if (kpi.status === 'active') throw new ConflictException('KPI already active');
      return tx.kpi.update({
        where: { id },
        data: {
          status: 'active',
          approvalOwnerId: personId ?? null,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });
    });
  }

  /**
   * [F18] Cập nhật công thức = tạo bản ghi kpi_formula MỚI (immutable, version = max+1),
   * trỏ kpi.formulaId sang bản mới; bản cũ GIỮ NGUYÊN để recompute lịch sử đúng version
   * (nguyên tắc explainable — TDD §7.3).
   */
  updateFormula(tenantId: string, actorId: string, kpiId: string, expression: string) {
    try {
      evaluateFormula(expression, { actual: 80, target: 100, base: 1 });
    } catch (e) {
      if (e instanceof FormulaError) {
        throw new UnprocessableEntityException(`Công thức không hợp lệ: ${e.message}`);
      }
      throw e;
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const kpi = await tx.kpi.findFirst({
        where: { id: kpiId, deletedAt: null },
        include: { formula: true },
      });
      if (!kpi) throw new NotFoundException('KPI not found');

      const nextVersion = (kpi.formula?.version ?? 0) + 1;
      const f = await tx.kpiFormula.create({
        data: {
          id: uuidv7(), tenantId, expression, version: nextVersion,
          note: kpi.formula ? `thay thế v${kpi.formula.version} (${kpi.formula.id})` : undefined,
          createdBy: actorId, updatedBy: actorId,
        },
      });
      await tx.kpi.update({
        where: { id: kpiId },
        data: { formulaId: f.id, updatedBy: actorId, version: { increment: 1 } },
      });
      return this.reloadWithRelations(tx, kpiId);
    });
  }

  private reloadWithRelations(tx: any, id: string) {
    return tx.kpi.findFirst({
      where: { id },
      include: { formula: true, scoreTiers: { where: { deletedAt: null } } },
    });
  }
}
