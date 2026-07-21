/**
 * Unit Phase 3 lát 4a — ai-gateway (mock LLM tất định) + eval assertion evaluator.
 * Toàn bộ pure function — không DB, không mạng.
 */
import { selectLlmBackend } from '../../src/modules/ai/llm/llm-client';
import { MockLlmClient, fnv1a } from '../../src/modules/ai/llm/mock-llm-client';
import { AnthropicLlmClient } from '../../src/modules/ai/llm/anthropic-llm-client';
import { evaluateAssertions, resolvePath } from '../../src/modules/ai/eval/assertions';

describe('selectLlmBackend — fail-closed về mock (RED-LINE)', () => {
  it('flag OFF → mock dù có key', () => {
    expect(selectLlmBackend({ liveFlagEnabled: false, hasApiKey: true })).toBe('mock');
  });
  it('flag ON nhưng KHÔNG có key → mock (không crash, không chi tiền)', () => {
    expect(selectLlmBackend({ liveFlagEnabled: true, hasApiKey: false })).toBe('mock');
  });
  it('flag OFF + không key → mock', () => {
    expect(selectLlmBackend({ liveFlagEnabled: false, hasApiKey: false })).toBe('mock');
  });
  it('chỉ khi flag ON + có key → anthropic', () => {
    expect(selectLlmBackend({ liveFlagEnabled: true, hasApiKey: true })).toBe('anthropic');
  });
});

describe('AnthropicLlmClient — chưa có key (RED-LINE)', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('[Lát 3] complete() không có key → chặn tường minh trước khi chạm mạng', async () => {
    await expect(new AnthropicLlmClient().complete({ agent: 'x', prompt: 'y' }))
      .rejects.toThrow(/ANTHROPIC_API_KEY chưa được cấp/);
  });
});

describe('MockLlmClient — TẤT ĐỊNH', () => {
  const mock = new MockLlmClient();
  const req = { agent: 'config_copilot', prompt: 'Tạo phòng Tuyển sinh 5 người', context: { org: 'H.01' } };

  it('cùng input ⇒ cùng output byte-một-byte (2 lần gọi)', async () => {
    const [a, b] = [await mock.complete(req), await mock.complete(req)];
    expect(a).toEqual(b);
    expect(a.text).toBe(b.text);
  });

  it('khác input ⇒ confidence khác (hash seed đổi)', async () => {
    const a = await mock.complete(req);
    const b = await mock.complete({ ...req, prompt: 'Khác hẳn' });
    expect(a.text).not.toBe(b.text);
  });

  it('agent config_copilot trả shape suggestion (proposal + reason + confidence)', async () => {
    const res = await mock.complete(req);
    const j = res.json as any;
    expect(j.suggestion_type).toBe('org_change');
    expect(j.proposal.context_echo).toEqual({ org: 'H.01' });
    expect(j.confidence).toBeGreaterThanOrEqual(0.5);
    expect(j.confidence).toBeLessThan(1);
  });

  it('cost = 0, model = mock (không chi tiền)', async () => {
    const res = await mock.complete(req);
    expect(res.costUsd).toBe(0);
    expect(res.model).toBe('mock');
  });

  it('fnv1a ổn định (regression pin)', () => {
    expect(fnv1a('ipms')).toBe(fnv1a('ipms'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
});

describe('evaluateAssertions — assertion cứng, fail-closed', () => {
  const output = {
    suggestion_type: 'org_change',
    proposal: { summary: '[MOCK] Bản nháp phòng Tuyển sinh' },
    confidence: 0.75,
  };

  it('equals đúng/sai theo dot-path', () => {
    expect(evaluateAssertions(output, [
      { type: 'equals', path: 'suggestion_type', value: 'org_change' },
    ]).passed).toBe(true);
    expect(evaluateAssertions(output, [
      { type: 'equals', path: 'suggestion_type', value: 'process' },
    ]).passed).toBe(false);
  });

  it('contains + regex + exists', () => {
    const v = evaluateAssertions(output, [
      { type: 'contains', path: 'proposal.summary', value: 'Tuyển sinh' },
      { type: 'regex', path: 'proposal.summary', value: '^\\[MOCK\\]' },
      { type: 'exists', path: 'confidence' },
      { type: 'exists', path: 'không.có' },
    ]);
    expect(v.details.map((d) => d.passed)).toEqual([true, true, true, false]);
    expect(v.passed).toBe(false);
    expect(v.score).toBe(0.75); // 3/4
  });

  it('không có assertion ⇒ fail-closed (score 0)', () => {
    const v = evaluateAssertions(output, []);
    expect(v.passed).toBe(false);
    expect(v.score).toBe(0);
  });

  it('regex hỏng ⇒ fail-closed, không throw', () => {
    const v = evaluateAssertions(output, [{ type: 'regex', path: 'proposal.summary', value: '[' }]);
    expect(v.passed).toBe(false);
    expect(v.details[0].note).toMatch(/không hợp lệ/);
  });

  it('resolvePath chặn prototype chain (chuẩn F14)', () => {
    expect(resolvePath({ a: 1 }, 'constructor')).toBeUndefined();
    expect(resolvePath({ a: 1 }, '__proto__')).toBeUndefined();
    expect(resolvePath({ a: { b: 2 } }, 'a.b')).toBe(2);
  });
});
