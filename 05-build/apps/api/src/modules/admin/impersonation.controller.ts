import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { IsString, IsUUID, Length } from 'class-validator';
import {
  CurrentUser, ImpersonationExitExempt, PolicyExempt, RequirePermission, RequestUser,
} from '../../common/auth/decorators';
import { ImpersonationService } from './impersonation.service';

class StartImpersonationDto {
  @IsUUID() targetUserId!: string;
  // [DB CHECK song song — trigger] ≥20 ký tự, "test" không phải lý do
  @IsString() @Length(20, 500) reason!: string;
}

@Controller('admin/impersonation')
export class ImpersonationController {
  constructor(private svc: ImpersonationService) {}

  @Post()
  @RequirePermission('user:impersonate')
  start(@CurrentUser() user: RequestUser, @Body() dto: StartImpersonationDto, @Req() req: any) {
    return this.svc.start(user, dto, req.ip);
  }

  /**
   * [Trục B L4] Luôn gọi được — miễn trừ CẢ HAI tầng permission (RBAC) lẫn policy (ABAC),
   * xác định phiên qua `imp_sid` trong JWT, không nhận id từ client.
   */
  @Delete('current')
  @ImpersonationExitExempt()
  @PolicyExempt()
  end(@CurrentUser() user: RequestUser, @Req() req: any) {
    return this.svc.end(user, req.ip);
  }

  @Get()
  @RequirePermission('audit:read')
  list(@CurrentUser() user: RequestUser) {
    return this.svc.list(user);
  }
}
