import { Body, Controller, Get, ParseIntPipe, Patch } from '@nestjs/common';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { TenantConfigService } from './tenant-config.service';

@Controller('admin/tenant-config')
export class TenantConfigController {
  constructor(private svc: TenantConfigService) {}

  @Get()
  @RequirePermission('tenant.config:read')
  get(@CurrentUser() user: RequestUser) {
    return this.svc.get(user);
  }

  // [F185 — Reviewer đối kháng] KHÔNG dùng DTO class cho `patch` — ValidationPipe toàn cục
  // (transform:true) chạy class-transformer's plainToClass trên MỌI @Body() có metatype là
  // class, và nó ĐỆ QUY vào object lồng nhau để đoán kiểu qua `value.constructor`. Với key
  // 'constructor' do CHÍNH client gửi, cái đoán đó đọc trúng giá trị client control (không
  // còn là hàm Object nữa) → ném TypeError chưa bắt → 500, xảy ra TRƯỚC khi code tới whitelist
  // ở service (@Transform trên field không chặn được vì đệ quy chạy trước khi custom
  // transform áp dụng — đã tự kiểm bằng repro trực tiếp). `@Body('patch')` với kiểu built-in
  // (Record/Object) không có metatype là class → NestJS bỏ qua transform/validate, patch tới
  // service là plain object thô, an toàn. Whitelist thật sự vẫn ở service (Map, không object
  // literal — J185 phần 1).
  // [F189 — Reviewer đối kháng, MINOR] `version` (khoá optimistic) qua `ParseIntPipe` áp trực
  // tiếp lên tham số trích ra — KHÔNG đi qua class-transformer's plainToClass nên không dính
  // lại lỗ đệ quy F185, vẫn được validate là số nguyên thật (không như `patch` phải tự kiểm
  // tay trong service vì bản chất object tự do).
  @Patch()
  @RequirePermission('tenant.config:update')
  @Audited('admin.tenant_config_update')
  update(
    @CurrentUser() user: RequestUser,
    @Body('patch') patch: Record<string, unknown>,
    @Body('version', ParseIntPipe) version: number,
  ) {
    return this.svc.update(user, patch, version);
  }
}
