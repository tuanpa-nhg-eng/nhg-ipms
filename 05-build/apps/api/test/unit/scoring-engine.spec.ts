/**
 * TEST BẮT BUỘC cho Scoring Engine (TDD §18): bậc thang, direction reverse,
 * chia đều group weight, tổng weight=100, recompute đúng formula version.
 */
import { evaluateFormula, FormulaError } from '../../src/modules/kpi/scoring/formula';
import {
  applyFormula, tierLookup, resolveWeights, computeScore, mapIpc,
  ScoringError, ScoringItem,
} from '../../src/modules/kpi/scoring/engine';

const baseItem = (over: Partial<ScoringItem>): ScoringItem => ({
  id: 'k1',
  direction: 'forward',
  tiers: [],
  actual: 80,
  target: 100,
  weight: 100,
  ...over,
});

describe('Formula parser (safe, whitelist)', () => {
  const vars = { actual: 80, target: 100, base: 0 };

  it('tính đúng công thức chuẩn min(actual/target,1)*100', () => {
    expect(evaluateFormula('min(actual/target,1)*100', vars)).toBe(80);
    expect(evaluateFormula('min(actual/target,1)*100', { ...vars, actual: 120 })).toBe(100);
  });

  it('hỗ trợ clamp/round/if/max + so sánh', () => {
    expect(evaluateFormula('clamp(actual/target*100,0,100)', vars)).toBe(80);
    expect(evaluateFormula('round(actual/target*100+0.4)', vars)).toBe(80);
    expect(evaluateFormula('if(actual>=target,100,50)', vars)).toBe(50);
    expect(evaluateFormula('max(actual,target)', vars)).toBe(100);
  });

  it('CHẶN hàm ngoài whitelist', () => {
    expect(() => evaluateFormula('eval(1)', vars)).toThrow(FormulaError);
    expect(() => evaluateFormula('pow(2,3)', vars)).toThrow(FormulaError);
  });

  it('CHẶN biến lạ + ký tự lạ (không có đường injection)', () => {
    expect(() => evaluateFormula('salary*2', vars)).toThrow(FormulaError);
    expect(() => evaluateFormula('actual;drop', vars)).toThrow(FormulaError);
    expect(() => evaluateFormula('actual`', vars)).toThrow(FormulaError);
  });

  it('chia 0 → lỗi mềm, không NaN/Infinity', () => {
    expect(() => evaluateFormula('actual/base', vars)).toThrow(FormulaError);
  });

  it('[F14] CHẶN prototype-chain identifier (constructor/__proto__/toString/valueOf)', () => {
    for (const evil of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(() => evaluateFormula(`${evil}+1`, vars)).toThrow(FormulaError);
      expect(() => evaluateFormula(`if(${evil}>0,50,70)`, vars)).toThrow(FormulaError);
    }
  });

  it('[F15] if SHORT-CIRCUIT: guard chia 0 hoạt động — if(target==0,0,actual/target)', () => {
    expect(evaluateFormula('if(target==0,0,actual/target)', { actual: 80, target: 0, base: 0 })).toBe(0);
    expect(evaluateFormula('if(target==0,0,actual/target*100)', vars)).toBe(80);
    // nhánh không chọn chứa biến cấm cũng KHÔNG được eval... nhưng vẫn phải parse hợp lệ
    expect(evaluateFormula('if(1>0, 42, actual/base)', vars)).toBe(42);
  });

  it('round digits ngoài phạm vi → lỗi mềm', () => {
    expect(() => evaluateFormula('round(1,400)', vars)).toThrow(FormulaError);
  });

  it('biểu thức lồng sâu trong trần 500 ký tự không crash', () => {
    const deep = '('.repeat(200) + 'actual' + ')'.repeat(200);
    expect(evaluateFormula(deep, vars)).toBe(80);
  });
});

describe('applyFormula — direction', () => {
  it('forward: actual/target', () => {
    expect(applyFormula(baseItem({ actual: 90, target: 100 }))).toBe(90);
    expect(applyFormula(baseItem({ actual: 150, target: 100 }))).toBe(100); // clamp
  });

  it('reverse: target/actual (thấp = tốt) — TDD §7.3', () => {
    // vd: tỷ lệ lỗi thực tế 2% so với ngưỡng 4% → đạt tốt
    expect(applyFormula(baseItem({ direction: 'reverse', actual: 8, target: 4 }))).toBe(50);
    expect(applyFormula(baseItem({ direction: 'reverse', actual: 4, target: 4 }))).toBe(100);
    expect(applyFormula(baseItem({ direction: 'reverse', actual: 2, target: 4 }))).toBe(100); // clamp
    expect(applyFormula(baseItem({ direction: 'reverse', actual: 0, target: 4 }))).toBe(100);
  });

  it('formula tuỳ chỉnh override mặc định', () => {
    const it1 = baseItem({ formula: { expression: 'if(actual>=target,100,0)', version: 1 }, actual: 99, target: 100 });
    expect(applyFormula(it1)).toBe(0);
  });
});

describe('tierLookup — bậc thang điểm (biên bản 24/06: 100→25, 90→22, 80→19, 70→16, dưới→0)', () => {
  const tiers = [
    { minPct: 100, score: 25 },
    { minPct: 90, score: 22 },
    { minPct: 80, score: 19 },
    { minPct: 70, score: 16 },
  ];

  it.each([
    [100, 25], [105, 25], [99.9, 22], [90, 22], [89, 19], [80, 19], [79, 16], [70, 16], [69.9, 0], [0, 0],
  ])('achieved %s%% → %s điểm', (pct, expected) => {
    expect(tierLookup(tiers, pct as number)).toBe(expected);
  });

  it('không có bậc thang → raw = achieved_pct', () => {
    expect(tierLookup([], 87.5)).toBe(87.5);
  });
});

describe('resolveWeights — TDD §7.2', () => {
  it('item weight dùng trực tiếp; tổng=100 pass', () => {
    const w = resolveWeights([
      baseItem({ id: 'a', weight: 60 }),
      baseItem({ id: 'b', weight: 40 }),
    ]);
    expect(w.get('a')).toBe(60);
    expect(w.get('b')).toBe(40);
  });

  it('group_weight chia đều trong nhóm', () => {
    const w = resolveWeights([
      baseItem({ id: 'a', weight: null, groupLabel: 'KQ', groupWeight: 30 }),
      baseItem({ id: 'b', weight: null, groupLabel: 'KQ', groupWeight: 30 }),
      baseItem({ id: 'c', weight: null, groupLabel: 'KQ', groupWeight: 30 }),
      baseItem({ id: 'd', weight: 70 }),
    ]);
    expect(w.get('a')).toBe(10);
    expect(w.get('b')).toBe(10);
    expect(w.get('c')).toBe(10);
    expect(w.get('d')).toBe(70);
  });

  it('tổng ≠ 100 → CHẶN (ScoringError)', () => {
    expect(() =>
      resolveWeights([baseItem({ id: 'a', weight: 60 }), baseItem({ id: 'b', weight: 35 })]),
    ).toThrow(ScoringError);
  });

  it('tolerance ±0.01 chấp nhận (33.33×3 + 0.01)', () => {
    const w = resolveWeights([
      baseItem({ id: 'a', weight: 33.33 }),
      baseItem({ id: 'b', weight: 33.33 }),
      baseItem({ id: 'c', weight: 33.34 }),
    ]);
    expect([...w.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(100, 2);
  });

  it('item thiếu cả weight lẫn group_weight → lỗi', () => {
    expect(() => resolveWeights([baseItem({ id: 'a', weight: null })])).toThrow(ScoringError);
  });
});

describe('computeScore — pipeline đầy đủ + IPC', () => {
  it('tính end-to-end: 2 KPI có bậc thang + trọng số', () => {
    const tiers = [
      { minPct: 100, score: 100 },
      { minPct: 90, score: 88 },
      { minPct: 80, score: 76 },
      { minPct: 70, score: 64 },
    ];
    const result = computeScore([
      baseItem({ id: 'sales', actual: 95, target: 100, tiers, weight: 60 }), // 95% → 88
      baseItem({ id: 'quality', direction: 'reverse', actual: 5, target: 4, tiers, weight: 40 }), // 80% → 76
    ]);
    // 88*0.6 + 76*0.4 = 52.8 + 30.4 = 83.2
    expect(result.finalScore).toBe(83.2);
    expect(result.ipcGrade).toBe('A');
    expect(result.items.find((i) => i.id === 'sales')!.rawScore).toBe(88);
    expect(result.items.find((i) => i.id === 'quality')!.achievedPct).toBe(80);
  });

  it('recompute dùng đúng formula version snapshot (v1 vs v2 khác kết quả)', () => {
    const v1 = { expression: 'min(actual/target,1)*100', version: 1 };
    const v2 = { expression: 'clamp(actual/target,0,1.2)*100', version: 2 }; // v2 cho vượt 120%
    const mk = (f: typeof v1) => computeScore([baseItem({ id: 'k', actual: 110, target: 100, formula: f, weight: 100 })]);
    expect(mk(v1).items[0].achievedPct).toBe(100);
    expect(mk(v2).items[0].achievedPct).toBe(110);
    expect(mk(v1).items[0].formulaVersion).toBe(1);
    expect(mk(v2).items[0].formulaVersion).toBe(2);
  });

  it('mapIpc theo bảng cấu hình', () => {
    expect(mapIpc(95)).toBe('A+');
    expect(mapIpc(85)).toBe('A');
    expect(mapIpc(72)).toBe('B');
    expect(mapIpc(65)).toBe('C');
    expect(mapIpc(30)).toBe('D');
    expect(mapIpc(88, [{ minScore: 85, grade: 'Xuất sắc' }, { minScore: 0, grade: 'Đạt' }])).toBe('Xuất sắc');
  });

  it('scorecard rỗng → lỗi', () => {
    expect(() => computeScore([])).toThrow(ScoringError);
  });

  it('[F16] bậc thang biên bản 24/06 (25/22/19/16, 4 nhóm × 25%) — KHÔNG double-weighting', () => {
    const tiersBB = [
      { minPct: 100, score: 25 },
      { minPct: 90, score: 22 },
      { minPct: 80, score: 19 },
      { minPct: 70, score: 16 },
    ];
    const mk = (id: string, actual: number) =>
      baseItem({ id, actual, target: 100, tiers: tiersBB, weight: 25 });
    // 4 KPI đều đạt 100% → tier 25 → normalize 100 → final phải là 100 (không phải 25)
    const perfect = computeScore([mk('a', 100), mk('b', 100), mk('c', 100), mk('d', 100)]);
    expect(perfect.finalScore).toBe(100);
    expect(perfect.ipcGrade).toBe('A+');
    // 95/95/85/75 → tier 22,22,19,16 → normalize 88,88,76,64 → (88+88+76+64)/4 = 79
    const mixed = computeScore([mk('a', 95), mk('b', 95), mk('c', 85), mk('d', 75)]);
    expect(mixed.finalScore).toBe(79);
    expect(mixed.ipcGrade).toBe('B');
  });

  it('[F16] thang tier 25-điểm và 100-điểm cho CÙNG kết quả', () => {
    const t25 = [{ minPct: 100, score: 25 }, { minPct: 90, score: 22 }, { minPct: 80, score: 19 }, { minPct: 70, score: 16 }];
    const t100 = [{ minPct: 100, score: 100 }, { minPct: 90, score: 88 }, { minPct: 80, score: 76 }, { minPct: 70, score: 64 }];
    const a = computeScore([baseItem({ id: 'x', actual: 95, target: 100, tiers: t25, weight: 100 })]);
    const b = computeScore([baseItem({ id: 'x', actual: 95, target: 100, tiers: t100, weight: 100 })]);
    expect(a.finalScore).toBe(b.finalScore);
  });

  it('[F21] dưới mọi bậc thang → finalScore = 1 (sàn thang 1–100, quyết định nghiệp vụ)', () => {
    const tiers = [{ minPct: 70, score: 16 }];
    const r = computeScore([baseItem({ id: 'x', actual: 10, target: 100, tiers, weight: 100 })]);
    expect(r.finalScore).toBe(1);
  });
});
