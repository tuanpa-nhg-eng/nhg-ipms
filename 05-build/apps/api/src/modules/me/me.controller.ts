import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsArray, IsBoolean, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { MeService } from './me.service';

class PatchSettingsDto {
  @IsObject() patch!: Record<string, unknown>;
}

class NotificationItemDto {
  @IsString() eventKey!: string;
  @IsString() channel!: string;
  @IsBoolean() enabled!: boolean;
}

class PatchNotificationsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => NotificationItemDto)
  items!: NotificationItemDto[];
}

/**
 * [Trục B L1] "Quyền của tôi" + tuỳ chọn cá nhân + thông báo — CHÍNH MÌNH, mọi role.
 */
@Controller('me')
export class MeController {
  constructor(private svc: MeService) {}

  @Get('access')
  @RequirePermission('access.self:read')
  access(@CurrentUser() user: RequestUser) {
    return this.svc.access(user);
  }

  @Get('settings')
  @RequirePermission('settings.self:read')
  getSettings(@CurrentUser() user: RequestUser) {
    return this.svc.getSettings(user);
  }

  @Patch('settings')
  @RequirePermission('settings.self:update')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: PatchSettingsDto) {
    return this.svc.updateSettings(user, dto.patch);
  }

  @Get('notifications')
  @RequirePermission('notify.self:read')
  getNotifications(@CurrentUser() user: RequestUser) {
    return this.svc.getNotifications(user);
  }

  @Patch('notifications')
  @RequirePermission('notify.self:update')
  updateNotifications(@CurrentUser() user: RequestUser, @Body() dto: PatchNotificationsDto) {
    return this.svc.updateNotifications(user, dto.items);
  }
}
