import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsOptional, IsString, Length } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { GoldenService } from './golden.service';

class DecideGoldenDto {
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}

const CANDIDATE_STATUSES = new Set(['proposed', 'approved', 'rejected']);

/**
 * [Learning Loop L1] Golden Set — permission `ai:eval:curate` (library_curator/admin).
 * SoD per-candidate: người duyệt ≠ người tạo tín hiệu (service chặn cả admin).
 */
@Controller()
export class GoldenController {
  constructor(private svc: GoldenService) {}

  /** Quét tín hiệu accepted(_with_edits) chưa có candidate → ứng viên proposed. */
  @Post('ai/golden/harvest')
  @RequirePermission('ai:eval:curate')
  @Audited('ai_golden.harvest')
  harvest(@CurrentUser() user: RequestUser) {
    return this.svc.harvest(user);
  }

  @Get('ai/golden/candidates')
  @RequirePermission('ai:eval:curate')
  list(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    if (status && !CANDIDATE_STATUSES.has(status)) {
      throw new UnprocessableEntityException("status phải là 'proposed' | 'approved' | 'rejected'");
    }
    return this.svc.list(user, status);
  }

  /** Duyệt → ai_eval_case suite 'golden-learned' (SoD: 409 nếu tự duyệt tín hiệu của mình). */
  @Post('ai/golden/candidates/:id/approve')
  @RequirePermission('ai:eval:curate')
  @Audited('ai_golden.approve')
  approve(
    @CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideGoldenDto, @Req() req: Request,
  ) {
    return this.svc.approve(user, id, dto.note, req.ip);
  }

  @Post('ai/golden/candidates/:id/reject')
  @RequirePermission('ai:eval:curate')
  @Audited('ai_golden.reject')
  reject(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideGoldenDto) {
    return this.svc.reject(user, id, dto.note);
  }
}
