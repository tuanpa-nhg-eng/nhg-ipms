import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { TenantConfigService } from './tenant-config.service';

class PatchTenantConfigDto {
  @IsObject() patch!: Record<string, unknown>;
}

@Controller('admin/tenant-config')
export class TenantConfigController {
  constructor(private svc: TenantConfigService) {}

  @Get()
  @RequirePermission('tenant.config:read')
  get(@CurrentUser() user: RequestUser) {
    return this.svc.get(user);
  }

  @Patch()
  @RequirePermission('tenant.config:update')
  @Audited('admin.tenant_config_update')
  update(@CurrentUser() user: RequestUser, @Body() dto: PatchTenantConfigDto) {
    return this.svc.update(user, dto.patch);
  }
}
