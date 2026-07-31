import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { INCIDENT_ROOT_CAUSE_MIN_LEN, INCIDENT_STATUSES } from '@ipms/shared';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { RiskService } from './risk.service';

const SEVERITIES = ['low', 'medium', 'high'] as const;

class ListRiskQueryDto {
  @IsOptional() @IsString() @Length(0, 60) kind?: string;
  @IsOptional() @IsIn(SEVERITIES as unknown as string[]) severity?: string;
  @IsOptional() @IsIn(['true', 'false']) linked?: string;
  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
}

class OpenIncidentDto {
  @IsString() @Length(5, 200) title!: string;
  @IsIn(SEVERITIES as unknown as string[]) severity!: string;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @IsString() @Length(0, 2000) note?: string;
  @IsOptional() @IsUUID('all', { each: true }) flagIds?: string[];
}

class UpdateIncidentDto {
  // 'closed' cố ý NẰM TRONG danh sách hợp lệ của validator để service trả lời được bằng một
  // thông báo có ích ("đóng phải qua endpoint riêng"), thay vì 400 trống trơn của validator.
  @IsOptional() @IsIn(INCIDENT_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @IsString() @Length(0, 2000) note?: string;
  @IsOptional() @IsUUID('all', { each: true }) flagIds?: string[];
  @IsInt() version!: number;
}

class CloseIncidentDto {
  @IsString() @Length(INCIDENT_ROOT_CAUSE_MIN_LEN, 2000) rootCause!: string;
  @IsInt() version!: number;
}

/**
 * [Trục C L4] Bốn đường đọc, ba mức chi tiết — đúng ranh giới K1 mà L2 đã đặt:
 *   · `GET /risk`          — CHI TIẾT, `risk:read`         → B5 (tuân thủ) + B0 (kiểm toán)
 *   · `GET /risk/summary`  — SỐ ĐẾM,  `risk:read_summary`  → V1 (điều hành)
 *   · `GET /platform/risk` — SỐ ĐẾM xuyên đơn vị           → B3 (nền tảng), xem platform.controller
 *   · B0 còn đọc được nguồn gốc qua `GET /audit-logs` sẵn có — cờ chỉ là lớp suy ra.
 */
@Controller()
export class RiskController {
  constructor(private svc: RiskService) {}

  @Get('risk')
  @RequirePermission('risk:read')
  list(@CurrentUser() user: RequestUser, @Query() q: ListRiskQueryDto) {
    return this.svc.list(user, q);
  }

  @Get('risk/summary')
  @RequirePermission('risk:read_summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.svc.summary(user);
  }

  /**
   * Chạy bộ sinh một cách tường minh. KHÔNG phải cơ chế bảo vệ — các đường đọc đã tự sinh
   * trước khi trả (xem `RiskService`); endpoint này để job nền/driver gọi và ĐẾM được số cờ
   * mới, thứ mà một lời gọi GET không trả ra.
   */
  @Post('risk/refresh')
  @RequirePermission('risk:read')
  refresh(@CurrentUser() user: RequestUser) {
    return this.svc.generate(user.tenantId);
  }

  @Get('incidents')
  @RequirePermission('incident:read')
  incidents(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    return this.svc.listIncidents(user, status);
  }

  @Post('incidents')
  @RequirePermission('incident:manage')
  open(@CurrentUser() user: RequestUser, @Body() dto: OpenIncidentDto, @Req() req: any) {
    return this.svc.openIncident(user, dto, req.ip);
  }

  @Patch('incidents/:id')
  @RequirePermission('incident:manage')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @Req() req: any,
  ) {
    return this.svc.updateIncident(user, id, dto, req.ip);
  }

  @Post('incidents/:id/close')
  @RequirePermission('incident:manage')
  close(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseIncidentDto,
    @Req() req: any,
  ) {
    return this.svc.closeIncident(user, id, dto, req.ip);
  }
}
