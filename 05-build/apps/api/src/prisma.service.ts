import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, createPrismaClient, withTenant, TenantTx } from '@ipms/db';

/**
 * Kết nối runtime dùng role `ipms_app` (RLS enforce) — DATABASE_URL.
 * Mọi truy vấn nghiệp vụ đi qua withTenant(tenantId, fn).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient(process.env.DATABASE_URL);

  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.client, tenantId, fn);
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
