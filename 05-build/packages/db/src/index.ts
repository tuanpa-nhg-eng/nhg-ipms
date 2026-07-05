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
