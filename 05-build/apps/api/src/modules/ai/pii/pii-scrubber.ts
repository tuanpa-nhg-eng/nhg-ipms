/**
 * [F59 trả nợ] PII scrubber THUẬN-NGHỊCH — pure functions, KHÔNG DB, KHÔNG mạng.
 *
 * Thuận: scrub(prompt, context, knownNames) thay mọi PII bằng token `[[PII:kind:n]]`
 * TRƯỚC khi rời gateway (LLM — mock hay thật — không bao giờ thấy giá trị gốc).
 * Nghịch: rehydrate*(…, map) thay token trở lại giá trị gốc CHO CALLER nội bộ
 * (map chỉ sống trong bộ nhớ 1 lượt gọi — không persist một kho PII thứ hai).
 *
 * Phát hiện: email · SĐT di động VN (03/05/07/08/09 + 8 số, có/không +84) · CCCD 12 số ·
 * số tiền định dạng VND (nhóm nghìn ≥2 lần + đ/vnđ/vnd) · tên nhân sự (đối chiếu danh sách
 * person.fullName của tenant — service wrapper truyền vào, xem pii-scrub.service.ts).
 */

export type PiiKind = 'email' | 'phone' | 'cccd' | 'salary' | 'name';

interface RawMatch {
  start: number;
  end: number;
  kind: PiiKind;
  value: string;
}

const PII_REGEXES: Array<{ kind: PiiKind; re: RegExp }> = [
  { kind: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { kind: 'phone', re: /(?:\+84|0)(3|5|7|8|9)\d{8}(?!\d)/g },
  { kind: 'cccd', re: /(?<!\d)\d{12}(?!\d)/g },
  // (?![a-zA-Z0-9]) thay cho \b cuối — 'đ' không thuộc \w trong regex JS (ASCII-only),
  // nên \b sau 'đ' theo sau bởi khoảng trắng/kết chuỗi sẽ KHÔNG khớp (2 phía đều non-word).
  { kind: 'salary', re: /\b\d{1,3}(?:[.,]\d{3}){2,}\s?(?:đ|vnđ|vnd)(?![a-zA-Z0-9])/gi },
];

const TOKEN_RE = /\[\[PII:[a-z]+:\d+\]\]/g;

/** Sinh token tất định theo THỨ TỰ XUẤT HIỆN trong 1 lượt scrub (đếm liên tục qua prompt+context). */
class Tokenizer {
  private n = 0;
  readonly map: Record<string, string> = {};
  readonly counts: Partial<Record<PiiKind, number>> = {};

  token(kind: PiiKind, value: string): string {
    this.n += 1;
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    const t = `[[PII:${kind}:${this.n}]]`;
    this.map[t] = value;
    return t;
  }
}

function findMatches(text: string, knownNames: string[]): RawMatch[] {
  const matches: RawMatch[] = [];
  // Tên nhân sự — dài nhất trước (tránh khớp con của tên dài hơn), bỏ tên quá ngắn/mơ hồ.
  const names = [...new Set(knownNames)].filter((n) => n && n.length >= 4).sort((a, b) => b.length - a.length);
  for (const name of names) {
    let idx = text.indexOf(name);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + name.length, kind: 'name', value: name });
      idx = text.indexOf(name, idx + name.length);
    }
  }
  for (const { kind, re } of PII_REGEXES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      matches.push({ start: m.index, end: m.index + m[0].length, kind, value: m[0] });
      if (m[0].length === 0) re.lastIndex += 1; // guard vòng lặp vô hạn nếu regex khớp rỗng
    }
  }
  // Sắp theo vị trí; trùng vùng → giữ khớp bắt đầu SỚM NHẤT và DÀI NHẤT (tên thắng regex nếu lồng nhau)
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept: RawMatch[] = [];
  let cursor = -1;
  for (const m of matches) {
    if (m.start >= cursor) {
      kept.push(m);
      cursor = m.end;
    }
  }
  return kept;
}

function scrubTextWith(text: string, knownNames: string[], tok: Tokenizer): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  const matches = findMatches(text, knownNames);
  if (!matches.length) return text;
  let out = '';
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.start) + tok.token(m.kind, m.value);
    last = m.end;
  }
  return out + text.slice(last);
}

function walkScrub(value: unknown, knownNames: string[], tok: Tokenizer): unknown {
  if (typeof value === 'string') return scrubTextWith(value, knownNames, tok);
  if (Array.isArray(value)) return value.map((v) => walkScrub(v, knownNames, tok));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walkScrub(v, knownNames, tok);
    return out;
  }
  return value;
}

export interface ScrubResult {
  prompt: string;
  context: unknown;
  map: Record<string, string>;
  counts: Partial<Record<PiiKind, number>>;
}

/** Scrub CẢ prompt lẫn context với 1 bộ đếm token dùng chung (thuận). */
export function scrubRequestPure(prompt: string, context: unknown, knownNames: string[] = []): ScrubResult {
  const tok = new Tokenizer();
  const scrubbedPrompt = scrubTextWith(prompt, knownNames, tok);
  const scrubbedContext = context === undefined ? context : walkScrub(context, knownNames, tok);
  return { prompt: scrubbedPrompt, context: scrubbedContext, map: tok.map, counts: tok.counts };
}

/** Nghịch — thay token trở lại giá trị gốc trong 1 chuỗi. Token lạ (không có trong map) giữ nguyên. */
export function rehydrateText(text: string, map: Record<string, string>): string {
  if (typeof text !== 'string' || text.length === 0 || Object.keys(map).length === 0) return text;
  return text.replace(TOKEN_RE, (t) => (Object.prototype.hasOwnProperty.call(map, t) ? map[t] : t));
}

/** Nghịch — đệ quy trên JSON (chuẩn F14: không đi qua prototype chain, chỉ own-keys). */
export function rehydrateValue(value: unknown, map: Record<string, string>): unknown {
  if (Object.keys(map).length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return rehydrateText(v, map);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = walk(vv);
      return out;
    }
    return v;
  };
  return walk(value);
}

/**
 * Nghịch cho STREAM — giữ lại đuôi `[[` chưa đủ `]]` để không cắt token làm đôi giữa 2 chunk
 * (Anthropic stream chia delta tuỳ ý; mock chia theo từ nhưng token không chứa khoảng trắng
 * nên hiếm khi vỡ, vẫn xử lý đúng cho cả 2 trường hợp).
 */
export class StreamRehydrator {
  private buf = '';
  constructor(private map: Record<string, string>) {}

  /**
   * Trả phần AN TOÀN đã rehydrate để yield ngay; phần còn nghi ngờ giữ lại chờ chunk sau.
   * 2 tình huống phải giữ: (a) đã thấy "[[" nhưng CHƯA thấy "]]" đóng — token dở dang ·
   * (b) buffer kết thúc bằng ĐÚNG 1 dấu "[" lẻ — có thể là nửa đầu của "[[" ở chunk kế
   * (đặc biệt quan trọng khi stream chia theo TỪNG KÝ TỰ — 1 dấu "[" một mình không đủ
   * để lastIndexOf('[[') nhận ra, nếu không giữ lại sẽ bắn "[" đi mất trước khi ký tự
   * "[" thứ hai tới, làm token vỡ vĩnh viễn).
   */
  push(chunk: string): string {
    if (!chunk) return '';
    this.buf += chunk;
    let emitEnd = this.buf.length;
    const openIdx = this.buf.lastIndexOf('[[');
    if (openIdx !== -1) {
      const closeIdx = this.buf.indexOf(']]', openIdx);
      if (closeIdx === -1) emitEnd = openIdx;
    } else if (this.buf.endsWith('[')) {
      emitEnd = this.buf.length - 1;
    }
    const safe = this.buf.slice(0, emitEnd);
    this.buf = this.buf.slice(emitEnd);
    return rehydrateText(safe, this.map);
  }

  /** Xả nốt phần còn giữ lại — gọi khi stream kết thúc (trước chunk 'done'). */
  flush(): string {
    const rest = this.buf;
    this.buf = '';
    return rehydrateText(rest, this.map);
  }
}
