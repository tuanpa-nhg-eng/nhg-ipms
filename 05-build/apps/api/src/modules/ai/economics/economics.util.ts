/**
 * [Learning Loop L3] Toán unit economics — PURE, tất định (unit-test được).
 * Mọi con số là ƯỚC LƯỢNG minh bạch: token = heuristic mock (chars/4), giá = niêm yết.
 */

/** Percentile nearest-rank (tất định, không nội suy): p ∈ (0,100]. Mảng rỗng → null. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export interface ModelPriceRow {
  model: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export interface CostProjection {
  model: string;
  /** USD ước lượng cho 1 lượt gọi trung bình của agent này. */
  estCostPerCallUsd: number;
  /** Sensitivity PRD §16: chi phí/tháng tại volume ×0.5 / ×1 / ×2. */
  monthlyUsd: { half: number; base: number; double: number };
}

const round6 = (x: number) => Math.round(x * 1_000_000) / 1_000_000;
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Projection chi phí per model: cost/call = avgTokens × giá/1M; tháng = cost/call ×
 * callsPerMonth × {0.5, 1, 2}. KHÔNG phải hóa đơn — là ước lượng để quyết bật live.
 */
export function buildProjections(
  avgTokensIn: number, avgTokensOut: number, callsPerMonth: number, prices: ModelPriceRow[],
): CostProjection[] {
  return prices
    .filter((p) => p.model !== 'mock') // mock = 0đ, không phải phương án live
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((p) => {
      const perCall = (avgTokensIn / 1_000_000) * p.inputUsdPerMTok
        + (avgTokensOut / 1_000_000) * p.outputUsdPerMTok;
      const base = perCall * callsPerMonth;
      return {
        model: p.model,
        estCostPerCallUsd: round6(perCall),
        monthlyUsd: { half: round2(base * 0.5), base: round2(base), double: round2(base * 2) },
      };
    });
}

/** Quy đổi số lượt trong cửa sổ quan sát → lượt/tháng (30 ngày), tất định. */
export function callsPerMonth(callsInWindow: number, windowDays: number): number {
  if (windowDays <= 0) return 0;
  return Math.round((callsInWindow / windowDays) * 30);
}

/**
 * [F167] Gộp giá theo model — row TENANT (override) THẮNG row GLOBAL. Tách ra pure
 * (dùng lại ở cả economics.service.ts báo cáo VÀ ai-gateway.service.ts Lát 3 — tính
 * costUsd THẬT khi bật live, cùng 1 luật ưu tiên, không lệch nhau).
 */
export function dedupeModelPrices<T extends { model: string; tenantId: string | null }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const p of rows) {
    const cur = m.get(p.model);
    if (!cur || (cur.tenantId === null && p.tenantId !== null)) m.set(p.model, p);
  }
  return [...m.values()].sort((a, b) => a.model.localeCompare(b.model));
}

/** [Last-mile Lát 3] USD cho 1 lượt gọi THẬT theo giá niêm yết. Thiếu giá ⇒ 0 (tường minh, không throw — usage thật quan trọng hơn, thiếu giá không được chặn ghi nhận). */
export function costForUsage(tokensIn: number, tokensOut: number, price: ModelPriceRow | null): number {
  if (!price) return 0;
  const cost = (tokensIn / 1_000_000) * price.inputUsdPerMTok + (tokensOut / 1_000_000) * price.outputUsdPerMTok;
  return round6(cost);
}
