import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma.service';
import { AUDIT_KEY } from '../auth/decorators';

/**
 * AuditInterceptor — TDD §12: mutation có @Audited('entity.action') tự sinh audit_log.
 * `before` do handler gắn vào req.ipmsAuditBefore (nếu là update); `after` = response body.
 * Ghi TRONG tenant context (RLS) — audit_log cũng cô lập theo tenant, append-only.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_KEY, ctx.getHandler());
    if (!action) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((result: any) => {
        const tenantId: string | undefined = req.ipmsTenantId;
        if (!tenantId) return;
        const entityId: string | undefined =
          result?.id ?? req.params?.id ?? undefined;
        // fire-and-forget có log lỗi — không chặn response
        this.prisma
          .withTenant(tenantId, (tx) =>
            tx.auditLog.create({
              data: {
                tenantId,
                actorUserId: req.ipmsClaims?.sub ?? null,
                action,
                entityType: action.split('.')[0],
                entityId: entityId ?? null,
                before: req.ipmsAuditBefore ?? undefined,
                after: result ?? undefined,
                ip: req.ip,
              },
            }),
          )
          .catch((e) => console.error(`[audit] FAILED ${action}:`, e.message));
      }),
    );
  }
}
