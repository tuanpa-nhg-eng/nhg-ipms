import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { AiGatewayService } from '../ai-gateway.service';
import { LearningService } from '../learning/learning.service';
import { ConfigService } from '../../config/config.service';
import { evaluateQualityGate, CellPayload } from '../../library/quality-gate';
import {
  InlineParseError, InlineTask, INLINE_SUGGESTION_TYPE, INLINE_SUGGESTION_TYPES,
  parseCurationDedup, parseDerivationRule, parseKpiLink, parseTaskcellDraft,
  promptCurationDedup, promptDerivationRule, promptKpiLink, promptTaskcellDraft,
} from './inline-assist.tasks';

/** [F149] cap context theo BYTES — đồng bộ MCP args + Copilot context. */
const MAX_CONTEXT_BYTES = 16_384;

interface BuiltContext {
  prompt: string;
  context: unknown;
  /** Dữ liệu server-side dùng khi parse/diff (không gửi lại cho FE nguyên khối). */
  meta?: {
    validCodes?: Set<string>; payload?: CellPayload;
    diffPairs?: Array<{ field: string; a: unknown; b: unknown }>;
    candidateId?: string; // [F156] dedup candidate BE đã phân tích — FE resolve đúng id này
  };
}

export interface DiffEntry { field: string; old: unknown; new: unknown }

/**
 * [Lát AI inline] Inline assist — 4 tác vụ gợi ý một-phát trên ai-gateway.complete()
 * (mock tất định; Copilot stream KHÔNG đụng). Bất biến:
 * - KHÔNG tự ghi cell/rule/config: output hợp lệ → `ai_suggestion` PENDING (HITL, tiền lệ F28).
 * - FAIL-CLOSED mọi nhánh: context >16KB → 422; parse lỗi → 422 và KHÔNG tạo suggestion.
 * - `ai_interaction` append-only tự ghi qua gateway.complete().
 */
@Injectable()
export class InlineAssistService {
  constructor(
    private prisma: PrismaService,
    private gateway: AiGatewayService,
    private config: ConfigService,
    private learning: LearningService,
  ) {}

  async assist(user: RequestUser, task: InlineTask, input: Record<string, unknown>, configVersionId?: string) {
    const built = await this.buildContext(user, task, input);
    if (Buffer.byteLength(JSON.stringify(built.context), 'utf8') > MAX_CONTEXT_BYTES) {
      throw new UnprocessableEntityException('context tối đa 16KB');
    }

    const res = await this.gateway.complete(
      user,
      { agent: `inline.${task}`, prompt: built.prompt, context: built.context, promptVersion: 'inline-v1' },
      `inline.${task}`,
    );

    // Parser fail-closed — output lệch shape → 422, KHÔNG tạo suggestion
    let proposal: Record<string, unknown>;
    let reason: string;
    let diff: DiffEntry[] | null;
    try {
      ({ proposal, reason, diff } = this.parse(task, res.json, built));
    } catch (e) {
      if (e instanceof InlineParseError) {
        throw new UnprocessableEntityException(`AI output không hợp lệ: ${e.message}`);
      }
      throw e;
    }

    const suggestion = await this.prisma.withTenant(user.tenantId, async (tx) => {
      // configVersionId (nếu kèm) phải là DRAFT — không lách vào published (F28)
      if (configVersionId) await this.config.mustGetDraft(tx as TenantTx, configVersionId);
      return tx.aiSuggestion.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          configVersionId: configVersionId ?? null,
          type: INLINE_SUGGESTION_TYPE[task],
          payload: { proposal, diff } as any,
          reason, status: 'pending',
          createdByTool: `inline.${task}`, createdBy: user.claims.sub,
        },
      });
    });

    return { suggestion, proposal, reason, diff, model: res.model };
  }

  /**
   * Người TẠO tự chốt suggestion inline sau khi áp/bỏ giá trị vào form của mình:
   * - KHÔNG materialize gì (mọi thay đổi thật đi qua endpoint nghiệp vụ có gate riêng).
   * - Chỉ type inline + chỉ người tạo (không đụng vòng accept config:write của MCP).
   * - [Learning Loop L0] mỗi quyết định phát 1 tín hiệu học CÙNG tx (append-only):
   *   opts.finalPayload = giá trị người dùng THẬT SỰ dùng (từ "Sửa rồi chấp nhận")
   *   → diff proposed↔final cho biết AI sai field nào.
   */
  decide(
    user: RequestUser, id: string, decision: 'accepted' | 'rejected',
    opts?: { note?: string; edited?: boolean; finalPayload?: Record<string, unknown> },
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const s = await tx.aiSuggestion.findFirst({ where: { id, deletedAt: null } });
      if (!s) throw new NotFoundException('Suggestion không tồn tại');
      // [F153] type KHÔNG đủ (derivation_rule trùng với MCP propose) — phải đúng
      // suggestion do inline assist tạo (createdByTool 'inline.*'), nếu không designer
      // tự chốt suggestion MCP của mình, đóng lệch vòng HITL accept (config:write).
      if (!INLINE_SUGGESTION_TYPES.has(s.type) || !s.createdByTool?.startsWith('inline.')) {
        throw new ForbiddenException('Chỉ chốt được suggestion inline (createdByTool inline.*) qua endpoint này');
      }
      if (s.createdBy !== user.claims.sub) {
        throw new ForbiddenException('Chỉ người tạo suggestion inline được tự chốt');
      }
      if (s.status !== 'pending') throw new ConflictException(`Suggestion đã ${s.status}`);
      const updated = await tx.aiSuggestion.updateMany({
        where: { id, status: 'pending', version: s.version },
        data: {
          status: decision, decidedBy: user.claims.sub, decidedAt: new Date(),
          decisionNote: `[inline-${decision === 'accepted' ? 'apply' : 'dismiss'}] ${opts?.note ?? ''}`.trim(),
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Suggestion vừa bị quyết định (reload)');
      await this.learning.record(tx as TenantTx, user.tenantId, {
        suggestionId: s.id,
        agent: s.createdByTool ?? s.type,
        decision,
        edited: opts?.edited,
        proposedPayload: ((s.payload as any)?.proposal ?? s.payload) as Record<string, unknown>,
        // finalPayload chỉ có nghĩa khi CHẤP NHẬN (bỏ = không dùng gì)
        finalPayload: decision === 'accepted' ? opts?.finalPayload ?? null : null,
        actorUserId: user.claims.sub,
      });
      return tx.aiSuggestion.findFirst({ where: { id } });
    });
  }

  // ===== dựng context per-task (chỉ đọc, tenant-scoped qua RLS) =====

  private async buildContext(user: RequestUser, task: InlineTask, input: Record<string, unknown>): Promise<BuiltContext> {
    switch (task) {
      case 'taskcell.draft': {
        const payload = this.requirePayload(input);
        const gate = evaluateQualityGate(payload, 'task_cell');
        const missing = gate.checks.filter((c) => !c.passed).map((c) => c.id);
        if (missing.length === 0) {
          throw new UnprocessableEntityException('Quality gate A–G đã đủ — không còn field nào để AI điền');
        }
        return { prompt: promptTaskcellDraft(), context: { payload, missing }, meta: { payload } };
      }
      case 'taskcell.kpi_link': {
        const payload = this.requirePayload(input);
        const dict = await this.kpiDictionary(user);
        if (dict.length === 0) throw new UnprocessableEntityException('Từ điển KPI trống — không có ứng viên để gợi ý');
        const candidates = dict.map((k) => ({ code: k.code, nameVi: k.nameVi, domain: k.domain }));
        return {
          prompt: promptKpiLink(),
          context: {
            cell: {
              code: payload.code ?? null, nameVi: payload.nameVi ?? null,
              responsibleRole: payload.responsibleRole ?? null, accountableRole: payload.accountableRole ?? null,
            },
            candidates,
          },
          meta: { validCodes: new Set(candidates.map((c) => c.code)), payload },
        };
      }
      case 'derivation.rule': {
        const description = input.description;
        if (typeof description !== 'string' || description.trim().length === 0 || description.length > 2000) {
          throw new UnprocessableEntityException('Cần description (string, ≤2000 ký tự)');
        }
        const dict = await this.kpiDictionary(user);
        return {
          prompt: promptDerivationRule(),
          context: { description: description.trim(), kpiCodes: dict.map((k) => k.code) },
        };
      }
      case 'curation.dedup': {
        const contributionId = input.contributionId;
        if (typeof contributionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(contributionId)) {
          throw new UnprocessableEntityException('Cần contributionId (uuid)');
        }
        return this.prisma.withTenant(user.tenantId, async (tx) => {
          const contrib = await tx.libraryContribution.findFirst({
            where: { id: contributionId, deletedAt: null },
            // [F156] orderBy tất định — "candidate pending đầu tiên" không phụ thuộc thứ tự DB
            include: { dedupCandidates: { orderBy: { createdAt: 'asc' } } },
          });
          if (!contrib) throw new NotFoundException('Contribution không tồn tại');
          // [F154] dedup data vốn gate library:curate (author chỉ thấy CỦA MÌNH qua listMine).
          // ai:assist không được thành cửa đọc contribution người khác trong tenant.
          if (contrib.authorId !== user.claims.sub && !user.permissions.has('library:curate')) {
            throw new ForbiddenException('curation.dedup cần library:curate (hoặc là tác giả contribution)');
          }
          const candidateId = typeof input.candidateId === 'string' ? input.candidateId : undefined;
          const cand = contrib.dedupCandidates.find((d) =>
            d.resolution === 'pending' && d.similarTaskCellId && (!candidateId || d.id === candidateId));
          if (!cand) throw new UnprocessableEntityException('Không có dedup candidate PENDING (task cell) cho contribution này');
          const canonical = await tx.taskCell.findFirst({
            where: { id: cand.similarTaskCellId!, deletedAt: null },
            select: {
              code: true, nameVi: true, responsibleRole: true, accountableRole: true,
              aiLevel: true, kpiRef: true,
            },
          });
          if (!canonical) throw new UnprocessableEntityException('Cell canonical trùng không còn tồn tại');
          const p = contrib.payload as CellPayload;
          const a = {
            code: p.code ?? null, nameVi: p.nameVi ?? null,
            responsibleRole: p.responsibleRole ?? null, accountableRole: p.accountableRole ?? null,
            aiLevel: p.aiLevel ?? null, kpiRef: p.kpiRef ?? null,
          };
          const b = {
            code: canonical.code, nameVi: canonical.nameVi,
            responsibleRole: canonical.responsibleRole, accountableRole: canonical.accountableRole,
            aiLevel: canonical.aiLevel, kpiRef: canonical.kpiRef,
          };
          const diffPairs = (Object.keys(a) as Array<keyof typeof a>)
            .filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null))
            .map((f) => ({ field: f as string, a: a[f] ?? null, b: b[f] ?? null }));
          return {
            prompt: promptCurationDedup(),
            context: { a, b, diffFields: diffPairs.map((d) => d.field) },
            meta: { diffPairs, candidateId: cand.id },
          };
        });
      }
    }
  }

  /** Parse fail-closed + dựng diff (trường nào AI điền, cũ→mới) cho FE. */
  private parse(task: InlineTask, json: unknown, built: BuiltContext):
    { proposal: Record<string, unknown>; reason: string; diff: DiffEntry[] | null } {
    switch (task) {
      case 'taskcell.draft': {
        const p = parseTaskcellDraft(json);
        const payload = built.meta?.payload ?? {};
        const diff = Object.entries(p.fill).map(([field, value]) => ({
          field, old: (payload as Record<string, unknown>)[field] ?? null, new: value,
        }));
        return { proposal: { fill: p.fill }, reason: p.reason, diff };
      }
      case 'taskcell.kpi_link': {
        const p = parseKpiLink(json, built.meta?.validCodes ?? new Set());
        const payload = built.meta?.payload ?? {};
        return {
          proposal: { kpiRef: p.kpiRef }, reason: p.reason,
          diff: [{ field: 'kpiRef', old: (payload as CellPayload).kpiRef ?? null, new: p.kpiRef }],
        };
      }
      case 'derivation.rule': {
        const p = parseDerivationRule(json);
        return {
          proposal: { rule: p.rule }, reason: p.reason,
          diff: [
            { field: 'match', old: null, new: p.rule.match },
            { field: 'emit', old: null, new: p.rule.emit },
          ],
        };
      }
      case 'curation.dedup': {
        const p = parseCurationDedup(json);
        const diff = (built.meta?.diffPairs ?? []).map((d) => ({ field: d.field, old: d.b, new: d.a }));
        return {
          proposal: {
            recommendation: p.recommendation, differences: p.differences,
            candidateId: built.meta?.candidateId ?? null, // [F156] FE resolve đúng candidate đã phân tích
          },
          reason: p.reason, diff,
        };
      }
    }
  }

  private requirePayload(input: Record<string, unknown>): CellPayload {
    const payload = input.payload;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new UnprocessableEntityException('Cần payload (object Task Cell)');
    }
    return payload as CellPayload;
  }

  /** Từ điển KPI (41 mục seed tenant-scoped, isDictionary=true) — nguồn ứng viên kpiRef. */
  private kpiDictionary(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.kpiTemplate.findMany({
        where: { deletedAt: null, isDictionary: true },
        select: { code: true, nameVi: true, domain: true },
        orderBy: { code: 'asc' },
        take: 200, // an toàn kích thước context (41 hiện tại; trần cứng tránh phình 16KB)
      }),
    );
  }
}
