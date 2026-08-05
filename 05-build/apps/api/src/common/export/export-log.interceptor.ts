import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma.service';
import type { ExportContext } from './export.guard';

/**
 * [F193 — Reviewer 05/08] Số bản ghi ĐÃ RỜI HỆ trước khi handler hỏng, nếu handler biết.
 *
 * Đường xuất kiểu "kéo" (trả payload trong response) hỏng thì không có gì rời hệ — không ghi
 * vết là đúng. Đường xuất kiểu "ĐẨY" thì ngược lại: `morning-todos` gọi hệ todo ngoài trong
 * một vòng lặp, đẩy xong ba mục rồi ném ở mục thứ tư ⇒ ba bản ghi ĐÃ ra ngoài thật. Service
 * nào biết con số đó thì gắn vào lỗi qua trường này.
 */
export interface PartialExportError { partialExportCount?: number }

function partialCountOf(err: unknown): number | null {
  const n = (err as PartialExportError | null)?.partialExportCount;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

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
  private readonly logger = new Logger(ExportLogInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      mergeMap(async (result: any) => {
        const ex: ExportContext | undefined = req.ipmsExport;
        if (!ex) return result;

        let recordCount: number;
        try {
          const n = ex.count(result);
          recordCount = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
        } catch {
          recordCount = 0;   // hàm đếm sai hình dạng response — vẫn ghi vết, đếm 0
        }

        await this.write(req, ex, recordCount, ex.rule);
        return result;
      }),
      /**
       * [F193 — Reviewer 05/08] Handler HỎNG GIỮA CHỪNG vẫn phải để lại vết.
       *
       * Lỗ: interceptor chỉ móc vào nhánh THÀNH CÔNG. Với đường xuất kiểu "kéo" điều đó đúng
       * (lỗi ⇒ không có payload nào rời hệ). Với đường xuất kiểu **ĐẨY** thì sai hoàn toàn:
       * `morning-todos` đẩy ba mục sang hệ todo ngoài rồi ném ở mục thứ tư — ba bản ghi đã ra
       * ngoài thật, và sổ vết xuất trắng trơn. Đúng thứ trạng thái mà cả lát L1 tồn tại để loại
       * bỏ, chỉ khác là nó nấp sau một nhánh lỗi thay vì một route thiếu khai báo.
       *
       * Ghi gì: một dòng `export_log` với `rule` NÓI RÕ là lượt xuất không hoàn tất và số bản
       * ghi đã rời hệ không xác định (trừ khi service tự khai `partialExportCount`). Không bịa
       * số: một dòng ghi "0 bản ghi" cho lượt đã đẩy ba mục còn tệ hơn không ghi, vì nó biến
       * một khoảng trống nhìn thấy được thành một con số sai trông đáng tin.
       *
       * Vì sao KHÔNG ghi vào `audit_log` thay thế: `export_log` là sổ những gì ĐÃ RỜI hệ, và ở
       * đây dữ liệu đã rời thật. Đây chính là chiều ngược với bài học L4 (`export.blocked` phải
       * nằm ngoài sổ xuất vì khi đó KHÔNG có gì rời hệ).
       *
       * Lỗi gốc LUÔN được ném lại — kể cả khi ghi vết cũng hỏng. Nuốt lỗi gốc ở đây sẽ biến một
       * lượt xuất thất bại thành một response 200.
       */
      catchError((err) => {
        const ex: ExportContext | undefined = req.ipmsExport;
        if (!ex) return throwError(() => err);

        const partial = partialCountOf(err);
        const note = partial === null
          ? 'KHÔNG HOÀN TẤT: handler ném lỗi giữa chừng — số bản ghi đã rời hệ KHÔNG XÁC ĐỊNH'
          : `KHÔNG HOÀN TẤT: handler ném lỗi sau khi đã đẩy ${partial} bản ghi ra ngoài`;

        return new Observable((sub) => {
          this.write(req, ex, partial ?? 0, `${ex.rule} | ${note}`)
            .catch((e) => this.logger.error(
              // Mất vết của một lượt xuất đã ra ngoài một phần là sự kiện phải hét lên, không
              // phải nuốt im: đây là đúng loại khoảng trống mà B0 sẽ không bao giờ tự phát hiện.
              `[F193] KHÔNG ghi được vết cho lượt xuất hỏng giữa chừng (${ex.asset} → ${ex.destination}): ${e}`,
            ))
            .finally(() => sub.error(err));
        });
      }),
    );
  }

  private async write(req: any, ex: ExportContext, recordCount: number, rule: string) {
    // [J13] danh tính kép — actor THẬT chịu trách nhiệm; `sub` chỉ là danh tính đang dùng.
    const impersonating: boolean = Boolean(req.ipmsClaims?.act);
    const actorUserId: string = impersonating ? req.ipmsClaims.act : req.ipmsClaims.sub;

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
          rule,
        },
      }),
    );
  }
}
