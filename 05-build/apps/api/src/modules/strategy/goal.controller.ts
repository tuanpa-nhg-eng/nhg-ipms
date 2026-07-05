import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { GoalService } from './goal.service';

class CreateGoalDto {
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @Length(1, 20) period!: string;
  @IsUUID() ownerId!: string;
  @IsOptional() @IsUUID() objectiveId?: string;
  @IsOptional() @IsUUID() parentGoalId?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
}

class UpdateProgressDto {
  @IsNumber() @Min(0) @Max(100) progressPct!: number;
}

@Controller('goals')
export class GoalController {
  constructor(private goals: GoalService) {}

  @Get()
  @RequirePermission('goal:read')
  list(@CurrentUser() user: RequestUser, @Query('ownerId') ownerId?: string) {
    return this.goals.list(user.tenantId, ownerId);
  }

  @Post()
  @RequirePermission('goal:write')
  @Audited('goal.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user, dto);
  }

  /** Cập nhật tiến độ goal lá → health roll-up chuỗi cha (cùng transaction). */
  @Patch(':id/progress')
  @RequirePermission('goal:write')
  @Audited('goal.progress')
  updateProgress(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.goals.updateProgress(user, id, dto.progressPct);
  }
}
