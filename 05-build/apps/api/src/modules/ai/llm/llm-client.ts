/**
 * ai-gateway — lớp trừu tượng LLM (Phase 3 lát 4a).
 * Mặc định MockLlmClient (tất định, không mạng). AnthropicLlmClient chỉ là chỗ cắm —
 * RED-LINE: KHÔNG gọi API thật cho tới khi chủ dự án cấp key + budget.
 */

export interface LlmRequest {
  /** Agent nghiệp vụ đứng sau lời gọi: 'config_copilot' | 'kpi_designer' | 'eval_harness'... */
  agent: string;
  prompt: string;
  /** Ngữ cảnh cấu trúc (org tree, KPI list...) — mock echo lại để test tất định. */
  context?: unknown;
  promptVersion?: string;
}

export interface LlmResponse {
  model: string; // 'mock' | 'claude-*'
  text: string;
  /** Kết quả cấu trúc (nếu agent yêu cầu JSON). */
  json?: unknown;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Chọn backend — PURE function (unit-test được):
 * chỉ dùng client thật khi flag `ai_gateway_live` bật VÀ có API key.
 * Mọi trường hợp khác fail-closed về mock (không chi tiền, không mạng).
 */
export function selectLlmBackend(opts: { liveFlagEnabled: boolean; hasApiKey: boolean }): 'anthropic' | 'mock' {
  return opts.liveFlagEnabled && opts.hasApiKey ? 'anthropic' : 'mock';
}
