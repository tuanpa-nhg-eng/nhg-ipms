/**
 * [Last-mile Lát 2] Unit thuần cho egress-policy engine — không DB.
 */
import { resolveEgress } from '../../src/modules/ai/egress/egress-policy';

describe('resolveEgress — bất biến cứng pii/confidential', () => {
  it('mock LUÔN cho phép bất kể dataClass', () => {
    for (const dc of ['public', 'internal', 'confidential', 'pii'] as const) {
      expect(resolveEgress(dc, 'mock').allowed).toBe(true);
    }
  });

  it('pii/confidential → anthropic LUÔN chặn, kể cả có policy tenant "allowed=true" (đầu độc)', () => {
    const poisoned = [{ dataClass: 'pii', destination: 'anthropic', allowed: true }];
    expect(resolveEgress('pii', 'anthropic', poisoned).allowed).toBe(false);
    expect(resolveEgress('confidential', 'anthropic', poisoned as any).allowed).toBe(false);
  });

  it('pii/confidential → self_host cũng chặn (self-host CHƯA triển khai)', () => {
    expect(resolveEgress('pii', 'self_host').allowed).toBe(false);
    expect(resolveEgress('confidential', 'self_host').allowed).toBe(false);
  });

  it('lý do chặn nêu rõ dataClass + destination (explainable)', () => {
    const r = resolveEgress('pii', 'anthropic');
    expect(r.reason).toContain('pii');
    expect(r.reason).toContain('self-host');
  });
});

describe('resolveEgress — public/internal mặc định cho phép, tenant thu hẹp được', () => {
  it('không có policy tenant ⇒ mặc định cho phép', () => {
    expect(resolveEgress('internal', 'anthropic', []).allowed).toBe(true);
    expect(resolveEgress('public', 'anthropic', []).allowed).toBe(true);
  });

  it('tenant policy allowed=false ⇒ CHẶN THÊM (thu hẹp)', () => {
    const rows = [{ dataClass: 'internal', destination: 'anthropic', allowed: false }];
    const r = resolveEgress('internal', 'anthropic', rows);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('CHẶN tường minh');
  });

  it('tenant policy allowed=true ⇒ vẫn cho phép (không đổi hành vi mặc định)', () => {
    const rows = [{ dataClass: 'internal', destination: 'anthropic', allowed: true }];
    expect(resolveEgress('internal', 'anthropic', rows).allowed).toBe(true);
  });

  it('policy KHÔNG khớp dataClass/destination hiện tại ⇒ bỏ qua, vẫn dùng mặc định', () => {
    const rows = [{ dataClass: 'public', destination: 'anthropic', allowed: false }];
    expect(resolveEgress('internal', 'anthropic', rows).allowed).toBe(true);
  });
});
