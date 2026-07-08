import { ServiceUnavailableException } from '@nestjs/common';
import { Connector, ConnectorTarget, ExternalItem, PushResult } from './connector';

/** Hash FNV-1a — etag tất định theo nội dung (không phụ thuộc thời gian). */
function etagOf(data: unknown): string {
  const s = JSON.stringify(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `W/"${(h >>> 0).toString(16)}"`;
}

/**
 * Mock connector — "hệ ngoài" in-memory, CÔ LẬP THEO TENANT trong key store.
 * Tất định (etag theo nội dung), hỗ trợ tiêm lỗi qua target.failMode để test
 * retry/dead-letter của outbox dispatcher. KHÔNG mạng, KHÔNG token (RED-LINE).
 */
export class MockConnector implements Connector {
  private store = new Map<string, Map<string, ExternalItem>>();

  constructor(readonly provider: string) {}

  private space(tenantId: string, target: ConnectorTarget): Map<string, ExternalItem> {
    const ws = (target as any)?.workspace ?? 'default';
    const key = `${this.provider}:${tenantId}:${ws}`;
    if (!this.store.has(key)) this.store.set(key, new Map());
    return this.store.get(key)!;
  }

  async push(tenantId: string, target: ConnectorTarget, items: ExternalItem[]): Promise<PushResult[]> {
    if ((target as any)?.failMode) {
      throw new ServiceUnavailableException(`[MOCK ${this.provider}] hệ ngoài không phản hồi (failMode)`);
    }
    const space = this.space(tenantId, target);
    return items.map((item) => {
      const op: PushResult['op'] = space.has(item.externalId) ? 'updated' : 'created';
      const etag = etagOf(item.data);
      space.set(item.externalId, { ...item, etag });
      return { externalId: item.externalId, etag, op };
    });
  }

  async pull(tenantId: string, target: ConnectorTarget, cursor?: string): Promise<{ items: ExternalItem[]; nextCursor?: string }> {
    if ((target as any)?.failMode) {
      throw new ServiceUnavailableException(`[MOCK ${this.provider}] hệ ngoài không phản hồi (failMode)`);
    }
    const all = [...this.space(tenantId, target).values()].sort((a, b) => a.externalId.localeCompare(b.externalId));
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + 100);
    return { items: page, nextCursor: start + 100 < all.length ? String(start + 100) : undefined };
  }

  /** Chỉ cho test: đọc trực tiếp "hệ ngoài". */
  peek(tenantId: string, target: ConnectorTarget, externalId: string): ExternalItem | undefined {
    return this.space(tenantId, target).get(externalId);
  }
}
