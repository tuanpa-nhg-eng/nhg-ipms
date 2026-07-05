/**
 * Safe formula parser/evaluator — Hiến pháp guardrail: KHÔNG eval tùy tiện.
 * Whitelist hàm: min, max, round, clamp, if · Toán tử: + - * / , so sánh (cho if) · Biến: actual, target, base.
 * Recursive-descent parser, không dùng eval/Function — không có đường thoát code.
 */

export type Vars = Readonly<Record<string, number>>;
export const ALLOWED_VARS = ['actual', 'target', 'base'] as const;
const FUNCTIONS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  round: (a) => {
    const [x, digits = 0] = a;
    const f = 10 ** digits;
    return Math.round(x * f) / f;
  },
  clamp: (a) => {
    const [x, lo, hi] = a;
    return Math.min(Math.max(x, lo), hi);
  },
  if: (a) => (a[0] !== 0 ? a[1] : a[2]),
};
const FUNC_ARITY: Record<string, [number, number]> = {
  min: [2, 10], max: [2, 10], round: [1, 2], clamp: [3, 3], if: [3, 3],
};

type Tok =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' } | { t: 'rparen' } | { t: 'comma' };

export class FormulaError extends Error {}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new FormulaError(`Số không hợp lệ: ${raw}`);
      toks.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      toks.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '(') { toks.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rparen' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/><'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new FormulaError(`Ký tự không cho phép: '${c}'`);
  }
  return toks;
}

class Parser {
  private pos = 0;
  constructor(private toks: Tok[], private vars: Vars) {}

  parse(): number {
    const v = this.comparison();
    if (this.pos !== this.toks.length) throw new FormulaError('Biểu thức thừa token');
    return v;
  }

  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private next(): Tok {
    const t = this.toks[this.pos++];
    if (!t) throw new FormulaError('Biểu thức kết thúc đột ngột');
    return t;
  }

  private comparison(): number {
    let left = this.additive();
    const t = this.peek();
    if (t?.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(t.v)) {
      this.next();
      const right = this.additive();
      switch (t.v) {
        case '>': return left > right ? 1 : 0;
        case '<': return left < right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
      }
    }
    return left;
  }

  private additive(): number {
    let v = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const r = this.multiplicative();
        v = t.v === '+' ? v + r : v - r;
      } else return v;
    }
  }

  private multiplicative(): number {
    let v = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next();
        const r = this.unary();
        if (t.v === '/') {
          if (r === 0) throw new FormulaError('Chia cho 0');
          v = v / r;
        } else v = v * r;
      } else return v;
    }
  }

  private unary(): number {
    const t = this.peek();
    if (t?.t === 'op' && t.v === '-') {
      this.next();
      return -this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const t = this.next();
    if (t.t === 'num') return t.v;
    if (t.t === 'lparen') {
      const v = this.comparison();
      const close = this.next();
      if (close.t !== 'rparen') throw new FormulaError('Thiếu )');
      return v;
    }
    if (t.t === 'ident') {
      const name = t.v.toLowerCase();
      if (this.peek()?.t === 'lparen') {
        if (!(name in FUNCTIONS)) throw new FormulaError(`Hàm không cho phép: ${name}`);
        this.next(); // (
        const args: number[] = [];
        if (this.peek()?.t !== 'rparen') {
          args.push(this.comparison());
          while (this.peek()?.t === 'comma') {
            this.next();
            args.push(this.comparison());
          }
        }
        const close = this.next();
        if (close.t !== 'rparen') throw new FormulaError('Thiếu ) sau đối số hàm');
        const [lo, hi] = FUNC_ARITY[name];
        if (args.length < lo || args.length > hi) {
          throw new FormulaError(`Hàm ${name} nhận ${lo}–${hi} đối số, nhận được ${args.length}`);
        }
        return FUNCTIONS[name](args);
      }
      if (!(name in this.vars)) {
        throw new FormulaError(`Biến không cho phép: ${name} (whitelist: ${Object.keys(this.vars).join(',')})`);
      }
      return this.vars[name];
    }
    throw new FormulaError('Token không hợp lệ');
  }
}

/** Đánh giá biểu thức với biến whitelist. Ném FormulaError nếu vi phạm. */
export function evaluateFormula(expression: string, vars: Vars): number {
  if (expression.length > 500) throw new FormulaError('Biểu thức quá dài');
  const result = new Parser(tokenize(expression), vars).parse();
  if (!Number.isFinite(result)) throw new FormulaError('Kết quả không hữu hạn');
  return result;
}
