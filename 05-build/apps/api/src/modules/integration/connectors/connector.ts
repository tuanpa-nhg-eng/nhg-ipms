/**
 * Connector SDK (Spec Config Studio §8) — lớp trừu tượng đẩy/kéo dữ liệu hệ ngoài.
 * Phase 3 lát 4b: CHỈ mock connector (RED-LINE #2 — chưa có token Notion/Graph;
 * connector thật cắm vào cùng interface khi chủ dự án cấp token sandbox).
 */

export interface ExternalItem {
  externalId: string;
  data: Record<string, unknown>;
  etag?: string;
}

export interface PushResult {
  externalId: string;
  etag: string;
  op: 'created' | 'updated';
}

/** Target đích trong hệ ngoài (workspace/board/plan...) — từ integration_binding.external_target. */
export type ConnectorTarget = Record<string, unknown> | null | undefined;

export interface Connector {
  readonly provider: string;
  /** Đẩy items ra hệ ngoài — idempotent theo externalId. */
  push(tenantId: string, target: ConnectorTarget, items: ExternalItem[]): Promise<PushResult[]>;
  /** Kéo items từ hệ ngoài (cursor pagination). */
  pull(tenantId: string, target: ConnectorTarget, cursor?: string): Promise<{ items: ExternalItem[]; nextCursor?: string }>;
}
