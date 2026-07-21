import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { LlmClient, LlmRequest, LlmResponse, LlmStreamChunk, selectLlmBackend } from './llm/llm-client';
import { MockLlmClient } from './llm/mock-llm-client';
import { AnthropicLlmClient } from './llm/anthropic-llm-client';
import { PiiScrubService } from './pii/pii-scrub.service';
import type { PiiKind } from './pii/pii-scrubber';
import { EgressPolicyService } from './egress/egress-policy.service';
import type { DataClass, EgressDestination } from './egress/egress-policy';
import { EconomicsService } from './economics/economics.service';
import { costForUsage } from './economics/economics.util';

/**
 * ai-gateway (#3 hạ tầng) — cổng DUY NHẤT gọi LLM:
 * - Backend chọn theo feature flag `ai_gateway_live` (tenant override > global) + API key.
 *   Mặc định OFF ⇒ MockLlmClient (tất định, 0 chi phí) — RED-LINE không gọi API thật.
 * - MỌI lượt gọi ghi `ai_interaction` (append-only) — nền cho AI governance dashboard.
 * - [F59 trả nợ] PII scrub THUẬN trước khi request rời gateway (client mock/thật chỉ thấy
 *   bản đã scrub — log ai_interaction cũng ghi bản NÀY) và NGHỊCH trên response cho caller
 *   nội bộ (rehydrate ở RAM, không persist map ra DB).
 * - [Last-mile Lát 2] Egress Policy — lớp gác THỨ HAI, cắt ngang, độc lập với cờ
 *   ai_gateway_live: dữ liệu confidential/pii KHÔNG BAO GIỜ rời mock (self-host chưa
 *   triển khai), dù cờ bật + có key. Chặn → status='blocked', KHÔNG gọi client.
 * - [Last-mile Lát 3] costUsd cho backend=anthropic tính THẬT qua EconomicsService
 *   (ai_model_price, tenant override thắng global — F167) NGAY TẠI ĐÂY (client chỉ
 *   báo cáo usage, không tự định giá — 1 nơi giữ luật giá, dùng chung với báo cáo §16).
 */
@Injectable()
export class AiGatewayService {
  private mock: LlmClient = new MockLlmClient();

  constructor(
    private prisma: PrismaService, private pii: PiiScrubService,
    private egress: EgressPolicyService, private economics: EconomicsService,
    // [Lát 3] DI (không `new` cứng) — test override bằng withTransport() giả.
    private anthropic: AnthropicLlmClient,
  ) {}

  /** [Lát 3] Giá THẬT cho 1 lượt anthropic — chỉ gọi khi backend='anthropic' (mock giữ
   *  nguyên costUsd=0 từ MockLlmClient, không tra giá, không đổi hành vi cũ). */
  private async realCost(tenantId: string, model: string, tokensIn: number, tokensOut: number): Promise<number> {
    const price = await this.economics.priceForModel(tenantId, model);
    return costForUsage(tokensIn, tokensOut, price);
  }

  /**
   * [Last-mile Lát 2] Chặn TRƯỚC khi gọi client — nhận `req` ĐÃ SCRUB (gọi SAU pii.scrubRequest
   * trong complete()/stream()) để nếu bị chặn, audit log VẪN không bao giờ giữ PII gốc
   * (dù chính request đó bị đánh dấu confidential/pii và không đi đâu cả).
   */
  private async guardEgress(
    user: RequestUser, scrubbedReq: LlmRequest, piiCounts: Partial<Record<PiiKind, number>>,
    backend: 'anthropic' | 'mock', toolName?: string,
  ) {
    const dataClass: DataClass = scrubbedReq.dataClass ?? 'internal';
    const destination: EgressDestination = backend === 'anthropic' ? 'anthropic' : 'mock';
    const decision = await this.egress.resolve(user.tenantId, dataClass, destination);
    if (!decision.allowed) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { blocked: true, reason: decision.reason },
        latencyMs: 0, status: 'blocked', piiCounts,
      });
      throw new ForbiddenException(`ai-gateway: egress bị chặn — ${decision.reason}`);
    }
  }

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
    // [F59] scrub TRƯỚC khi rời gateway — client (mock hay thật) chỉ thấy bản đã scrub.
    const { prompt, context, map, counts } = await this.pii.scrubRequest(user.tenantId, req.prompt, req.context);
    const scrubbedReq: LlmRequest = { ...req, prompt, context };
    await this.guardEgress(user, scrubbedReq, counts, backend, toolName); // [Lát 2] throws nếu bị chặn — đã tự log
    try {
      const res = await client.complete(scrubbedReq);
      // [Lát 3] anthropic → costUsd THẬT (client chỉ trả 0 placeholder); mock giữ nguyên.
      const costUsd = backend === 'anthropic'
        ? await this.realCost(user.tenantId, res.model, res.tokensIn, res.tokensOut)
        : res.costUsd;
      await this.log(user, scrubbedReq, toolName, {
        model: res.model, output: res.json ?? res.text,
        tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd,
        latencyMs: Date.now() - t0, status: 'ok', piiCounts: counts,
      });
      // Nghịch — caller nội bộ nhận bản THẬT (map chỉ tồn tại trong RAM lượt gọi này).
      return {
        ...res,
        costUsd,
        text: this.pii.rehydrateText(res.text, map),
        json: res.json !== undefined ? this.pii.rehydrateValue(res.json, map) : res.json,
      };
    } catch (e) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { error: (e as Error).message },
        latencyMs: Date.now() - t0, status: 'error', piiCounts: counts,
      });
      throw e;
    }
  }

  /**
   * [P1 Copilot] Stream LLM + log ai_interaction khi kết thúc.
   * [Lát 3] AnthropicLlmClient.stream() giờ THẬT (không còn stub) — nhánh fallback dưới
   * đây là lưới an toàn thuần tuý (LlmClient tương lai lỡ không implement stream), KHÔNG
   * còn phải là đường đi thường trực như trước lát 3.
   */
  async *stream(user: RequestUser, req: LlmRequest, toolName?: string): AsyncIterable<LlmStreamChunk> {
    const backend = await this.resolveBackend(user.tenantId);
    const chosen = backend === 'anthropic' ? this.anthropic : this.mock;
    if (backend === 'anthropic' && !chosen.stream) {
      // eslint-disable-next-line no-console
      console.warn('[ai-gateway] backend=anthropic nhưng client hiện tại thiếu stream() — tạm fallback MockLlmClient.');
    }
    const client = chosen.stream ? chosen : this.mock;
    const t0 = Date.now();
    // [F59] scrub TRƯỚC khi rời gateway; rehydrate TĂNG DẦN trên đường ra (StreamRehydrator
    // giữ lại đuôi token vỡ giữa 2 chunk — không lộ nửa token, không rơi ký tự thật).
    const { prompt, context, map, counts } = await this.pii.scrubRequest(user.tenantId, req.prompt, req.context);
    const scrubbedReq: LlmRequest = { ...req, prompt, context };
    // [Lát 2] Đánh giá theo `backend` ĐÃ RESOLVE (ý định cấu hình: flag+key), KHÔNG theo
    // `client` fallback thực tế — nếu không, hành vi chặn sẽ đổi âm thầm giữa "trước/sau
    // khi AnthropicLlmClient hỗ trợ stream()" dù cấu hình egress không đổi. throws nếu bị
    // chặn — đã tự log.
    await this.guardEgress(user, scrubbedReq, counts, backend, toolName);
    const rehydrator = this.pii.createStreamRehydrator(map);
    let acc = ''; // tích luỹ bản ĐÃ SCRUB (đúng những gì client LLM thực sự thấy) — dùng để log
    let usage: LlmStreamChunk['usage'];
    try {
      for await (const chunk of client.stream!(scrubbedReq)) {
        if (chunk.type === 'text' && chunk.text) {
          acc += chunk.text;
          const safe = rehydrator.push(chunk.text);
          if (safe) yield { ...chunk, text: safe };
          continue;
        }
        if (chunk.type === 'done') {
          usage = chunk.usage;
          const tail = rehydrator.flush();
          if (tail) yield { type: 'text', text: tail };
          yield chunk;
          continue;
        }
        if (chunk.type === 'suggestion' && chunk.suggestion) {
          yield {
            ...chunk,
            suggestion: {
              ...chunk.suggestion,
              summary: this.pii.rehydrateText(chunk.suggestion.summary, map),
              reason: chunk.suggestion.reason ? this.pii.rehydrateText(chunk.suggestion.reason, map) : chunk.suggestion.reason,
              payload: chunk.suggestion.payload !== undefined ? this.pii.rehydrateValue(chunk.suggestion.payload, map) : chunk.suggestion.payload,
            },
          };
          continue;
        }
        if (chunk.type === 'tool_use' && chunk.toolInput !== undefined) {
          yield { ...chunk, toolInput: this.pii.rehydrateValue(chunk.toolInput, map) };
          continue;
        }
        yield chunk;
      }
      // [Lát 3] anthropic → costUsd THẬT cho log (chunk 'done' ĐÃ yield cho caller với
      // placeholder 0 — không ai đọc costUsd từ chunk stream hiện tại, chỉ ai_interaction
      // cần số đúng cho báo cáo economics §16).
      const costUsd = backend === 'anthropic' && usage
        ? await this.realCost(user.tenantId, usage.model, usage.tokensIn, usage.tokensOut)
        : usage?.costUsd;
      await this.log(user, scrubbedReq, toolName, {
        model: usage?.model ?? backend, output: acc.slice(0, 4000),
        tokensIn: usage?.tokensIn, tokensOut: usage?.tokensOut, costUsd,
        latencyMs: Date.now() - t0, status: 'ok', piiCounts: counts,
      });
    } catch (e) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { error: (e as Error).message },
        latencyMs: Date.now() - t0, status: 'error', piiCounts: counts,
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
         costUsd?: number; latencyMs: number; status: string; piiCounts?: Partial<Record<PiiKind, number>> },
  ) {
    // [F59] req đến đây LUÔN LÀ BẢN ĐÃ SCRUB (complete()/stream() truyền scrubbedReq) —
    // audit log không bao giờ giữ PII gốc. piiScrubbed = số lượng theo loại, minh bạch
    // cho dashboard governance mà KHÔNG lộ giá trị thật.
    const piiScrubbed = r.piiCounts && Object.keys(r.piiCounts).length > 0 ? r.piiCounts : undefined;
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiInteraction.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub, agent: req.agent,
          toolName, model: r.model, promptVersion: req.promptVersion,
          input: { prompt: req.prompt, context: req.context ?? null, piiScrubbed } as any,
          output: (r.output ?? undefined) as any,
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd,
          latencyMs: r.latencyMs, status: r.status,
        },
      }),
    );
  }
}
