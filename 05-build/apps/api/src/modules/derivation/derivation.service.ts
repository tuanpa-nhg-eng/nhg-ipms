import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { ConfigService } from '../config/config.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * ④ Auto-Derivation Engine — Spec_Configuration_Studio §5.
 * (function, role_family, level, grade) ⇒ rules match ⇒ KÉO THEO KPI templates + Task Cell
 * ⇒ dựng Scorecard đề xuất (validate Σweight=100) ⇒ cascade_link lineage.
 * Engine CHỈ tạo preview (derivation_run/result + reason explainable); apply ghi vào draft;
 * KHÔNG tự publish; KHÔNG đè scorecard_item có manual_override.
 */

interface RuleMatch {
  function_codes?: string[];
  role_family_codes?: string[];
  org_level?: string[];
  grade?: string[];
}

interface RuleEmit {
  kpi_template_codes?: string[];
  task_cell_refs?: string[];
  weight?: number;
  group_label?: string;
  group_weight?: number;
}

@Injectable()
export class DerivationService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  // ===== Rules & Templates =====
  createRule(user: RequestUser, input: { configVersionId: string; priority?: number; match: RuleMatch; emit: RuleEmit; note?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.config.mustGetDraft(tx, input.configVersionId);
      const rule = await tx.derivationRule.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, configVersionId: input.configVersionId,
          priority: input.priority ?? 100, match: input.match as any, emit: input.emit as any,
          note: input.note, createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      await this.config.recordChange(tx, user, input.configVersionId, 'derivation_rule', rule.id, 'create', null, {
        match: input.match, emit: input.emit,
      });
      return rule;
    });
  }

  /** [Lát 4e] Thư viện template cho FE picker — RLS SELECT trả global (tenant NULL) + tenant. */
  listTemplates(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.kpiTemplate.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
  }

  listRules(user: RequestUser, configVersionId: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.derivationRule.findMany({
        where: { configVersionId, deletedAt: null },
        orderBy: { priority: 'desc' },
      }),
    );
  }

  createTemplate(user: RequestUser, input: {
    code: string; nameVi: string; nameEn?: string;
    method?: string; direction?: string; unit?: string; frequency?: string;
    formulaExpr?: string; defaultTier?: unknown;
    functionTags?: string[]; roleFamilyCodes?: string[]; taskCellRefs?: string[];
  }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.kpiTemplate.findFirst({
        where: { code: input.code, tenantId: user.tenantId, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Template '${input.code}' exists`);
      return tx.kpiTemplate.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          code: input.code, nameVi: input.nameVi, nameEn: input.nameEn,
          method: input.method ?? 'manual', direction: input.direction ?? 'forward',
          unit: input.unit, frequency: input.frequency ?? 'quarterly',
          formulaExpr: input.formulaExpr, defaultTier: (input.defaultTier ?? undefined) as any,
          functionTags: input.functionTags ?? [], roleFamilyCodes: input.roleFamilyCodes ?? [],
          taskCellRefs: input.taskCellRefs ?? [],
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  // ===== Engine =====
  /** Chạy engine → derivation_run(status=preview) + results + diff. KHÔNG ghi cấu hình. */
  run(user: RequestUser, input: { configVersionId: string; trigger?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.config.mustGetDraft(tx, input.configVersionId);

      const rules = await tx.derivationRule.findMany({
        where: { configVersionId: input.configVersionId, status: 'active', deletedAt: null },
        orderBy: { priority: 'desc' },
      });
      if (rules.length === 0) {
        throw new UnprocessableEntityException('Chưa có derivation rule nào trong version này');
      }

      // [F49] gộp theo (org_unit, role_family, grade) — không nuốt position khác grade;
      // giữ TOÀN BỘ positions trong nhóm để cascade_link đủ lineage
      const positions = await tx.position.findMany({
        where: { deletedAt: null, roleFamilyId: { not: null } },
        include: { orgUnit: true, roleFamily: true },
      });
      const groups = new Map<string, { rep: (typeof positions)[number]; positionIds: string[] }>();
      for (const p of positions) {
        const key = `${p.orgUnitId}::${p.roleFamilyId}::${p.grade ?? p.orgUnit.grade ?? ''}`;
        if (!groups.has(key)) groups.set(key, { rep: p, positionIds: [] });
        groups.get(key)!.positionIds.push(p.id);
      }

      const unitFunctions = await tx.orgUnitFunction.findMany({ include: { function: true } });
      const fnByUnit = new Map<string, string[]>();
      for (const uf of unitFunctions) {
        if (!fnByUnit.has(uf.orgUnitId)) fnByUnit.set(uf.orgUnitId, []);
        fnByUnit.get(uf.orgUnitId)!.push(uf.function.code);
      }

      const templates = await tx.kpiTemplate.findMany({ where: { deletedAt: null } });
      const templateByCode = new Map(templates.map((t) => [t.code, t]));

      const results: Array<{ targetType: string; action: string; payload: any; reason: string }> = [];

      for (const g of groups.values()) {
        const p = g.rep;
        const ctx = {
          functions: fnByUnit.get(p.orgUnitId) ?? [],
          roleFamily: p.roleFamily!.code,
          level: p.orgUnit.level,
          grade: p.grade ?? p.orgUnit.grade ?? null,
        };

        // match rules (điều kiện rỗng = wildcard)
        const bag = new Map<string, { emit: RuleEmit; ruleId: string; priority: number }>();
        const cellBag = new Map<string, { ruleId: string }>();
        for (const r of rules) {
          const m = r.match as RuleMatch;
          const fnOk = !m.function_codes?.length || m.function_codes.some((f) => ctx.functions.includes(f));
          const rfOk = !m.role_family_codes?.length || m.role_family_codes.includes(ctx.roleFamily);
          const lvOk = !m.org_level?.length || m.org_level.includes(ctx.level);
          const grOk = !m.grade?.length || (ctx.grade != null && m.grade.includes(ctx.grade));
          if (!(fnOk && rfOk && lvOk && grOk)) continue;

          const emit = r.emit as RuleEmit;
          for (const code of emit.kpi_template_codes ?? []) {
            if (!bag.has(code)) bag.set(code, { emit, ruleId: r.id, priority: r.priority }); // priority cao thắng
          }
          for (const ref of emit.task_cell_refs ?? []) {
            if (!cellBag.has(ref)) cellBag.set(ref, { ruleId: r.id });
          }
        }
        if (bag.size === 0) continue;

        // dựng scorecard đề xuất
        const items: any[] = [];
        for (const [code, hit] of bag) {
          const tpl = templateByCode.get(code);
          if (!tpl) {
            results.push({
              targetType: 'kpi', action: 'error',
              payload: { template_code: code },
              reason: `Rule ${hit.ruleId} emit template '${code}' KHÔNG tồn tại trong thư viện`,
            });
            continue;
          }
          items.push({
            kpi_template_code: code,
            weight: hit.emit.weight ?? null,
            group_label: hit.emit.group_label ?? null,
            group_weight: hit.emit.group_weight ?? null,
            tier: tpl.defaultTier ?? null,
            rule_id: hit.ruleId,
          });
        }

        // validate Σweight = 100 ± 0.01 (item weight; nhóm chia đều như TDD §7.2)
        const groupsW = new Map<string, number>();
        let sum = 0;
        let valid = true;
        for (const it of items) {
          if (it.weight != null) sum += it.weight;
          else if (it.group_label && it.group_weight != null) groupsW.set(it.group_label, it.group_weight);
          else valid = false;
        }
        for (const gw of groupsW.values()) sum += gw;
        const weightOk = valid && Math.abs(sum - 100) <= 0.01;

        const scName = `SC ${p.orgUnit.code} · ${p.roleFamily!.code}`;
        // [F45a] check tồn tại theo (orgUnit, roleFamily) — kể cả scorecard tạo tay
        // không version-scoped (Phase 1) cũng được tôn trọng, không nhân đôi
        const existing = await tx.scorecard.findFirst({
          where: { orgUnitId: p.orgUnitId, roleFamilyId: p.roleFamilyId, deletedAt: null },
          include: { items: { where: { deletedAt: null } } },
        });

        const scorecardPayload = {
          name: scName, org_unit_id: p.orgUnitId, role_family_id: p.roleFamilyId,
          position_ids: g.positionIds, // [F49] đủ lineage mọi position trong nhóm
          items, weight_sum: sum, weight_valid: weightOk,
        };

        if (!weightOk) {
          results.push({
            targetType: 'scorecard', action: 'error', payload: scorecardPayload,
            reason: `Σweight = ${sum} ≠ 100 (±0.01) — chỉnh emit weight của rules trước khi apply`,
          });
          continue;
        }

        if (!existing) {
          results.push({
            targetType: 'scorecard', action: 'add', payload: scorecardPayload,
            reason: `Chưa có scorecard cho (${p.orgUnit.code}, ${p.roleFamily!.code}); ${items.length} KPI kéo theo từ functions [${ctx.functions.join(',')}] + role_family '${ctx.roleFamily}'`,
          });
        } else {
          // [F46] item-sync chưa hỗ trợ → action 'keep' tường minh (không hứa 'update' rồi bỏ qua)
          const overridden = existing.items.filter((i) => i.manualOverride);
          results.push({
            targetType: 'scorecard', action: 'keep',
            payload: { ...scorecardPayload, existing_id: existing.id, manual_override_items: overridden.length },
            reason: overridden.length > 0
              ? `Scorecard đã có ${overridden.length} item manual_override — engine KHÔNG đè (giữ chủ đích người dùng)`
              : `Scorecard tồn tại — item-sync tự động chưa hỗ trợ (lát sau); giữ nguyên`,
          });
        }

        // cascade_link lineage cho từng KPI — đủ MỌI position trong nhóm (F49)
        for (const it of items) {
          const tpl = templateByCode.get(it.kpi_template_code)!;
          for (const ref of tpl.taskCellRefs) {
            results.push({
              targetType: 'cascade_link', action: 'add',
              payload: {
                kpi_template_code: it.kpi_template_code, task_cell_ref: ref,
                org_unit_id: p.orgUnitId, position_ids: g.positionIds,
              },
              reason: `Lineage KPI '${it.kpi_template_code}' ▸ Task Cell '${ref}' (template mapping)`,
            });
          }
        }
        for (const [ref, hit] of cellBag) {
          results.push({
            targetType: 'task_cell', action: 'add',
            payload: { task_cell_ref: ref, org_unit_id: p.orgUnitId },
            reason: `Rule ${hit.ruleId} kéo theo Task Cell '${ref}' cho (${p.orgUnit.code}, ${ctx.roleFamily})`,
          });
        }
      }

      const summary = {
        add: results.filter((r) => r.action === 'add').length,
        update: results.filter((r) => r.action === 'update').length,
        keep: results.filter((r) => r.action === 'keep').length,
        error: results.filter((r) => r.action === 'error').length,
      };

      const run = await tx.derivationRun.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, configVersionId: input.configVersionId,
          trigger: input.trigger ?? 'manual', status: 'preview', diff: summary as any,
          createdBy: user.claims.sub,
        },
      });
      for (const r of results) {
        await tx.derivationResult.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, runId: run.id,
            targetType: r.targetType, action: r.action, payload: r.payload, reason: r.reason,
          },
        });
      }
      return { run, summary, results };
    });
  }

  getRun(user: RequestUser, runId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.derivationRun.findFirst({
        where: { id: runId, deletedAt: null },
        include: { results: true },
      });
      if (!run) throw new NotFoundException('Run not found');
      return run;
    });
  }

  /**
   * Apply preview → ghi scorecard/scorecard_item/kpi/cascade_link vào DRAFT version.
   * Chặn khi run có result action=error. KHÔNG publish (bước publish riêng, SoD).
   */
  apply(user: RequestUser, runId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.derivationRun.findFirst({
        where: { id: runId, deletedAt: null },
        include: { results: true },
      });
      if (!run) throw new NotFoundException('Run not found');
      if (run.status !== 'preview') throw new ConflictException(`Run ở trạng thái ${run.status}`);
      if (!run.configVersionId) throw new UnprocessableEntityException('Run không gắn config version');
      await this.config.mustGetDraft(tx, run.configVersionId);
      const errors = run.results.filter((r) => r.action === 'error');
      if (errors.length > 0) {
        throw new UnprocessableEntityException(
          `Run có ${errors.length} lỗi (weight/template) — sửa rules rồi chạy lại preview`,
        );
      }

      let appliedCount = 0;
      const appliedResultIds: string[] = []; // [F46] chỉ mark applied cho result THỰC SỰ ghi
      const skipped: Array<{ resultId: string; reason: string }> = [];

      for (const r of run.results.filter((x) => x.targetType === 'scorecard' && x.action === 'add')) {
        const p = r.payload as any;
        // [F45b] re-check tại APPLY — 2 run preview song song không nhân đôi scorecard
        const dup = await tx.scorecard.findFirst({
          where: { orgUnitId: p.org_unit_id, roleFamilyId: p.role_family_id, deletedAt: null },
        });
        if (dup) {
          skipped.push({ resultId: r.id, reason: `Scorecard (${p.name}) đã tồn tại lúc apply — bỏ qua (run khác đã ghi?)` });
          continue;
        }
        const sc = await tx.scorecard.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId,
            nameVi: p.name, orgUnitId: p.org_unit_id, roleFamilyId: p.role_family_id,
            status: 'draft', createdBy: user.claims.sub, updatedBy: user.claims.sub,
          },
        });
        const reusedKpis: string[] = [];
        for (const it of p.items) {
          const { kpi, reused } = await this.ensureKpiFromTemplate(tx, user, it.kpi_template_code);
          if (reused) reusedKpis.push(kpi.code); // [F50] explainable
          await tx.scorecardItem.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, scorecardId: sc.id, kpiId: kpi.id,
              weight: it.weight, groupLabel: it.group_label, groupWeight: it.group_weight,
              configVersionId: run.configVersionId,
            },
          });
        }
        await this.config.recordChange(tx, user, run.configVersionId, 'scorecard', sc.id, 'create', null, {
          ...p,
          reused_kpis: reusedKpis.length > 0 ? reusedKpis : undefined, // [F50] KPI dùng lại — tier/formula template không áp
        });
        appliedResultIds.push(r.id);
        appliedCount++;
      }

      for (const r of run.results.filter((x) => x.targetType === 'cascade_link' && x.action === 'add')) {
        const p = r.payload as any;
        const kpi = await tx.kpi.findFirst({ where: { code: p.kpi_template_code, deletedAt: null } });
        const positionIds: (string | null)[] = Array.isArray(p.position_ids) && p.position_ids.length > 0
          ? p.position_ids
          : [p.position_id ?? null];
        let wrote = false;
        for (const posId of positionIds) {
          // [F45c] dedup — không nhân bản lineage qua nhiều run
          const dup = await tx.cascadeLink.findFirst({
            where: {
              kpiId: kpi?.id ?? null, taskCellRef: p.task_cell_ref,
              orgUnitId: p.org_unit_id, positionId: posId,
              configVersionId: run.configVersionId, deletedAt: null,
            },
          });
          if (dup) continue;
          await tx.cascadeLink.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, configVersionId: run.configVersionId,
              kpiId: kpi?.id, taskCellRef: p.task_cell_ref,
              orgUnitId: p.org_unit_id, positionId: posId,
            },
          });
          wrote = true;
          appliedCount++;
        }
        if (wrote) appliedResultIds.push(r.id);
        else skipped.push({ resultId: r.id, reason: 'Lineage đã tồn tại — bỏ qua' });
      }

      // [F46] chỉ result thực sự ghi mới applied=true; keep/task_cell/error giữ nguyên false
      if (appliedResultIds.length > 0) {
        await tx.derivationResult.updateMany({
          where: { id: { in: appliedResultIds } },
          data: { applied: true },
        });
      }
      const count = await tx.derivationRun.updateMany({
        where: { id: runId, status: 'preview' },
        data: { status: 'applied' },
      });
      if (count.count !== 1) throw new ConflictException('Run đã bị apply song song');

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'derivation.apply', entityType: 'derivation_run', entityId: runId,
          after: { applied: appliedCount, skipped: skipped.length, config_version_id: run.configVersionId } as any,
        },
      });
      return { runId, applied: appliedCount, skipped };
    });
  }

  /** Tạo kpi thật từ template nếu chưa có (status draft — vẫn cần approve HITL).
   *  [F50] reused=true → KPI có sẵn được dùng lại, tier/formula của template KHÔNG áp. */
  private async ensureKpiFromTemplate(
    tx: TenantTx, user: RequestUser, code: string,
  ): Promise<{ kpi: { id: string; code: string }; reused: boolean }> {
    const existing = await tx.kpi.findFirst({ where: { code, deletedAt: null } });
    if (existing) return { kpi: existing, reused: true };
    const tpl = await tx.kpiTemplate.findFirst({ where: { code, deletedAt: null } });
    if (!tpl) throw new UnprocessableEntityException(`Template '${code}' biến mất giữa preview và apply`);

    let formulaId: string | undefined;
    if (tpl.formulaExpr) {
      const f = await tx.kpiFormula.create({
        data: { id: uuidv7(), tenantId: user.tenantId, expression: tpl.formulaExpr, version: 1, createdBy: user.claims.sub },
      });
      formulaId = f.id;
    }
    const kpi = await tx.kpi.create({
      data: {
        id: uuidv7(), tenantId: user.tenantId,
        code: tpl.code, nameVi: tpl.nameVi, nameEn: tpl.nameEn,
        method: tpl.method ?? 'manual', direction: tpl.direction ?? 'forward',
        unit: tpl.unit, frequency: tpl.frequency ?? 'quarterly',
        formulaId, status: 'draft',
        taskCellRef: tpl.taskCellRefs[0],
        createdBy: user.claims.sub, updatedBy: user.claims.sub,
      },
    });
    if (Array.isArray(tpl.defaultTier)) {
      for (const t of tpl.defaultTier as any[]) {
        if (typeof t?.minPct === 'number' && typeof t?.score === 'number') {
          await tx.kpiScoreTier.create({
            data: { id: uuidv7(), tenantId: user.tenantId, kpiId: kpi.id, minPct: t.minPct, score: t.score },
          });
        }
      }
    }
    return { kpi, reused: false };
  }
}
