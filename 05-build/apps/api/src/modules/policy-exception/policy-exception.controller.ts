import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { EXCEPTION_MAX_TTL_HOURS } from '@ipms/shared';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PolicyExceptionService } from './policy-exception.service';

const SCOPE_TYPES = ['tenant', 'org_unit', 'self'] as const;

class RequestExceptionDto {
  @IsUUID() granteeUserId!: string;
  @IsString() permissionCode!: string;
  @IsOptional() @IsIn(SCOPE_TYPES as unknown as string[]) scopeType?: 'tenant' | 'org_unit' | 'self';
  @IsOptional() @IsUUID() scopeId?: string;
  // ≥20 ký tự, song song CHECK constraint ở DB (cùng khuôn `impersonation_session`).
  @IsString() @Length(20, 500) reason!: string;
  // Trần cứng đặt luôn ở validator: xin 1000 giờ phải hỏng ở cửa vào, không phải sau khi đã
  // ghi một hàng `pending` mà không ai duyệt được.
  @IsInt() @Min(1) @Max(EXCEPTION_MAX_TTL_HOURS) requestedHours!: number;
}

class DecideExceptionDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(EXCEPTION_MAX_TTL_HOURS) hours?: number;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

class RevokeExceptionDto {
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

class ListExceptionQueryDto {
  @IsOptional() @IsString() @Length(0, 20) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}

/**
 * [Trục C L3] Ba quyền TÁCH nhau đúng theo K5: `exception:request` (xin) ⟂ `exception:approve`
 * (duyệt/từ chối/thu hồi) ⟂ `exception:read` (rà soát). Không endpoint nào gộp hai vai.
 */
@Controller('policy-exceptions')
export class PolicyExceptionController {
  constructor(private svc: PolicyExceptionService) {}

  @Post()
  @RequirePermission('exception:request')
  request(@CurrentUser() user: RequestUser, @Body() dto: RequestExceptionDto, @Req() req: any) {
    return this.svc.request(user, dto, req.ip);
  }

  @Get()
  @RequirePermission('exception:read')
  list(@CurrentUser() user: RequestUser, @Query() q: ListExceptionQueryDto) {
    return this.svc.list(user, q.status);
  }

  @Post(':id/decide')
  @RequirePermission('exception:approve')
  decide(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideExceptionDto,
    @Req() req: any,
  ) {
    return this.svc.decide(user, id, dto, req.ip);
  }

  @Post(':id/revoke')
  @RequirePermission('exception:approve')
  revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeExceptionDto,
    @Req() req: any,
  ) {
    return this.svc.revoke(user, id, dto.note, req.ip);
  }

  /**
   * Dọn các đơn đã hết hạn. Gác `exception:approve` chứ không mở public: nó ghi vào bảng hồ
   * sơ tuân thủ. KHÔNG phải cơ chế bảo vệ — quyền đã tự mất ở cửa từ trước (xem service).
   */
  @Post('sweep')
  @RequirePermission('exception:approve')
  sweep(@CurrentUser() user: RequestUser) {
    return this.svc.sweepExpired(user.tenantId);
  }
}
