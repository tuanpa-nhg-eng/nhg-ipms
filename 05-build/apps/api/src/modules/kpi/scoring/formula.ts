/**
 * Safe formula parser/evaluator — Hiến pháp guardrail: KHÔNG eval tùy tiện.
 * Whitelist hàm: min, max, round, clamp, if · Toán tử: + - * / , so sánh (cho if) · Biến: actual, target, base.
 * 2 pha: parse → AST → eval lazy. KHÔNG eval/Function — không có đường thoát code.
 * [F15] `if(cond, a, b)` SHORT-CIRCUIT: chỉ eval nhánh được chọn → guard chia 0 hoạt động:
 *   if(target==0, 0, actual/target)  ✓
 * [F14] Tra biến bằng Object.hasOwn — chặn prototype chain (constructor/__proto__/toString...).
 */

export type Vars = Readonly<Record<string, number>>;
export const ALLOWED_VARS = ['actual', 'target', 'base'] as const;

const FUNC_ARITY: Record<string, [number, number]> = {
  min: [2, 10], max: [2, 10], round: [1, 2], clamp: [3, 3], if: [3, 3],
};

export class FormulaError extends Error {}

// ===== Tokenizer =====
type Tok =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' } | { t: 'rparen' } | { t: 'comma' };

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

// ===== AST =====
type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'neg'; e: Node }
  | { k: 'call'; fn: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  parse(): Node {
    const n = this.comparison();
    if (this.pos !== this.toks.length) throw new FormulaError('Biểu thức thừa token');
    return n;
  }

  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private next(): Tok {
    const t = this.toks[this.pos++];
    if (!t) throw new FormulaError('Biểu thức kết thúc đột ngột');
    return t;
  }

  private comparison(): Node {
    const left = this.additive();
    const t = this.peek();
    if (t?.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(t.v)) {
      this.next();
      return { k: 'bin', op: t.v, l: left, r: this.additive() };
    }
    return left;
  }

  private additive(): Node {
    let n = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        n = { k: 'bin', op: t.v, l: n, r: this.multiplicative() };
      } else return n;
    }
  }

  private multiplicative(): Node {
    let n = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next();
        n = { k: 'bin', op: t.v, l: n, r: this.unary() };
      } else return n;
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t?.t === 'op' && t.v === '-') {
      this.next();
      return { k: 'neg', e: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'lparen') {
      const n = this.comparison();
      const close = this.next();
      if (close.t !== 'rparen') throw new FormulaError('Thiếu )');
      return n;
    }
    if (t.t === 'ident') {
      const name = t.v.toLowerCase();
      if (this.peek()?.t === 'lparen') {
        if (!(name in FUNC_ARITY)) throw new FormulaError(`Hàm không cho phép: ${name}`);
        this.next(); // (
        const args: Node[] = [];
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
        return { k: 'call', fn: name, args };
      }
      return { k: 'var', name };
    }
    throw new FormulaError('Token không hợp lệ');
  }
}

// ===== Evaluator (lazy if) =====
function evalNode(n: Node, vars: Vars): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var': {
      // [F14] Object.hasOwn — không duyệt prototype chain
      if (!Object.hasOwn(vars, n.name)) {
        throw new FormulaError(`Biến không cho phép: ${n.name} (whitelist: ${Object.keys(vars).join(',')})`);
      }
      return vars[n.name];
    }
    case 'neg':
      return -evalNode(n.e, vars);
    case 'bin': {
      const l = evalNode(n.l, vars);
      const r = evalNode(n.r, vars);
      switch (n.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new FormulaError('Chia cho 0');
          return l / r;
        case '>': return l > r ? 1 : 0;
        case '<': return l < r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        default: throw new FormulaError(`Toán tử lạ: ${n.op}`);
      }
    }
    case 'call': {
      // [F15] if lazy — chỉ eval nhánh được chọn
      if (n.fn === 'if') {
        const cond = evalNode(n.args[0], vars);
        return cond !== 0 ? evalNode(n.args[1], vars) : evalNode(n.args[2], vars);
      }
      const args = n.args.map((a) => evalNode(a, vars));
      switch (n.fn) {
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'round': {
          const [x, digits = 0] = args;
          if (Math.abs(digits) > 10) throw new FormulaError('round: digits ngoài phạm vi ±10');
          const f = 10 ** digits;
          return Math.round(x * f) / f;
        }
        case 'clamp': {
          const [x, lo, hi] = args;
          return Math.min(Math.max(x, lo), hi);
        }
        default: throw new FormulaError(`Hàm không cho phép: ${n.fn}`);
      }
    }
  }
}

/** Parse biểu thức thành AST (validate cú pháp không cần biến). */
export function parseFormula(expression: string): Node {
  if (expression.length > 500) throw new FormulaError('Biểu thức quá dài');
  return new Parser(tokenize(expression)).parse();
}

/** Đánh giá biểu thức với biến whitelist. Ném FormulaError nếu vi phạm. */
export function evaluateFormula(expression: string, vars: Vars): number {
  const result = evalNode(parseFormula(expression), vars);
  if (!Number.isFinite(result)) throw new FormulaError('Kết quả không hữu hạn');
  return result;
}
