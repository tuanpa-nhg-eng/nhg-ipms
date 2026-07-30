import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma.service';
import type { ExportContext } from './export.guard';

/**
 * [Trục C L1] Ghi `export_log` sau khi handler xuất dữ liệu chạy xong.
 *
 * KHÔNG tự quyết định gì: mức phân loại, trần, lý do đều do ExportGuard chốt trước đó và
 * truyền qua `req.ipmsExport`. Interceptor chỉ đếm bản ghi và ghi vết.
 *
 * ⚠️ KHÁC AuditInterceptor một điểm CÓ CHỦ ĐÍCH: audit ghi lỗi thì log ERROR rồi vẫn trả
 * response (mutation đã commit, không rollback được ở tầng interceptor). Ở đây thì NÉM: với
 * đường xuất trả payload trong response, response CHƯA gửi đi lúc này ⇒ ném là chặn thật,
 * người dùng không nhận được dữ liệu mà hệ không ghi được vết. "Xuất được nhưng không ghi
 * vết" là đúng cái trạng thái lát này tồn tại để loại bỏ; thà 500 và không xuất.
 */
@Injectable()
export class ExportLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      mergeMap(async (result: any) => {
        const ex: ExportContext | undefined = req.ipmsExport;
        if (!ex) return result;

        // [J13] danh tính kép — actor THẬT chịu trách nhiệm; `sub` chỉ là danh tính đang dùng.
        const impersonating: boolean = Boolean(req.ipmsClaims?.act);
        const actorUserId: string = impersonating ? req.ipmsClaims.act : req.ipmsClaims.sub;

        let recordCount: number;
        try {
          const n = ex.count(result);
          recordCount = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
        } catch {
          recordCount = 0;   // hàm đếm sai hình dạng response — vẫn ghi vết, đếm 0
        }

        await this.prisma.withTenant(req.ipmsTenantId, (tx) =>
          tx.exportLog.create({
            data: {
              tenantId: req.ipmsTenantId,
              actorUserId,
              onBehalfOfUserId: impersonating ? req.ipmsClaims.sub : null,
              assetCode: ex.asset,
              classification: ex.classification,
              destination: ex.destination,
              destinationKind: ex.destinationKind,
              recordCount,
              route: `${req.method} ${ex.route}`,
              rule: ex.rule,
            },
          }),
        );
        return result;
      }),
    );
  }
}
