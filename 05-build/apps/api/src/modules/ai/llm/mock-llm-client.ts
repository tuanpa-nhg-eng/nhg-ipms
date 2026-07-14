import { LlmClient, LlmRequest, LlmResponse, LlmStreamChunk } from './llm-client';

/** FNV-1a 32-bit — hash tất định để mock "chấm điểm" ổn định giữa các lần chạy. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * MockLlmClient — TẤT ĐỊNH, không mạng, không chi phí.
 * Cùng (agent, prompt, context) ⇒ cùng output byte-một-byte — nền cho eval harness
 * chạy trong CI và cho dev khi chưa có API key (RED-LINE).
 */
export class MockLlmClient implements LlmClient {
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const seed = fnv1a(`${req.agent}::${req.prompt}::${JSON.stringify(req.context ?? null)}`);
    const json = this.route(req, seed);
    const text = JSON.stringify(json);
    return {
      model: 'mock',
      text,
      json,
      tokensIn: Math.ceil(req.prompt.length / 4),
      tokensOut: Math.ceil(text.length / 4),
      costUsd: 0,
    };
  }

  /**
   * [P1 Copilot] Stream tất định — trả lời dạng chat, minh hoạ đầy đủ UX:
   * text theo từng "từ" → (nếu là lệnh /slash hoặc yêu cầu thay đổi) thẻ tool-call
   * + thẻ đề xuất HITL → done. KHÔNG mạng, không chi phí; thay bằng Claude stream sau.
   */
  async *stream(req: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const seed = fnv1a(`${req.agent}::${req.prompt}::${JSON.stringify(req.context ?? null)}`);
    const p = req.prompt.trim();
    const slash = p.startsWith('/') ? p.slice(1).split(/\s+/)[0] : null;

    // 1) Câu mở đầu tất định (theo seed) + echo yêu cầu
    const openers = [
      'Mình đã đọc yêu cầu của bạn.',
      'Rõ rồi, để mình xử lý.',
      'Được, mình phân tích nhé.',
    ];
    const opener = openers[seed % openers.length];
    const head = slash
      ? `${opener} Bạn đang chạy tác vụ \`/${slash}\`.`
      : `${opener} Về "${p.slice(0, 100)}"${p.length > 100 ? '…' : ''}:`;
    for (const w of head.split(' ')) yield { type: 'text', text: w + ' ' };

    let tokensOut = head.length;

    // 2) Nếu là slash hoặc yêu cầu tạo/sửa → mô phỏng gọi MCP tool + đề xuất HITL
    const isChange = slash != null || /(tạo|thêm|sửa|đề xuất|derive|draft|soạn)/i.test(p);
    if (isChange) {
      const toolName = slash === 'derive' ? 'derivation.run'
        : slash === 'draft-taskcell' ? 'taskcell.draft'
        : slash === 'find-duplicates' ? 'dedup.scan'
        : 'config.propose';
      yield { type: 'tool_use', toolName, toolInput: { query: p.slice(0, 80) } };

      const body = '\n\nĐây là bản nháp mình đề xuất (bạn duyệt trước khi áp — mọi thay đổi đều cần người xác nhận):';
      for (const w of body.split(' ')) yield { type: 'text', text: w + ' ' };
      tokensOut += body.length;

      yield {
        type: 'suggestion',
        suggestion: {
          type: slash === 'derive' ? 'derivation_rule' : 'config_change',
          summary: `[MOCK] Đề xuất cho: ${p.slice(0, 80)}`,
          reason: '[MOCK] Sinh từ MockLlmClient (chưa gọi Claude — chờ API key). Chấp nhận để đưa vào bản nháp cấu hình.',
          payload: { echo: p, agent: req.agent, seed: seed % 1000 },
        },
      };
    } else {
      const body = `\n\n[MOCK] Đây là câu trả lời mô phỏng tất định. Khi bật cờ \`ai_gateway_live\` + có API key Anthropic, câu trả lời sẽ do Claude (mặc định Opus 4.8) sinh ra — không phải sửa gì ở giao diện.`;
      for (const w of body.split(' ')) yield { type: 'text', text: w + ' ' };
      tokensOut += body.length;
    }

    yield {
      type: 'done',
      usage: {
        model: 'mock',
        tokensIn: Math.ceil(req.prompt.length / 4),
        tokensOut: Math.ceil(tokensOut / 4),
        costUsd: 0,
      },
    };
  }

  /** Output theo agent — shape khớp contract để FE/eval viết trước, thay client thật sau. */
  private route(req: LlmRequest, seed: number): unknown {
    const confidence = Number(((seed % 500) / 1000 + 0.5).toFixed(3)); // 0.500–0.999 tất định
    switch (req.agent) {
      case 'config_copilot':
        return {
          suggestion_type: 'org_change',
          proposal: {
            summary: `[MOCK] Bản nháp từ mô tả: ${req.prompt.slice(0, 120)}`,
            context_echo: req.context ?? null,
          },
          reason: '[MOCK] Đề xuất sinh từ MockLlmClient — thay bằng Claude khi có API key.',
          confidence,
        };
      case 'kpi_designer':
        return {
          suggestion_type: 'kpi_draft',
          kpis: [{ code: `KPI-MOCK-${seed % 1000}`, name_vi: `[MOCK] KPI cho: ${req.prompt.slice(0, 80)}`, weight: 100 }],
          confidence,
        };
      default:
        return { echo: req.prompt, agent: req.agent, confidence };
    }
  }
}
