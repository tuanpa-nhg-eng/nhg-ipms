import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { AiGatewayService } from '../ai-gateway.service';
import { ConfigService } from '../../config/config.service';
import { LearningService } from '../learning/learning.service';

interface ProposeArgs {
  configVersionId?: string;
  proposal?: Record<string, unknown>;
  reason?: string;
}

/**
 * [F55] Permission TỐI THIỂU canonical của từng handler — nguồn sự thật trong CODE,
 * không phải registry. Tenant override mcp_tool KHÔNG hạ được gate dưới mức này
 * (caller phải giữ CẢ scope_permission của registry VÀ canonical của handler).
 */
const HANDLER_MIN_PERMISSION: Record<string, string> = {
  'ipms.get_org': 'org:read',
  'ipms.get_kpi': 'kpi:read',
  'ipms.get_scorecard': 'scorecard:read',
  'ipms.get_task_dictionary': 'taskcell:read',
  'ipms.propose_org_change': 'config:write',
  'ipms.propose_derivation_rule': 'config:write',
};

/**
 * MCP server (#3) — phơi iPMS thành tools CÓ GOVERNANCE (Spec Config Studio §9):
 * - Registry `mcp_tool` (global + tenant override, tenant thắng).
 * - Guard 2 lớp fail-closed: endpoint cần `ai:invoke` (PermissionGuard) +
 *   từng tool cần `scope_permission` riêng (check runtime tại invoke).
 * - Read-only tools trả dữ liệu tenant-scoped (RLS). Tool "ghi" KHÔNG ghi nghiệp vụ —
 *   chỉ tạo `ai_suggestion` chờ người duyệt (human-in-the-loop tuyệt đối).
 * - Mọi lượt gọi ghi `ai_interaction` + audit_log.
 * Transport HTTP nội bộ; shape tool (name/description/inputSchema) tương thích MCP —
 * adapter stdio/SSE mount 1:1 khi tách app ai-gateway riêng.
 */
@Injectable()
export class McpService {
  constructor(
    private prisma: PrismaService,
    private gateway: AiGatewayService,
    private config: ConfigService,
    private learning: LearningService, // [F168] mọi quyết định suggestion → tín hiệu học
  ) {}

  /** Tool visible cho tenant: global + tenant override (cùng name → tenant thắng). */
  async listTools(user: RequestUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.mcpTool.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    );
    const byName = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = byName.get(r.name);
      if (!cur || (cur.tenantId === null && r.tenantId !== null)) byName.set(r.name, r);
    }
    return [...byName.values()]
      .filter((t) => t.enabled)
      .map((t) => ({
        name: t.name, description: t.descriptionVi,
        inputSchema: t.inputSchema, readOnly: t.readOnly,
        scopePermission: t.scopePermission,
      }));
  }

  async invoke(user: RequestUser, name: string, args: Record<string, unknown>) {
    // Resolve tool (tenant override thắng) — RLS đã giới hạn global + tenant hiện tại
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.mcpTool.findMany({ where: { name, deletedAt: null } }),
    );
    const tool = rows.find((r) => r.tenantId === user.tenantId) ?? rows.find((r) => r.tenantId === null);
    if (!tool || !tool.enabled) throw new NotFoundException(`MCP tool '${name}' không tồn tại hoặc đã tắt`);

    // Lớp 2 fail-closed: caller phải giữ scope_permission của registry
    // VÀ [F55] canonical permission của handler (override không hạ được gate)
    const required = new Set([tool.scopePermission, HANDLER_MIN_PERMISSION[name]].filter(Boolean) as string[]);
    const missing = [...required].filter((p) => !user.permissions.has(p));
    if (missing.length > 0) {
      await this.gateway.logToolCall(user, name, args, { blocked: missing }, 0, 'blocked');
      throw new ForbiddenException(`Tool '${name}' cần permission '${missing.join("', '")}'`);
    }

    const t0 = Date.now();
    try {
      const result = await this.dispatch(user, name, args);
      // Log metadata (không log payload đọc lớn — đã có RLS + audit)
      await this.gateway.logToolCall(
        user, name, args,
        { readOnly: tool.readOnly, resultMeta: Array.isArray(result) ? { count: result.length } : { type: typeof result } },
        Date.now() - t0, 'ok',
      );
      return { tool: name, readOnly: tool.readOnly, result };
    } catch (e) {
      await this.gateway.logToolCall(user, name, args, { error: (e as Error).message }, Date.now() - t0, 'error');
      throw e;
    }
  }

  /** Handler từng tool — read-only qua RLS; propose_* CHỈ tạo ai_suggestion. */
  private dispatch(user: RequestUser, name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'ipms.get_org':
        return this.prisma.withTenant(user.tenantId, (tx) =>
          tx.orgUnit.findMany({
            where: { deletedAt: null },
            select: { id: true, code: true, nameVi: true, level: true, parentId: true },
            orderBy: { code: 'asc' },
          }),
        );
      case 'ipms.get_kpi':
        return this.prisma.withTenant(user.tenantId, (tx) =>
          tx.kpi.findMany({
            where: { deletedAt: null, ...(args.status ? { status: String(args.status) } : {}) },
            select: { id: true, code: true, nameVi: true, status: true, method: true, direction: true },
            orderBy: { code: 'asc' },
          }),
        );
      case 'ipms.get_scorecard':
        return this.prisma.withTenant(user.tenantId, (tx) =>
          args.scorecardId
            ? tx.scorecard.findMany({
                where: { id: String(args.scorecardId), deletedAt: null },
                include: { items: { where: { deletedAt: null } } },
              })
            : tx.scorecard.findMany({
                where: { deletedAt: null },
                select: { id: true, nameVi: true, status: true, period: true },
              }),
        );
      case 'ipms.get_task_dictionary':
        return this.prisma.withTenant(user.tenantId, (tx) =>
          tx.taskCell.findMany({
            where: {
              deletedAt: null,
              ...(args.configVersionId ? { configVersionId: String(args.configVersionId) } : {}),
            },
            select: {
              id: true, code: true, nameVi: true, responsibleRole: true,
              accountableRole: true, kpiRef: true, aiLevel: true,
            },
            orderBy: { code: 'asc' },
          }),
        );
      case 'ipms.propose_org_change':
        return this.propose(user, 'org_change', name, args as ProposeArgs);
      case 'ipms.propose_derivation_rule':
        return this.propose(user, 'derivation_rule', name, args as ProposeArgs);
      default:
        // Tool có trong registry nhưng chưa có handler — fail tường minh, không im lặng
        throw new UnprocessableEntityException(`Tool '${name}' chưa có handler phía server`);
    }
  }

  /** propose_* — human-in-the-loop: KHÔNG chạm dữ liệu nghiệp vụ, chỉ xếp hàng chờ duyệt. */
  private propose(user: RequestUser, type: string, toolName: string, args: ProposeArgs) {
    if (!args.proposal || typeof args.proposal !== 'object') {
      throw new UnprocessableEntityException('Thiếu proposal (object)');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      if (args.configVersionId) await this.config.mustGetDraft(tx as TenantTx, args.configVersionId);
      return tx.aiSuggestion.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          configVersionId: args.configVersionId ?? null,
          type, payload: args.proposal as any, reason: args.reason,
          status: 'pending', createdByTool: toolName, createdBy: user.claims.sub,
        },
      });
    });
  }

  // ===== ai_suggestion lifecycle (HITL) =====

  async listSuggestions(user: RequestUser, status?: string) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiSuggestion.findMany({
        where: { deletedAt: null, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
    // [F161] payload.replay chứa NGUYÊN context đã gửi LLM (có thể là dữ liệu
    // contribution/cell gate library:curate) — endpoint này chỉ đòi config:read
    // nên KHÔNG được trả replay (giữ proposal/diff/reason cho UI duyệt).
    return rows.map((s) => ({ ...s, payload: McpService.stripReplay(s.payload) }));
  }

  /** [F161] Bỏ khối replay khỏi payload trước khi trả ra/ghi journal. */
  private static stripReplay(payload: unknown): unknown {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'replay' in (payload as object)) {
      const { replay: _drop, ...rest } = payload as Record<string, unknown>;
      return rest;
    }
    return payload;
  }

  /** [F155] Chỉ các type này materialize được vào config_change của draft — suggestion
   *  inline dạng form-fill (taskcell_draft/kpi_link/curation_dedup) chốt qua vòng
   *  self-apply của inline assist, KHÔNG đổ rác vào journal config. */
  private static MATERIALIZABLE_TYPES = new Set(['org_change', 'derivation_rule']);

  /** Accept: materialize vào config_change của DRAFT — vẫn đi tiếp vòng publish (SoD). */
  accept(user: RequestUser, id: string, input: { configVersionId?: string; note?: string }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const s = await tx.aiSuggestion.findFirst({ where: { id, deletedAt: null } });
      if (!s) throw new NotFoundException('Suggestion không tồn tại');
      if (s.status !== 'pending') throw new ConflictException(`Suggestion đã ${s.status}`);
      if (!McpService.MATERIALIZABLE_TYPES.has(s.type)) {
        throw new UnprocessableEntityException(
          `Suggestion type '${s.type}' không materialize được vào config draft (chỉ org_change/derivation_rule)`,
        );
      }

      const targetVersionId = input.configVersionId ?? s.configVersionId;
      if (!targetVersionId) {
        throw new UnprocessableEntityException('Cần configVersionId (draft) để materialize suggestion');
      }
      await this.config.mustGetDraft(tx as TenantTx, targetVersionId);

      // Conditional update chống double-accept (chuẩn F28)
      const updated = await tx.aiSuggestion.updateMany({
        where: { id, status: 'pending', version: s.version },
        data: {
          status: 'accepted', decidedBy: user.claims.sub, decidedAt: new Date(),
          decisionNote: input.note, configVersionId: targetVersionId,
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Suggestion vừa bị quyết định bởi người khác (reload)');

      // [F161] Journal config_change chỉ nhận PROPOSAL (không replay/diff — replay
      // có thể chứa dữ liệu gate quyền khác và phình journal vô ích)
      const materialized = (s.payload as any)?.proposal ?? McpService.stripReplay(s.payload);
      await this.config.recordChange(
        tx as TenantTx, user, targetVersionId,
        `ai_suggestion:${s.type}`, s.id, 'create', null,
        { suggestion_id: s.id, payload: materialized, reason: s.reason, accepted_by: user.claims.sub },
      );
      // [F168] Quyết định qua vòng MCP cũng là tín hiệu học (corpus đủ: mọi quyết
      // định trên ai_suggestion đều thành 1 signal) — cùng tx, chuẩn L0
      await this.learning.record(tx as any, user.tenantId, {
        suggestionId: s.id,
        agent: s.createdByTool ?? s.type,
        decision: 'accepted',
        proposedPayload: ((s.payload as any)?.proposal ?? s.payload) as Record<string, unknown>,
        actorUserId: user.claims.sub,
      });
      return tx.aiSuggestion.findFirst({ where: { id } });
    });
  }

  reject(user: RequestUser, id: string, note?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const s = await tx.aiSuggestion.findFirst({ where: { id, deletedAt: null } });
      if (!s) throw new NotFoundException('Suggestion không tồn tại');
      if (s.status !== 'pending') throw new ConflictException(`Suggestion đã ${s.status}`);
      const updated = await tx.aiSuggestion.updateMany({
        where: { id, status: 'pending', version: s.version },
        data: {
          status: 'rejected', decidedBy: user.claims.sub, decidedAt: new Date(),
          decisionNote: note, updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Suggestion vừa bị quyết định bởi người khác (reload)');
      // [F168] reject cũng phát tín hiệu học (cùng tx)
      await this.learning.record(tx as any, user.tenantId, {
        suggestionId: s.id,
        agent: s.createdByTool ?? s.type,
        decision: 'rejected',
        proposedPayload: ((s.payload as any)?.proposal ?? s.payload) as Record<string, unknown>,
        actorUserId: user.claims.sub,
      });
      return tx.aiSuggestion.findFirst({ where: { id } });
    });
  }
}
