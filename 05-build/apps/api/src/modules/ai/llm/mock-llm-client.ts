import { LlmClient, LlmRequest, LlmResponse } from './llm-client';

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
