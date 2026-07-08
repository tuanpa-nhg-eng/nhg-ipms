import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { LlmClient, LlmRequest, LlmResponse, selectLlmBackend } from './llm/llm-client';
import { MockLlmClient } from './llm/mock-llm-client';
import { AnthropicLlmClient } from './llm/anthropic-llm-client';

/**
 * ai-gateway (#3 hạ tầng) — cổng DUY NHẤT gọi LLM:
 * - Backend chọn theo feature flag `ai_gateway_live` (tenant override > global) + API key.
 *   Mặc định OFF ⇒ MockLlmClient (tất định, 0 chi phí) — RED-LINE không gọi API thật.
 * - MỌI lượt gọi ghi `ai_interaction` (append-only) — nền cho AI governance dashboard.
 */
@Injectable()
export class AiGatewayService {
  private mock: LlmClient = new MockLlmClient();
  private anthropic: LlmClient = new AnthropicLlmClient();

  constructor(private prisma: PrismaService) {}

  /** Flag tenant override thắng global; không có row nào ⇒ OFF (fail-closed). */
  async resolveBackend(tenantId: string): Promise<'anthropic' | 'mock'> {
    const flags = await this.prisma.withTenant(tenantId, (tx) =>
      tx.featureFlag.findMany({ where: { key: 'ai_gateway_live' } }),
    );
    const tenantFlag = flags.find((f) => f.tenantId === tenantId);
    const globalFlag = flags.find((f) => f.tenantId === null);
    const enabled = (tenantFlag ?? globalFlag)?.enabled ?? false;
    return selectLlmBackend({ liveFlagEnabled: enabled, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
  }

  /** Gọi LLM + log ai_interaction (kể cả khi lỗi — status='error'). */
  async complete(user: RequestUser, req: LlmRequest, toolName?: string): Promise<LlmResponse> {
    const backend = await this.resolveBackend(user.tenantId);
    const client = backend === 'anthropic' ? this.anthropic : this.mock;
    const t0 = Date.now();
    try {
      const res = await client.complete(req);
      await this.log(user, req, toolName, {
        model: res.model, output: res.json ?? res.text,
        tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd,
        latencyMs: Date.now() - t0, status: 'ok',
      });
      return res;
    } catch (e) {
      await this.log(user, req, toolName, {
        model: backend, output: { error: (e as Error).message },
        latencyMs: Date.now() - t0, status: 'error',
      });
      throw e;
    }
  }

  /** Log tool-call KHÔNG qua LLM (MCP read-only tools) — vẫn phải vào ai_interaction (§9). */
  logToolCall(
    user: RequestUser, toolName: string, input: unknown, output: unknown,
    latencyMs: number, status: 'ok' | 'error' | 'blocked' = 'ok',
  ) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiInteraction.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub, agent: 'mcp',
          toolName, input: (input ?? undefined) as any,
          // Output tool đọc có thể lớn — chỉ log metadata (đã có audit_log cho hành vi)
          output: (output ?? undefined) as any,
          latencyMs, status,
        },
      }),
    );
  }

  private log(
    user: RequestUser, req: LlmRequest, toolName: string | undefined,
    r: { model: string; output: unknown; tokensIn?: number; tokensOut?: number;
         costUsd?: number; latencyMs: number; status: string },
  ) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiInteraction.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub, agent: req.agent,
          toolName, model: r.model, promptVersion: req.promptVersion,
          input: { prompt: req.prompt, context: req.context ?? null } as any,
          output: (r.output ?? undefined) as any,
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd,
          latencyMs: r.latencyMs, status: r.status,
        },
      }),
    );
  }
}
