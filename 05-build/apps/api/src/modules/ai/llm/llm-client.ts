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
  /** [F147] Model + effort người dùng chọn ở picker — client thật dùng; mock bỏ qua. */
  model?: string;
  effort?: string;
  /** [Last-mile Lát 2] Phân loại dữ liệu (AI-Native PRD §9) — mặc định 'internal' nếu
   *  không khai (mọi agent nội bộ hiện có đều thuộc lớp này). Egress Policy Engine
   *  đọc field này để quyết định request có được rời gateway hay không. */
  dataClass?: 'public' | 'internal' | 'confidential' | 'pii';
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

/** [P1 Copilot] Mảnh stream — Copilot render dần. */
export interface LlmStreamChunk {
  type: 'text' | 'tool_use' | 'suggestion' | 'done';
  text?: string;
  /** type=tool_use: thẻ "đang gọi tool" hiển thị ở FE. */
  toolName?: string;
  toolInput?: unknown;
  /** type=suggestion: đề xuất HITL (accept/decline) — {type,summary,reason,payload}. */
  suggestion?: { type: string; summary: string; reason?: string; payload?: unknown };
  /** type=done: tổng kết usage. */
  usage?: { model: string; tokensIn: number; tokensOut: number; costUsd: number };
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
  /** [P1] Tuỳ chọn — chỉ Copilot dùng; agent một-phát vẫn dùng complete(). */
  stream?(req: LlmRequest): AsyncIterable<LlmStreamChunk>;
}

/**
 * Chọn backend — PURE function (unit-test được):
 * chỉ dùng client thật khi flag `ai_gateway_live` bật VÀ có API key.
 * Mọi trường hợp khác fail-closed về mock (không chi tiền, không mạng).
 */
export function selectLlmBackend(opts: { liveFlagEnabled: boolean; hasApiKey: boolean }): 'anthropic' | 'mock' {
  return opts.liveFlagEnabled && opts.hasApiKey ? 'anthropic' : 'mock';
}
