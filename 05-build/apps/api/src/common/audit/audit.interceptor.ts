import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma.service';
import { AUDIT_KEY } from '../auth/decorators';

/**
 * AuditInterceptor — TDD §12: mutation có @Audited('entity.action') tự sinh audit_log.
 * `before` do handler gắn vào req.ipmsAuditBefore (nếu là update); `after` = response body.
 * Ghi TRONG tenant context (RLS) — audit_log cũng cô lập theo tenant, append-only.
 * [F5-partial] AWAIT ghi audit trước khi trả response — không còn fire-and-forget
 * (giảm rủi ro mất audit; bước kế: ghi cùng transaction nghiệp vụ trước khi có data thật).
 * Ghi audit lỗi → vẫn trả response nhưng log ERROR (mutation đã commit, không thể rollback ở đây).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_KEY, ctx.getHandler());
    if (!action) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      mergeMap(async (result: any) => {
        const tenantId: string | undefined = req.ipmsTenantId;
        if (!tenantId) return result;
        const entityId: string | undefined = result?.id ?? req.params?.id ?? undefined;
        // [Trục B L4 — J13] Danh tính kép: nếu token đang đóng vai (`act` có mặt), vết audit
        // phải ghi ACTOR THẬT — không phải người bị đóng vai (`sub`) — và giữ lại AI đang bị
        // đóng vai trong payload để không mất dấu vết. Trong thực tế, J11 làm mọi endpoint
        // @Audited (đều là mutation) không thể chạm tới dưới một phiên chỉ-đọc — đây là
        // phòng tuyến thứ hai, không phải đường vận hành chính.
        const actingAs: string | undefined = req.ipmsClaims?.act ? req.ipmsClaims?.sub : undefined;
        const actorUserId: string | null = req.ipmsClaims?.act ?? req.ipmsClaims?.sub ?? null;
        try {
          await this.prisma.withTenant(tenantId, (tx) =>
            tx.auditLog.create({
              data: {
                tenantId,
                actorUserId,
                action,
                entityType: action.split('.')[0],
                entityId: entityId ?? null,
                before: req.ipmsAuditBefore ?? undefined,
                after: actingAs ? ({ ...(result ?? {}), _impersonating: actingAs } as object) : (result ?? undefined),
                ip: req.ip,
              },
            }),
          );
        } catch (e: any) {
          console.error(`[audit] FAILED ${action}:`, e.message);
        }
        return result;
      }),
    );
  }
}
