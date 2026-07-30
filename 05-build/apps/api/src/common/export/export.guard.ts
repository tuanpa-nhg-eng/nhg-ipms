import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { exportDecision, DataClassification } from '@ipms/shared';
import { DataCatalogService } from '../../modules/datacatalog/datacatalog.service';
import { PUBLIC_KEY, RequestUser } from '../auth/decorators';
import { EXPORT_EXEMPT_KEY, EXPORTED_KEY, ExportedOptions } from './export.decorators';
import { looksLikeEgress, routePathOf } from './export-surface';

/** Ngữ cảnh guard chuyển sang ExportLogInterceptor — interceptor KHÔNG tự quyết định gì. */
export interface ExportContext extends ExportedOptions {
  classification: DataClassification;
  rule: string;
  route: string;
}

/**
 * [Trục C L1] ExportGuard — CỔNG DUY NHẤT của mọi dòng dữ liệu ra (BR-M13-02).
 *
 * Đứng SAU PermissionGuard trong pipeline (cần `req.ipmsUser.permissions` để xét quyền bổ
 * sung `export:confidential`) và sau PolicyGuard. Nghĩa là RBAC/ABAC cho qua rồi vẫn có thể
 * bị chặn ở đây — đúng chủ đích: "được đọc" và "được mang ra ngoài" là hai quyền khác nhau.
 *
 * Ba lý do chặn, cả ba đều 403 kèm thông báo tra được:
 *   ① route trông như đường xuất mà không khai `@Exported` (K2 — fail-closed);
 *   ② mã dữ liệu chưa đăng ký trong sổ (L0) ⇒ không ai biết nó thuộc mức nào;
 *   ③ trần `exportDecision(mức × loại đích)` không cho, hoặc thiếu quyền bổ sung.
 */
@Injectable()
export class ExportGuard implements CanActivate {
  constructor(private reflector: Reflector, private catalog: DataCatalogService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    const route = routePathOf(req);
    const meta = this.reflector.getAllAndOverride<ExportedOptions>(EXPORTED_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);

    if (!meta) {
      const exempt = this.reflector.getAllAndOverride<string>(EXPORT_EXEMPT_KEY, [
        ctx.getHandler(), ctx.getClass(),
      ]);
      if (exempt) return true;
      if (looksLikeEgress(route)) {
        // K2: KHÔNG có chế độ cảnh báo-rồi-cho-qua. Người thêm route này phải khai
        // @Exported({asset,destination,...}) hoặc @ExportExempt('lý do') — cả hai đều để lại
        // vết trong mã và trong snapshot test, không có đường thứ ba.
        throw new ForbiddenException(
          `Route '${route}' trông như đường xuất dữ liệu nhưng chưa khai @Exported — `
          + 'fail-closed (K2). Khai @Exported({asset,destination,destinationKind,count}) '
          + 'hoặc @ExportExempt("lý do") nếu đây không phải đường dữ liệu ra.',
        );
      }
      return true;
    }

    const user: RequestUser | undefined = req.ipmsUser;
    if (!user) {
      // PermissionGuard chưa chạy hoặc route quên @RequirePermission — không đoán, chặn.
      throw new ForbiddenException(`Route xuất '${route}' không có ngữ cảnh người dùng (fail-closed)`);
    }

    let classification: DataClassification;
    try {
      ({ classification } = await this.catalog.resolve(user.tenantId, meta.asset));
    } catch {
      // Mã chưa đăng ký / mức lạ: `resolve` ném 404/422 cho người TRA SỔ, nhưng ở đây ngữ
      // nghĩa là "không được xuất" — trả 403 để thông báo nói đúng việc đang bị từ chối.
      throw new ForbiddenException(
        `Route xuất '${route}' khai mã dữ liệu '${meta.asset}' không tra được trong sổ đăng ký `
        + '— đăng ký mã (kèm chủ dữ liệu + mức phân loại) trước khi mở đường xuất (fail-closed).',
      );
    }

    const verdict = exportDecision(classification, meta.destinationKind);
    if (!verdict.allowed) {
      throw new ForbiddenException(
        `Chặn xuất '${meta.asset}' (${classification}) → ${meta.destination} `
        + `[${meta.destinationKind}]: ${verdict.rule}`,
      );
    }
    if (verdict.requires && !user.permissions.has(verdict.requires)) {
      throw new ForbiddenException(
        `Xuất '${meta.asset}' (${classification}) cần quyền '${verdict.requires}' — ${verdict.rule}`,
      );
    }

    const exportCtx: ExportContext = { ...meta, classification, rule: verdict.rule, route };
    req.ipmsExport = exportCtx;
    return true;
  }
}
