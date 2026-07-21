/**
 * [Last-mile Lát 3] Unit thuần cho AnthropicLlmClient — transport TIÊM (canned events
 * khớp shape thật RawMessageStreamEvent của @anthropic-ai/sdk), KHÔNG mạng/không key.
 */
import { AnthropicLlmClient, AnthropicStreamEvent, AnthropicTransport } from '../../src/modules/ai/llm/anthropic-llm-client';
import { LlmStreamChunk } from '../../src/modules/ai/llm/llm-client';

function fakeTransport(events: AnthropicStreamEvent[]): { transport: AnthropicTransport; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    transport: {
      messages: {
        async *stream(params: Record<string, unknown>) {
          calls.push(params);
          for (const e of events) yield e;
        },
      },
    },
  };
}

async function collect(iter: AsyncIterable<LlmStreamChunk>): Promise<LlmStreamChunk[]> {
  const out: LlmStreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe('AnthropicLlmClient.stream() — map RawMessageStreamEvent → LlmStreamChunk', () => {
  it('text_delta gộp thành các chunk text, usage từ message_start/message_delta', async () => {
    const { transport } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 42 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Xin ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'chào' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    const chunks = await collect(client.stream({ agent: 'x', prompt: 'chào' }));
    expect(chunks).toEqual([
      { type: 'text', text: 'Xin ' },
      { type: 'text', text: 'chào' },
      { type: 'done', usage: { model: 'claude-opus-4-8', tokensIn: 42, tokensOut: 10, costUsd: 0 } },
    ]);
  });

  it('tool_use: input_json_delta rải rác → 1 chunk tool_use duy nhất khi content_block_stop', async () => {
    const { transport } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'propose_change' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"a":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '1}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    const chunks = await collect(client.stream({ agent: 'x', prompt: 'y' }));
    expect(chunks).toEqual([
      { type: 'tool_use', toolName: 'propose_change', toolInput: { a: 1 } },
      { type: 'done', usage: { model: 'claude-opus-4-8', tokensIn: 5, tokensOut: 8, costUsd: 0 } },
    ]);
  });

  it('tool_use JSON hỏng → toolInput={raw: chuỗi thô}, KHÔNG throw', async () => {
    const { transport } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 't' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{not json' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    const chunks = await collect(client.stream({ agent: 'x', prompt: 'y' }));
    expect(chunks[0]).toEqual({ type: 'tool_use', toolName: 't', toolInput: { raw: '{not json' } });
  });

  it('thinking_delta/signature_delta KHÔNG forward ra ngoài (backlog minh bạch)', async () => {
    const { transport } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'suy nghĩ nội bộ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Câu trả lời' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    const chunks = await collect(client.stream({ agent: 'x', prompt: 'y' }));
    expect(chunks.filter((c) => c.type === 'text')).toEqual([{ type: 'text', text: 'Câu trả lời' }]);
    expect(JSON.stringify(chunks)).not.toContain('suy nghĩ nội bộ');
  });

  it('model mặc định claude-opus-4-8 + thinking:adaptive gửi trong params khi model thuộc nhóm adaptive', async () => {
    const { transport, calls } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    await collect(client.stream({ agent: 'x', prompt: 'y' }));
    expect(calls[0].model).toBe('claude-opus-4-8');
    expect(calls[0].thinking).toEqual({ type: 'adaptive' });
    expect(calls[0]).not.toHaveProperty('budget_tokens');
    expect(calls[0]).not.toHaveProperty('temperature');
  });

  it('context (JSON) được ghép vào nội dung message gửi lên', async () => {
    const { transport, calls } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]);
    const client = AnthropicLlmClient.withTransport(transport);
    await collect(client.stream({ agent: 'x', prompt: 'Hỏi gì đó', context: { org: 'H.01' } }));
    const messages = calls[0].messages as Array<{ content: string }>;
    expect(messages[0].content).toContain('Hỏi gì đó');
    expect(messages[0].content).toContain('"org":"H.01"');
  });
});

describe('AnthropicLlmClient.complete() — gộp text stream thành 1 response', () => {
  it('text thường ⇒ json=undefined; JSON hợp lệ ⇒ json parse được', async () => {
    const textEvents: AnthropicStreamEvent[] = [
      { type: 'message_start', message: { usage: { input_tokens: 3 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'không phải JSON' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 4 } },
      { type: 'message_stop' },
    ];
    const { transport: t1 } = fakeTransport(textEvents);
    const res1 = await AnthropicLlmClient.withTransport(t1).complete({ agent: 'x', prompt: 'y' });
    expect(res1.text).toBe('không phải JSON');
    expect(res1.json).toBeUndefined();
    expect(res1.tokensIn).toBe(3);
    expect(res1.tokensOut).toBe(4);
    expect(res1.costUsd).toBe(0); // [Lát 3] client không tự định giá — gateway ghi đè

    const jsonEvents: AnthropicStreamEvent[] = [
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"kpiRef":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '"FIN-001"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ];
    const { transport: t2 } = fakeTransport(jsonEvents);
    const res2 = await AnthropicLlmClient.withTransport(t2).complete({ agent: 'x', prompt: 'y' });
    expect(res2.json).toEqual({ kpiRef: 'FIN-001' });
  });
});

describe('AnthropicLlmClient — thiếu key (RED-LINE, không có transport tiêm)', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterAll(() => { if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY; });

  it('stream() không có key → throw trước khi chạm SDK/mạng', async () => {
    const client = new AnthropicLlmClient();
    await expect(collect(client.stream({ agent: 'x', prompt: 'y' })))
      .rejects.toThrow(/ANTHROPIC_API_KEY chưa được cấp/);
  });
});
