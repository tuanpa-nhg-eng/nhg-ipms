/**
 * Unit — [Learning Loop L3] toán unit economics (pure, tất định):
 * percentile nearest-rank · projection cost/call + sensitivity ×0.5/×1/×2 ·
 * mock token estimate GỒM context.
 */
import { buildProjections, callsPerMonth, percentile } from '../../src/modules/ai/economics/economics.util';
import { estimateTokensIn, MockLlmClient } from '../../src/modules/ai/llm/mock-llm-client';

describe('Learning Loop L3 — percentile (nearest-rank)', () => {
  it('mảng rỗng → null; 1 phần tử → chính nó', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });

  it('nearest-rank chuẩn: P50/P95 của 1..10; không mutate input', () => {
    const xs = [10, 1, 3, 2, 7, 5, 4, 8, 6, 9];
    expect(percentile(xs, 50)).toBe(5); // ceil(0.5*10)=5 → phần tử thứ 5
    expect(percentile(xs, 95)).toBe(10); // ceil(0.95*10)=10
    expect(percentile(xs, 100)).toBe(10);
    expect(xs[0]).toBe(10); // không sort tại chỗ
  });
});

describe('Learning Loop L3 — buildProjections', () => {
  const PRICES = [
    { model: 'claude-opus-4-8', inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
    { model: 'claude-haiku-4-5', inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    { model: 'mock', inputUsdPerMTok: 0, outputUsdPerMTok: 0 },
  ];

  it('cost/call = tokens × giá/1M; sensitivity double = 2×base, half = 0.5×base', () => {
    // 2000 in + 400 out trên Opus 4.8: 2000/1M*5 + 400/1M*25 = 0.01 + 0.01 = 0.02 USD
    const out = buildProjections(2000, 400, 1000, PRICES);
    const opus = out.find((p) => p.model === 'claude-opus-4-8')!;
    expect(opus.estCostPerCallUsd).toBe(0.02);
    expect(opus.monthlyUsd.base).toBe(20); // 0.02 × 1000
    expect(opus.monthlyUsd.double).toBe(40);
    expect(opus.monthlyUsd.half).toBe(10);
  });

  it('mock bị loại (không phải phương án live); kết quả sort theo model — tất định', () => {
    const out = buildProjections(1000, 100, 10, PRICES);
    expect(out.map((p) => p.model)).toEqual(['claude-haiku-4-5', 'claude-opus-4-8']);
  });

  it('callsPerMonth quy đổi cửa sổ 30 ngày; window 0 → 0 (không chia 0)', () => {
    expect(callsPerMonth(300, 30)).toBe(300);
    expect(callsPerMonth(10, 5)).toBe(60);
    expect(callsPerMonth(10, 0)).toBe(0);
  });
});

describe('Learning Loop L3 — mock token estimate gồm context', () => {
  it('estimateTokensIn tăng theo kích thước context (context bỏ qua = projection nói dối)', () => {
    const base = estimateTokensIn('prompt ngắn', undefined);
    const withCtx = estimateTokensIn('prompt ngắn', { payload: 'x'.repeat(4000) });
    expect(withCtx).toBeGreaterThan(base + 900); // ~4000 ký tự ≈ ~1000 token
  });

  it('MockLlmClient.complete trả tokensIn phản ánh context, cost = 0 (RED-LINE)', async () => {
    const mock = new MockLlmClient();
    const small = await mock.complete({ agent: 'inline.taskcell.draft', prompt: 'p', context: { a: 1 } });
    const big = await mock.complete({
      agent: 'inline.taskcell.draft', prompt: 'p', context: { a: 'y'.repeat(8000) },
    });
    expect(big.tokensIn).toBeGreaterThan(small.tokensIn + 1500);
    expect(small.costUsd).toBe(0);
    expect(big.costUsd).toBe(0);
  });
});
