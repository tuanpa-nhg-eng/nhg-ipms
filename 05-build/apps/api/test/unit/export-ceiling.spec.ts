/**
 * Unit [Trục C L1] TRẦN XUẤT DỮ LIỆU + heuristic bề mặt xuất.
 *
 * Đóng đinh ở đây thay vì chỉ ở test tích hợp: bảng quyết định (mức × loại đích) là thứ mà
 * L3 (ngoại lệ có hạn) và L5 (lưu trữ) sẽ dùng lại. Nếu nó sai thì mọi đường xuất sai theo,
 * và một sai lệch ở đây không hiện ra dưới dạng test đỏ ở bất kỳ đường xuất cụ thể nào —
 * chỉ hiện ra khi dữ liệu đã rời hệ.
 */
import {
  DATA_CLASSIFICATIONS, EXPORT_DEST_KINDS, exportDecision, PERMISSIONS,
} from '@ipms/shared';
import { looksLikeEgress } from '../../src/common/export/export-surface';

describe('[Trục C L1] exportDecision — trần xuất theo mức phân loại × loại đích', () => {
  it('quét TOÀN BỘ ma trận, không ô nào undefined (12 ô = 4 mức × 3 đích)', () => {
    let cells = 0;
    for (const c of DATA_CLASSIFICATIONS) {
      for (const d of EXPORT_DEST_KINDS) {
        const v = exportDecision(c, d);
        expect(typeof v.allowed).toBe('boolean');
        expect(v.rule).toBeTruthy();
        cells += 1;
      }
    }
    expect(cells).toBe(12);   // chống "assert chạy 0 lần" — bài học trục A
  });

  /** K3 — hàng quan trọng nhất của bảng. */
  it('[K3] `restricted` KHÔNG xuất được đi bất cứ đâu, kể cả hệ nội bộ', () => {
    for (const d of EXPORT_DEST_KINDS) {
      const v = exportDecision('restricted', d);
      expect(v.allowed).toBe(false);
      expect(v.rule).toContain('K3');
    }
  });

  it('`confidential` ra dịch vụ NGOÀI bị chặn (Strategic Context §9.3)', () => {
    const v = exportDecision('confidential', 'external_service');
    expect(v.allowed).toBe(false);
  });

  it('`confidential` vào hệ nội bộ / tệp: cho, nhưng đòi quyền `export:confidential`', () => {
    for (const d of ['internal_system', 'file_download'] as const) {
      const v = exportDecision('confidential', d);
      expect(v.allowed).toBe(true);
      expect(v.requires).toBe('export:confidential');
    }
  });

  it('`public`/`internal` đi được cả ba đích, không đòi quyền bổ sung (đối chứng: không chặn oan)', () => {
    for (const c of ['public', 'internal'] as const) {
      for (const d of EXPORT_DEST_KINDS) {
        const v = exportDecision(c, d);
        expect(v.allowed).toBe(true);
        expect(v.requires).toBeNull();
      }
    }
  });

  it('quyền bổ sung mà bảng đòi phải TỒN TẠI trong catalog (bắt lỗi gõ sai)', () => {
    const known = new Set<string>(PERMISSIONS as readonly string[]);
    for (const c of DATA_CLASSIFICATIONS) {
      for (const d of EXPORT_DEST_KINDS) {
        const req = exportDecision(c, d).requires;
        if (req) expect(known.has(req)).toBe(true);
      }
    }
  });
});

describe('[Trục C L1 — K2] looksLikeEgress — lớp fail-closed chạy lúc runtime', () => {
  it('bắt các dạng đường xuất phổ biến', () => {
    const egress = [
      '/api/v1/export/payroll',
      '/api/v1/reviews/exports',
      '/api/v1/export-log',              // 'export' trong segment ghép — vẫn phải khai/miễn trừ
      '/api/v1/reports/csv-export-v2',
      '/api/v1/evidence/:id/download',
      '/api/v1/reports/quarterly.csv',
      '/api/v1/task-dictionary/csv',
      '/api/v1/files/:key',
      '/api/v1/integrations/outbox/dispatch',
      '/api/v1/something/sync',
    ];
    for (const p of egress) expect(looksLikeEgress(p)).toBe(true);
    expect(egress.length).toBeGreaterThan(5);
  });

  /**
   * Nửa còn lại của bất biến, quan trọng ngang nửa trên: chặn oan một đường VÀO hay một màn
   * đọc thường thì lát này bị người ta tắt đi, và lúc đó không còn kiểm soát xuất nào cả.
   */
  it('KHÔNG bắt đường dữ liệu VÀO và các route đọc thường', () => {
    const notEgress = [
      '/api/v1/integrations/import/csv',
      '/api/v1/evidence/upload',
      '/api/v1/goals',
      '/api/v1/admin/users',
      '/api/v1/data-catalog/:code',
      '/api/v1/reviews/:id',
    ];
    for (const p of notEgress) expect(looksLikeEgress(p)).toBe(false);
    expect(notEgress.length).toBeGreaterThan(4);
  });

  it('dấu hiệu VÀO thắng dấu hiệu RA khi cùng xuất hiện', () => {
    expect(looksLikeEgress('/api/v1/integrations/import/csv')).toBe(false);
    expect(looksLikeEgress('/api/v1/x/import/export')).toBe(false);
  });
});
