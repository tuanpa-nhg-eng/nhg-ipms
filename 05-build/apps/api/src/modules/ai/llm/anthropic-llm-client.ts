import { NotImplementedException } from '@nestjs/common';
import { LlmClient, LlmRequest, LlmResponse } from './llm-client';

/**
 * Chỗ cắm Claude API — CHƯA KÍCH HOẠT (RED-LINE #1 trong OWNER_DIGEST:
 * chờ chủ dự án cấp Anthropic API key + trần budget/tháng).
 * Khi được cấp: cài @anthropic-ai/sdk, đọc key từ vault (KHÔNG hard-code),
 * enforce budget cap theo tenant, ghi tokens/cost vào ai_interaction.
 */
export class AnthropicLlmClient implements LlmClient {
  async complete(_req: LlmRequest): Promise<LlmResponse> {
    throw new NotImplementedException(
      'ai-gateway: Anthropic client chưa kích hoạt — RED-LINE chờ API key + budget (OWNER_DIGEST).',
    );
  }
}
