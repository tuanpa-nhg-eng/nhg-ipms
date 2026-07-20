/**
 * [F59 trả nợ] Unit thuần cho pii-scrubber — không DB, không mạng.
 */
import { rehydrateText, rehydrateValue, scrubRequestPure, StreamRehydrator } from '../../src/modules/ai/pii/pii-scrubber';

describe('scrubRequestPure — phát hiện + token hoá', () => {
  it('email bị scrub, phần còn lại giữ nguyên', () => {
    const r = scrubRequestPure('Liên hệ an.pham@nhg.edu.vn để duyệt', undefined);
    expect(r.prompt).not.toContain('an.pham@nhg.edu.vn');
    expect(r.prompt).toMatch(/\[\[PII:email:1\]\]/);
    expect(r.counts.email).toBe(1);
    expect(r.map['[[PII:email:1]]']).toBe('an.pham@nhg.edu.vn');
  });

  it('SĐT di động VN (có/không +84) bị scrub', () => {
    const r1 = scrubRequestPure('Gọi 0912345678 nhé', undefined);
    expect(r1.prompt).toContain('[[PII:phone:1]]');
    const r2 = scrubRequestPure('Gọi +84912345678 nhé', undefined);
    expect(r2.prompt).toContain('[[PII:phone:1]]');
  });

  it('CCCD 12 số bị scrub, không đụng số ngắn hơn/dài hơn', () => {
    const r = scrubRequestPure('CCCD 123456789012 của nhân viên', undefined);
    expect(r.prompt).toContain('[[PII:cccd:1]]');
    const short = scrubRequestPure('Mã 12345 không phải CCCD', undefined);
    expect(short.prompt).toBe('Mã 12345 không phải CCCD');
  });

  it('số tiền định dạng VND bị scrub, số thường không bị', () => {
    const r = scrubRequestPure('Lương 15.000.000đ mỗi tháng', undefined);
    expect(r.prompt).toContain('[[PII:salary:1]]');
    const r2 = scrubRequestPure('Có 15 người trong phòng', undefined);
    expect(r2.prompt).toBe('Có 15 người trong phòng');
  });

  it('tên nhân sự khớp danh sách knownNames — tên dài thắng tên lồng bên trong', () => {
    const r = scrubRequestPure('Trao đổi với Nguyễn Văn A về KPI', undefined, ['Nguyễn Văn A', 'Văn A']);
    expect(r.prompt).toContain('[[PII:name:1]]');
    expect(r.prompt).not.toContain('Nguyễn Văn A');
    expect(r.counts.name).toBe(1); // không đếm đúp lồng nhau
  });

  it('tên KHÔNG trong knownNames thì không bị scrub (không đoán mò)', () => {
    const r = scrubRequestPure('Trao đổi với Nguyễn Văn A về KPI', undefined, []);
    expect(r.prompt).toBe('Trao đổi với Nguyễn Văn A về KPI');
    expect(r.counts.name).toBeUndefined();
  });

  it('không có PII ⇒ map/counts rỗng, text nguyên vẹn', () => {
    const r = scrubRequestPure('Tạo phòng Tuyển sinh 5 người', { org: 'H.01' });
    expect(r.prompt).toBe('Tạo phòng Tuyển sinh 5 người');
    expect(Object.keys(r.map)).toHaveLength(0);
    expect(r.counts).toEqual({});
  });

  it('context (JSON lồng) cũng bị scrub — đếm token LIÊN TỤC với prompt', () => {
    const r = scrubRequestPure('Liên hệ an.pham@nhg.edu.vn', {
      list: [{ email: 'khac@nhg.edu.vn' }, { note: 'không PII' }],
    });
    expect(r.prompt).toContain('[[PII:email:1]]');
    expect((r.context as any).list[0].email).toBe('[[PII:email:2]]');
    expect((r.context as any).list[1].note).toBe('không PII');
    expect(r.counts.email).toBe(2);
  });

  it('context=undefined giữ undefined (không ép thành null)', () => {
    const r = scrubRequestPure('không PII', undefined);
    expect(r.context).toBeUndefined();
  });
});

describe('rehydrateText / rehydrateValue — nghịch', () => {
  it('thay token trở lại giá trị gốc', () => {
    const r = scrubRequestPure('Email an.pham@nhg.edu.vn', undefined);
    expect(rehydrateText(r.prompt, r.map)).toBe('Email an.pham@nhg.edu.vn');
  });

  it('token lạ (không trong map) giữ nguyên — không throw', () => {
    expect(rehydrateText('còn [[PII:email:9]] lạ', {})).toBe('còn [[PII:email:9]] lạ');
  });

  it('rehydrateValue đệ quy JSON, chỉ own-keys (chuẩn F14)', () => {
    const r = scrubRequestPure('x', { a: { b: 'an.pham@nhg.edu.vn' }, c: ['khac@nhg.edu.vn'] });
    const back = rehydrateValue(r.context, r.map) as any;
    expect(back.a.b).toBe('an.pham@nhg.edu.vn');
    expect(back.c[0]).toBe('khac@nhg.edu.vn');
  });

  it('map rỗng ⇒ trả nguyên value, không đụng object gốc kiểu lạ', () => {
    const v = { n: 1, ok: true };
    expect(rehydrateValue(v, {})).toBe(v);
  });
});

describe('StreamRehydrator — không vỡ token giữa 2 chunk', () => {
  it('token nguyên trong 1 chunk → rehydrate ngay', () => {
    const r = scrubRequestPure('Email an.pham@nhg.edu.vn nhé', undefined);
    const sr = new StreamRehydrator(r.map);
    const out = sr.push(r.prompt) + sr.flush();
    expect(out).toBe('Email an.pham@nhg.edu.vn nhé');
  });

  it('token bị CẮT ĐÔI giữa 2 chunk vẫn ráp đúng (giữ lại đuôi [[ chưa đủ ]])', () => {
    const r = scrubRequestPure('Email an.pham@nhg.edu.vn nhé', undefined);
    const token = Object.keys(r.map)[0]; // '[[PII:email:1]]'
    const cut = Math.floor(token.length / 2);
    const chunk1 = r.prompt.slice(0, r.prompt.indexOf(token) + cut);
    const chunk2 = r.prompt.slice(r.prompt.indexOf(token) + cut);
    const sr = new StreamRehydrator(r.map);
    const out = sr.push(chunk1) + sr.push(chunk2) + sr.flush();
    expect(out).toBe('Email an.pham@nhg.edu.vn nhé');
  });

  it('nhiều chunk rời rạc ráp lại đúng thứ tự', () => {
    const r = scrubRequestPure('A an.pham@nhg.edu.vn B khac@nhg.edu.vn C', undefined);
    const sr = new StreamRehydrator(r.map);
    let out = '';
    for (const ch of r.prompt.split('')) out += sr.push(ch);
    out += sr.flush();
    expect(out).toBe('A an.pham@nhg.edu.vn B khac@nhg.edu.vn C');
  });
});
