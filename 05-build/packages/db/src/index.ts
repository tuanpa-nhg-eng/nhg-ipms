/**
 * @ipms/db — Prisma client + tenant-scoped transaction helper.
 *
 * Nguyên tắc: app runtime kết nối bằng role `ipms_app` (RLS enforce).
 * Mọi truy vấn nghiệp vụ PHẢI chạy trong `withTenant(tenantId, fn)` —
 * helper set `app.tenant_id` (transaction-local) rồi mới chạy query.
 * Không set → RLS fail-closed, query trả 0 dòng.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

export * from '@prisma/client';
export { uuidv7 };
// Lát 4h/4i — Từ điển KPI chuẩn + Task Catalog 815 tác vụ (legacy — THAY bởi V2, D1 15/07/2026)
export * from './kpi-dictionary.data';
export * from './task-catalog.data';
export * from './task-catalog';
// Lát G1/G2 (go-live) — Task Catalog V2 (694 tác vụ Archive/Task_Dashboard_v2)
// + Từ điển KPI mở rộng FIN (ĐỀ XUẤT — B1 hiệu chỉnh) + map tác vụ→KPI explainable
export * from './task-catalog-v2.data';
export * from './task-catalog-v2';
export * from './kpi-dictionary-ext.data';

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(
    url ? { datasources: { db: { url } } } : undefined,
  );
}

export type TenantTx = Prisma.TransactionClient;

/**
 * Chạy `fn` trong transaction đã gắn tenant context (RLS).
 * set_config(..., true) = transaction-local → không rò sang connection khác trong pool.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error(`Invalid tenant id: ${tenantId}`);
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    // maxWait nới cho môi trường dev chậm; timeout chặn transaction treo giữ connection
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/**
 * [Trục C L2 — K1] Đường ĐỌC của tầng quản trị nền tảng: bật GUC `app.platform_read` và
 * **CỐ Ý KHÔNG set `app.tenant_id`**.
 *
 * Bỏ trống tenant context không phải là thiếu sót — nó LÀ cơ chế giới hạn: policy của mọi
 * bảng nghiệp vụ so `tenant_id` với `app.tenant_id`, mà `current_setting(..., true)` trả
 * NULL khi chưa set ⇒ so sánh ra NULL ⇒ 0 dòng. Chỉ `platform_snapshot` và `tenant` có
 * policy nhìn GUC mới. Nghĩa là bán kính nổ của hàm này KIỂM CHỨNG ĐƯỢC: xem
 * `platform-admin.spec` — đọc `review`/`person`/`evidence` bên trong đây phải trả về rỗng.
 *
 * Đây là lý do KHÔNG dùng OWNER connection cho việc này: owner bỏ qua RLS nên một lỗi trong
 * mã là một lần đọc chéo toàn bộ nội dung nghiệp vụ; ở đây, cùng lỗi đó trả về mảng rỗng.
 */
export async function withPlatform<T>(
  prisma: PrismaClient,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_read', 'on', true)`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/**
 * [Trục C L5] Đường XOÁ của job lưu trữ — bật GUC `app.retention_run` KÈM tenant context.
 *
 * Khác `withPlatformWrite` ở một điểm quan trọng: hàm này VẪN set `app.tenant_id`. Xoá dữ liệu
 * luôn luôn nằm trong phạm vi một đơn vị, nên RLS phải còn nguyên hiệu lực — GUC ở đây chỉ mở
 * đúng một cánh cửa hẹp (trigger `ai_interaction_delete_gate`), không thay thế cách ly đơn vị.
 *
 * Chỉ `RetentionService.apply` gọi hàm này. Mọi đường xoá khác trong ứng dụng vẫn bị trigger
 * chặn dù `ipms_app` đã có quyền DELETE — quyền là điều kiện cần, GUC là điều kiện đủ.
 */
export async function withRetention<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error(`Invalid tenant id: ${tenantId}`);
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.retention_run', 'on', true)`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/**
 * [Trục C L2] Đường GHI của tầng nền tảng — TÁCH HẲN khỏi `withPlatform`.
 *
 * Chỉ dùng cho hai việc mà bản chất là không-thuộc-đơn-vị-nào: tạo đơn vị mới (chưa có
 * tenant để mà bind) và bật/tắt cờ tính năng toàn cục (`tenant_id NULL`). Tách khỏi đường
 * đọc để một request đọc thông thường của B3 KHÔNG mang theo khả năng ghi — nếu gộp một
 * GUC, mọi màn hình danh sách đều chạy với quyền ghi hàng global.
 *
 * KHÔNG bật `app.platform_read` ở đây: hai việc trên không cần đọc chéo.
 */
export async function withPlatformWrite<T>(
  prisma: PrismaClient,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_write', 'on', true)`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
