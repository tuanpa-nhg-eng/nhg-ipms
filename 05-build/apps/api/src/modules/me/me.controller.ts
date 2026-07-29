import { Body, Controller, Get, ParseIntPipe, Patch } from '@nestjs/common';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { MeService } from './me.service';

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

  // [F185 — Reviewer đối kháng] Không dùng DTO class cho `patch` — lý do đầy đủ tại
  // tenant-config.controller.ts (class-transformer đệ quy vào object lồng nhau, đoán kiểu
  // qua `value.constructor` bị đầu độc bởi key 'constructor' do client gửi → 500 chưa bắt).
  // [F189 — Reviewer đối kháng] `version` qua ParseIntPipe áp trực tiếp lên tham số trích ra —
  // không đi qua class-transformer's plainToClass nên không dính lại lỗ đệ quy F185.
  @Patch('settings')
  @RequirePermission('settings.self:update')
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body('patch') patch: Record<string, unknown>,
    @Body('version', ParseIntPipe) version: number,
  ) {
    return this.svc.updateSettings(user, patch, version);
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
