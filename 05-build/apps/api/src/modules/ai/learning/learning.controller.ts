import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { LearningService } from './learning.service';

class ExpireDto {
  @IsOptional() @IsInt() @Min(1) @Max(365) ttlDays?: number;
}

/**
 * [Learning Loop L0] Analytics tín hiệu học + job dọn suggestion mồ côi (F158).
 * Permission `ai:eval` (designer/admin) — cùng chủ thể vận hành eval harness;
 * KHÔNG cấp cho author/curator (họ tạo ra tín hiệu, không cần soi corpus).
 */
@Controller()
export class LearningController {
  constructor(private svc: LearningService) {}

  /** Tỷ lệ Chấp nhận / Sửa / Bỏ per agent + field AI hay bị sửa — nền dashboard L4. */
  @Get('ai/learning/stats')
  @RequirePermission('ai:eval')
  stats(@CurrentUser() user: RequestUser) {
    return this.svc.stats(user);
  }

  /** [F158] Suggestion PENDING quá TTL (env AI_SUGGESTION_TTL_DAYS, mặc định 14d) → expired. */
  @Post('ai/learning/jobs/expire/run')
  @RequirePermission('ai:eval')
  @Audited('ai_learning.expire')
  expire(@CurrentUser() user: RequestUser, @Body() dto: ExpireDto) {
    return this.svc.expireOrphans(user, dto.ttlDays);
  }
}
