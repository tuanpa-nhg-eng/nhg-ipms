import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { Tenant } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';

@Controller('tenants')
export class TenantController {
  constructor(private prisma: PrismaService) {}

  /** Tenant của chính mình — RLS đảm bảo không thấy tenant khác. */
  @Get('me')
  @RequirePermission('tenant:read')
  async me(@CurrentUser() user: RequestUser): Promise<Tenant> {
    const tenant = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.tenant.findFirst({ where: { deletedAt: null } }),
    );
    if (!tenant) throw new NotFoundException('tenant not found');
    return tenant;
  }
}
