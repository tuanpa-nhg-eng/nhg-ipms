/**
 * Eval harness (#10) — evaluator assertion TẤT ĐỊNH, pure function (không DB/mạng).
 * LLM-as-judge chỉ bật khi có API key; hiện tại toàn bộ là assertion cứng.
 */

export interface EvalAssertion {
  type: 'equals' | 'contains' | 'regex' | 'exists';
  /** dot-path vào output JSON, ví dụ 'json.proposal.summary'; bỏ trống = toàn bộ output. */
  path?: string;
  value?: unknown;
}

export interface AssertionDetail {
  assertion: EvalAssertion;
  passed: boolean;
  actual?: unknown;
  note?: string;
}

export interface EvalVerdict {
  passed: boolean; // tất cả assertion pass
  score: number; // tỉ lệ assertion pass, 3 chữ số thập phân
  details: AssertionDetail[];
}

/** Dot-path lookup an toàn (không prototype chain — chuẩn F14). */
export function resolvePath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur as object, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** [F57] Trần input cho contains/regex — chặn ReDoS trên chuỗi lớn (output eval nên nhỏ). */
const MAX_HAYSTACK = 10_000;

function toHaystack(actual: unknown): string {
  const s = typeof actual === 'string' ? actual : JSON.stringify(actual ?? '');
  return s.length > MAX_HAYSTACK ? s.slice(0, MAX_HAYSTACK) : s;
}

export function evaluateAssertions(output: unknown, assertions: EvalAssertion[]): EvalVerdict {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return { passed: false, score: 0, details: [{ assertion: { type: 'exists' }, passed: false, note: 'Case không có assertion — fail-closed' }] };
  }
  const details: AssertionDetail[] = assertions.map((a) => {
    const actual = resolvePath(output, a.path);
    switch (a.type) {
      case 'exists':
        return { assertion: a, passed: actual !== undefined && actual !== null, actual };
      case 'equals':
        return { assertion: a, passed: deepEqual(actual, a.value), actual };
      case 'contains': {
        const hay = toHaystack(actual);
        return { assertion: a, passed: hay.includes(String(a.value ?? '')), actual: hay.slice(0, 200) };
      }
      case 'regex': {
        const hay = toHaystack(actual);
        let ok = false;
        let note: string | undefined;
        try {
          ok = new RegExp(String(a.value ?? '')).test(hay);
        } catch {
          note = 'Regex không hợp lệ — fail-closed';
        }
        return { assertion: a, passed: ok, actual: hay.slice(0, 200), note };
      }
      default:
        return { assertion: a, passed: false, note: `Loại assertion không hỗ trợ — fail-closed` };
    }
  });
  const passCount = details.filter((d) => d.passed).length;
  return {
    passed: passCount === details.length,
    score: Number((passCount / details.length).toFixed(3)),
    details,
  };
}
