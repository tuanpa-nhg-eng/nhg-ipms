import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from './decorators';

/**
 * TenantGuard — TDD §8.1: header X-Tenant-Id BẮT BUỘC và phải khớp claim `tid`
 * (chống nhầm tenant từ client). tenantId sau đó là nguồn duy nhất cho RLS context.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    const headerTenant = req.headers['x-tenant-id'];
    if (!headerTenant) throw new ForbiddenException('X-Tenant-Id header required');
    if (headerTenant !== req.ipmsClaims.tid) {
      throw new ForbiddenException('Tenant mismatch');
    }
    req.ipmsTenantId = req.ipmsClaims.tid;
    return true;
  }
}
