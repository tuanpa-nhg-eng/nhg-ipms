import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { AuditService } from './audit.service';

class ListAuditDto {
  // action là tiền tố tự do nhưng vẫn phải hợp lệ về hình dạng — chặn ký tự lạ đi vào
  // startsWith (Prisma tham số hoá nên không phải lỗ injection, đây là vệ sinh đầu vào).
  @IsOptional() @IsString() @Length(1, 80) @Matches(/^[a-z0-9_.:-]+$/i) action?: string;
  @IsOptional() @IsString() @Length(1, 80) @Matches(/^[a-z0-9_.:-]+$/i) entityType?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,20}$/) cursor?: string; // BigInt dạng chuỗi
}

class AuditStatsDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

/**
 * [Trục A — L1] Bề mặt đọc audit log — chỉ role `auditor` (audit:read).
 * tenant_admin KHÔNG có quyền này theo thiết kế SoD; 403 ở đây là hành vi ĐÚNG.
 */
@Controller('audit-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(@CurrentUser() user: RequestUser, @Query() q: ListAuditDto) {
    return this.audit.list(user, q);
  }

  @Get('stats')
  @RequirePermission('audit:read')
  stats(@CurrentUser() user: RequestUser, @Query() q: AuditStatsDto) {
    return this.audit.stats(user, q);
  }
}
