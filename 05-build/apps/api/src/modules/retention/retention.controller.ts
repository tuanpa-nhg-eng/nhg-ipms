import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { RETENTION_ACTIONS } from '@ipms/shared';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { RetentionService } from './retention.service';

class SetPolicyDto {
  @IsInt() @Min(1) @Max(600) retentionMonths!: number;
  @IsIn(RETENTION_ACTIONS as unknown as string[]) action!: string;
  @IsOptional() @IsString() @Length(0, 500) legalBasis?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

class ApplyDto {
  // Bắt buộc, và là UUID của một lượt CHẠY THỬ — không có mặc định, không có cờ "bỏ qua".
  @IsUUID() dryRunId!: string;
}

/**
 * [Trục C L5] Lưu trữ & xoá dữ liệu cá nhân.
 *
 * Ba quyền tách nhau theo mức hậu quả: `retention:read` (xem chính sách + sổ lượt chạy — B0
 * rà được) · `retention:manage` (đặt chính sách — sai thì sửa lại được) · `retention:run`
 * (bấm chạy — sai thì dữ liệu đã mất).
 *
 * KHÔNG có endpoint nào chạy thật mà không đi qua `dryRunId`. Đó là chốt an toàn của cả lát,
 * và nó nằm ở cả DTO, service, lẫn CHECK constraint ở DB.
 */
@Controller('retention')
export class RetentionController {
  constructor(private svc: RetentionService) {}

  @Get('policies')
  @RequirePermission('retention:read')
  policies(@CurrentUser() user: RequestUser) {
    return this.svc.effectivePolicies(user);
  }

  @Put('policies/:assetCode')
  @RequirePermission('retention:manage')
  setPolicy(
    @CurrentUser() user: RequestUser,
    @Param('assetCode') assetCode: string,
    @Body() dto: SetPolicyDto,
    @Req() req: any,
  ) {
    return this.svc.upsertPolicy(user, assetCode, dto, req.ip);
  }

  @Get('runs')
  @RequirePermission('retention:read')
  runs(@CurrentUser() user: RequestUser, @Query('asset') asset?: string) {
    return this.svc.listRuns(user, asset);
  }

  @Post('dry-run/:assetCode')
  @RequirePermission('retention:run')
  dryRun(@CurrentUser() user: RequestUser, @Param('assetCode') assetCode: string, @Req() req: any) {
    return this.svc.dryRun(user, assetCode, req.ip);
  }

  @Post('apply/:assetCode')
  @RequirePermission('retention:run')
  apply(
    @CurrentUser() user: RequestUser,
    @Param('assetCode') assetCode: string,
    @Body() dto: ApplyDto,
    @Req() req: any,
  ) {
    return this.svc.apply(user, assetCode, dto.dryRunId, req.ip);
  }
}
