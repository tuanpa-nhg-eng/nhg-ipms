/**
 * KPI Scoring Engine — TDD §7 (logic lõi, pure functions, test kỹ).
 * Pipeline: achieved_pct = apply_formula(direction) → raw_score = tier lookup (bậc thang)
 * → weighting (item weight | group_weight chia đều, Σ=100±0.01) → final_score → ipc_grade.
 */
import { evaluateFormula, FormulaError } from './formula';

export interface FormulaSnapshot {
  expression: string; // vd 'min(actual/target,1)*100'
  version: number;    // recompute lịch sử phải dùng đúng version tại thời điểm review
}

export interface ScoreTier {
  minPct: number; // ngưỡng % đạt (vd 100, 90, 80, 70)
  score: number;  // điểm tương ứng (vd 25, 22, 19, 16)
}

export interface ScoringItem {
  id: string;
  direction: 'forward' | 'reverse';
  formula?: FormulaSnapshot;      // nếu không có → mặc định theo direction
  tiers: ScoreTier[];             // bậc thang; rỗng → raw_score = achieved_pct
  weight?: number | null;         // tỷ trọng item (%)
  groupLabel?: string | null;
  groupWeight?: number | null;    // tỷ trọng nhóm (%) — chia đều trong nhóm nếu item không có weight
  actual: number;
  target: number;
  base?: number;
}

export interface ItemScore {
  id: string;
  achievedPct: number;
  rawScore: number;
  effectiveWeight: number;
  weightedScore: number;
  formulaVersion?: number;
}

export interface ScoringResult {
  items: ItemScore[];
  finalScore: number; // 1–100
  ipcGrade: string;
}

export interface IpcTier { minScore: number; grade: string }

export const DEFAULT_IPC_MAP: IpcTier[] = [
  { minScore: 90, grade: 'A+' },
  { minScore: 80, grade: 'A' },
  { minScore: 70, grade: 'B' },
  { minScore: 60, grade: 'C' },
  { minScore: 0, grade: 'D' },
];

export class ScoringError extends Error {}

/** achieved_pct theo direction — TDD §7.3. */
export function applyFormula(item: ScoringItem): number {
  const vars = { actual: item.actual, target: item.target, base: item.base ?? 0 };
  if (item.formula) {
    try {
      return evaluateFormula(item.formula.expression, vars);
    } catch (e) {
      if (e instanceof FormulaError) throw new ScoringError(`Formula lỗi (item ${item.id}): ${e.message}`);
      throw e;
    }
  }
  if (item.target === 0) throw new ScoringError(`target=0 không thể tính achieved_pct (item ${item.id})`);
  if (item.direction === 'reverse') {
    // thấp = tốt: target/actual (actual=0 coi như vượt trội → clamp 100)
    if (item.actual === 0) return 100;
    return clamp((item.target / item.actual) * 100, 0, 100);
  }
  return clamp((item.actual / item.target) * 100, 0, 100);
}

/** Bậc thang điểm — chọn tier có minPct cao nhất mà achieved_pct >= minPct; dưới mọi bậc → 0. */
export function tierLookup(tiers: ScoreTier[], achievedPct: number): number {
  if (tiers.length === 0) return achievedPct;
  const sorted = [...tiers].sort((a, b) => b.minPct - a.minPct);
  for (const t of sorted) {
    if (achievedPct >= t.minPct) return t.score;
  }
  return 0;
}

/**
 * Tỷ trọng hiệu dụng — TDD §7.2:
 * - item có weight → dùng trực tiếp;
 * - chỉ có group_weight → các item cùng group_label chia đều group_weight;
 * - Σ effective_weight = 100 ± 0.01, sai → ScoringError (block).
 */
export function resolveWeights(items: ScoringItem[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, ScoringItem[]>();

  for (const it of items) {
    if (it.weight != null) {
      out.set(it.id, it.weight);
    } else if (it.groupLabel != null && it.groupWeight != null) {
      if (!groups.has(it.groupLabel)) groups.set(it.groupLabel, []);
      groups.get(it.groupLabel)!.push(it);
    } else {
      throw new ScoringError(`Item ${it.id} không có weight lẫn group_weight`);
    }
  }

  for (const [label, members] of groups) {
    const gw = members[0].groupWeight!;
    const mismatch = members.find((m) => m.groupWeight !== gw);
    if (mismatch) throw new ScoringError(`group_weight không nhất quán trong nhóm '${label}'`);
    const each = gw / members.length;
    for (const m of members) out.set(m.id, each);
  }

  const sum = [...out.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new ScoringError(`Tổng tỷ trọng = ${sum.toFixed(4)} ≠ 100 (±0.01) — chặn theo TDD §7.2`);
  }
  return out;
}

/** Pipeline đầy đủ một review — TDD §7.1. */
export function computeScore(items: ScoringItem[], ipcMap: IpcTier[] = DEFAULT_IPC_MAP): ScoringResult {
  if (items.length === 0) throw new ScoringError('Scorecard rỗng');
  const weights = resolveWeights(items);

  const itemScores: ItemScore[] = items.map((it) => {
    const achievedPct = applyFormula(it);
    const rawScore = tierLookup(it.tiers, achievedPct);
    const effectiveWeight = weights.get(it.id)!;
    return {
      id: it.id,
      achievedPct: round2(achievedPct),
      rawScore: round2(rawScore),
      effectiveWeight: round2(effectiveWeight),
      weightedScore: round2(rawScore * (effectiveWeight / 100)),
      formulaVersion: it.formula?.version,
    };
  });

  // Chuẩn hoá: nếu tiers là thang điểm (vd max 25/nhóm), weightedScore đã theo trọng số;
  // finalScore = Σ weighted, clamp 1–100 (thang 1–100 theo spec).
  const total = itemScores.reduce((a, b) => a + b.weightedScore, 0);
  const finalScore = round2(clamp(total, 1, 100));

  return { items: itemScores, finalScore, ipcGrade: mapIpc(finalScore, ipcMap) };
}

/** Map điểm → hạng IPC (bảng cấu hình theo tenant, versioned + audit ở tầng service). */
export function mapIpc(finalScore: number, ipcMap: IpcTier[] = DEFAULT_IPC_MAP): string {
  const sorted = [...ipcMap].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) if (finalScore >= t.minScore) return t.grade;
  return sorted[sorted.length - 1]?.grade ?? 'D';
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
