import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { LlmClient, LlmRequest, LlmResponse, LlmStreamChunk } from './llm-client';

/**
 * [Last-mile Lát 3] Claude API THẬT — vẫn CHƯA kích hoạt trên đường sống (RED-LINE:
 * chờ chủ dự án cấp ANTHROPIC_API_KEY + bật cờ ai_gateway_live — OWNER_DIGEST).
 * Khác lát trước: giờ đây implement THẬT (không còn NotImplementedException) — nếu
 * key được cấp và cờ bật, request sẽ THỰC SỰ đi ra Anthropic. selectLlmBackend vẫn
 * là cổng fail-closed vòng ngoài; Egress Policy (Lát 2) là cổng thứ hai độc lập.
 *
 * `client` là 1 interface RÚT GỌN của SDK thật (chỉ `messages.stream`) — TIÊM ĐƯỢC
 * qua constructor để test bằng transport giả (canned events, không mạng/không key).
 * Mặc định (production) tự khởi tạo `new Anthropic({apiKey})` LƯỜI (chỉ khi thực sự
 * gọi — app boot không cần key để không vỡ khi CHƯA cấp).
 *
 * PHẠM VI LÁT NÀY (minh bạch, chưa làm): map đủ text + tool_use + usage — KHÔNG map
 * `type: 'suggestion'` (MockLlmClient tự chế loại chunk này để demo HITL trên mock;
 * Claude thật cần 1 thiết kế tool-schema riêng cho "đề xuất thay đổi" — để dành cho
 * lát tính năng Copilot-live sau, ngoài phạm vi hạ tầng last-mile).
 */

const DEFAULT_MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 4_096;

// [skill claude-api] Opus 4.8/4.7/4.6, Sonnet 5/4.6, Fable 5 dùng thinking:{type:'adaptive'}
// — KHÔNG budget_tokens/temperature/prefill trên các model này (400 nếu gửi kèm).
const ADAPTIVE_THINKING_MODELS = new Set([
  'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
  'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-fable-5',
]);

/** Bề mặt tối thiểu ta cần từ SDK — KHÔNG kéo toàn bộ type Anthropic vào chữ ký public. */
export interface AnthropicTransport {
  messages: {
    stream(params: Record<string, unknown>): AsyncIterable<AnthropicStreamEvent>;
  };
}

/** Rút gọn RawMessageStreamEvent của SDK — đủ để map, khớp shape thật (không tự chế). */
export type AnthropicStreamEvent =
  | { type: 'message_start'; message: { usage?: { input_tokens?: number } } }
  | { type: 'content_block_start'; index: number; content_block: { type: string; name?: string } }
  | {
      type: 'content_block_delta'; index: number;
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'thinking_delta'; thinking: string }
        | { type: 'input_json_delta'; partial_json: string }
        | { type: 'signature_delta'; signature: string };
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string | null }; usage?: { output_tokens?: number } }
  | { type: 'message_stop' };

/**
 * [Last-mile Lát 3] @Injectable (không còn `new AnthropicLlmClient()` cứng trong
 * ai-gateway.service) — cho phép test override provider bằng bản `withTransport()`
 * (fake, không mạng) qua toàn bộ pipeline gateway thật (scrub → egress → cost) mà
 * không cần key/không chạm Anthropic.
 */
@Injectable()
export class AnthropicLlmClient implements LlmClient {
  private transport: AnthropicTransport | null = null;

  /** [test-only] Tiêm transport giả — bỏ qua SDK thật hoàn toàn, không mạng/không key. */
  static withTransport(transport: AnthropicTransport): AnthropicLlmClient {
    const c = new AnthropicLlmClient();
    c.transport = transport;
    return c;
  }

  private getTransport(): AnthropicTransport {
    if (this.transport) return this.transport;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Không nên tới đây (selectLlmBackend đã fail-closed) — vẫn chặn tường minh
      // phòng khi ai đó gọi thẳng client này ngoài luồng gateway.
      throw new Error('ai-gateway: ANTHROPIC_API_KEY chưa được cấp — RED-LINE (OWNER_DIGEST).');
    }
    this.transport = new Anthropic({ apiKey }) as unknown as AnthropicTransport;
    return this.transport;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    for await (const chunk of this.stream(req)) {
      if (chunk.type === 'text' && chunk.text) text += chunk.text;
      if (chunk.type === 'done' && chunk.usage) {
        tokensIn = chunk.usage.tokensIn;
        tokensOut = chunk.usage.tokensOut;
      }
    }
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = undefined; }
    const model = req.model ?? DEFAULT_MODEL;
    // costUsd tính THẬT ở ai-gateway.service (có tenantId để tra ai_model_price đúng
    // override) — client này chỉ báo cáo usage, không tự định giá.
    return { model, text, json, tokensIn, tokensOut, costUsd: 0 };
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const model = req.model ?? DEFAULT_MODEL;
    const params: Record<string, unknown> = {
      model,
      max_tokens: MAX_TOKENS,
      messages: [{
        role: 'user',
        content: req.context !== undefined
          ? `${req.prompt}\n\nContext (JSON):\n${JSON.stringify(req.context)}`
          : req.prompt,
      }],
    };
    if (ADAPTIVE_THINKING_MODELS.has(model)) {
      params.thinking = { type: 'adaptive' };
    }

    const transport = this.getTransport();
    let tokensIn = 0;
    let tokensOut = 0;
    // content_block index → {tool name, JSON tích luỹ} — Anthropic gửi input_json_delta
    // rải rác qua nhiều event; chỉ emit MỘT chunk tool_use (khớp contract sẵn có, cùng
    // shape với MockLlmClient) khi block đóng (content_block_stop).
    const toolBuffers = new Map<number, { name: string; json: string }>();

    for await (const event of transport.messages.stream(params)) {
      switch (event.type) {
        case 'message_start':
          tokensIn = event.message.usage?.input_tokens ?? 0;
          break;
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            toolBuffers.set(event.index, { name: event.content_block.name ?? 'unknown_tool', json: '' });
          }
          break;
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            const buf = toolBuffers.get(event.index);
            if (buf) buf.json += event.delta.partial_json;
          }
          // thinking_delta/signature_delta: KHÔNG forward — FE chưa có bề mặt tách
          // reasoning trace khỏi câu trả lời (backlog last-mile, ngoài phạm vi lát này).
          break;
        case 'content_block_stop': {
          const buf = toolBuffers.get(event.index);
          if (buf) {
            let toolInput: unknown = {};
            try { toolInput = buf.json ? JSON.parse(buf.json) : {}; } catch { toolInput = { raw: buf.json }; }
            yield { type: 'tool_use', toolName: buf.name, toolInput };
            toolBuffers.delete(event.index);
          }
          break;
        }
        case 'message_delta':
          if (event.usage?.output_tokens !== undefined) tokensOut = event.usage.output_tokens;
          break;
        case 'message_stop':
          break;
        default:
          break;
      }
    }
    // costUsd=0 placeholder — ai-gateway.service ghi đè bằng giá thật (có tenantId).
    yield { type: 'done', usage: { model, tokensIn, tokensOut, costUsd: 0 } };
  }
}
