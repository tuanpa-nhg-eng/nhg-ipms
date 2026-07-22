import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { CalibrationService } from './calibration.service';

class CreateSessionDto {
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
}

class ListSessionsDto {
  @IsOptional() @IsUUID() cycleId?: string;
}

class DecisionDto {
  @IsUUID() sessionId!: string;
  @IsUUID() reviewId!: string;
  @IsString() @Length(1, 20) ratingAfter!: string;
  @IsString() @Length(10, 2000) rationale!: string; // BẮT BUỘC ≥10 ký tự — explainable
  @IsInt() @Min(1) version!: number; // [F28] optimistic lock
}

@Controller()
export class CalibrationController {
  constructor(private calibration: CalibrationService) {}

  // [Trục A — L1] đọc phiên cân chỉnh (trước đây chỉ có POST)
  @Get('calibration-sessions')
  @RequirePermission('calibration:run')
  listSessions(@CurrentUser() user: RequestUser, @Query() q: ListSessionsDto) {
    return this.calibration.listSessions(user, q);
  }

  @Get('calibration-sessions/:id')
  @RequirePermission('calibration:run')
  getSession(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.calibration.getSession(user, id);
  }

  @Post('calibration-sessions')
  @RequirePermission('calibration:run')
  @Audited('calibration_session.create')
  createSession(@CurrentUser() user: RequestUser, @Body() dto: CreateSessionDto) {
    return this.calibration.createSession(user, dto);
  }

  /** Đổi rating trong calibration — rationale BẮT BUỘC, audit cùng transaction. */
  @Post('calibration-decisions')
  @RequirePermission('calibration:run')
  decide(@CurrentUser() user: RequestUser, @Body() dto: DecisionDto) {
    return this.calibration.decide(user, dto);
  }
}
