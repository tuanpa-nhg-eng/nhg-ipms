import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { DataCatalogService } from './datacatalog.service';

@Controller('data-catalog')
export class DataCatalogController {
  constructor(private svc: DataCatalogService) {}

  /** Danh mục hiệu lực (bản chuẩn tập đoàn, đè bởi bản riêng của đơn vị nếu có). */
  @Get()
  @RequirePermission('datacatalog:read')
  list(@CurrentUser() user: RequestUser) {
    return this.svc.list(user);
  }

  /** Tra mức phân loại hiệu lực của một mã — hàm mà L1/L5 và lớp AI sẽ gọi. */
  @Get(':code')
  @RequirePermission('datacatalog:read')
  resolve(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.svc.resolve(user.tenantId, code);
  }

  /**
   * Đơn vị đặt/siết bản riêng. Chỉ `data_steward` giữ `datacatalog:write`.
   *
   * KHÔNG dùng DTO class cho body — cùng lý do F185 ở tenant-config: ValidationPipe toàn cục
   * chạy plainToClass đệ quy trên @Body() có metatype là class, và key 'constructor' do client
   * gửi làm cái đoán kiểu đó đọc trúng giá trị client control → 500 TRƯỚC khi tới whitelist.
   * Trích từng trường bằng @Body('x') với kiểu built-in thì NestJS bỏ qua transform.
   */
  @Put(':code')
  @RequirePermission('datacatalog:write')
  @Audited('datacatalog.override')
  upsert(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body('classification') classification: string,
    @Body('ownerRole') ownerRole?: string,
    @Body('legalNote') legalNote?: string,
    @Body('version') version?: number,
  ) {
    return this.svc.upsertTenantOverride(user, code, {
      classification, ownerRole, legalNote,
      version: version === undefined ? undefined : Number(version),
    });
  }
}
