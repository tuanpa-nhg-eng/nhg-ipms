import {
  Body, Controller, Delete, Get, Ip, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { AuthoringService } from './authoring.service';

class GrantDto {
  @IsUUID() granteeId!: string;
  @IsUUID() orgUnitId!: string;
  // allowlist enforce lần nữa trong service (F55) — DTO chỉ chặn sớm
  @IsOptional() @IsIn(['taskcell:author']) capability?: string;
}

/**
 * [Lát 4j] Ủy quyền phân cấp — trưởng phòng cấp/thu quyền soạn tác vụ
 * cho nhân viên trong phòng (Spec Task Dictionary §7).
 */
@Controller('authoring/grants')
export class AuthoringController {
  constructor(private svc: AuthoringService) {}

  @Get()
  @RequirePermission('taskcell:delegate')
  list(
    @CurrentUser() user: RequestUser,
    // [F118] uuid tại cửa (chuẩn F74) — param lạ không được chạm Prisma
    @Query('orgUnitId', new ParseUUIDPipe({ optional: true })) orgUnitId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list(user, orgUnitId, status);
  }

  @Post()
  @RequirePermission('taskcell:delegate')
  @Audited('authoring.grant')
  grant(@CurrentUser() user: RequestUser, @Body() dto: GrantDto, @Ip() ip?: string) {
    return this.svc.grant(user, dto, ip);
  }

  @Delete(':id')
  @RequirePermission('taskcell:delegate')
  @Audited('authoring.revoke')
  revoke(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revoke(user, id);
  }
}
