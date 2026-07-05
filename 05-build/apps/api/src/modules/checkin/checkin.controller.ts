import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID,
  Length, Max, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { CheckinService } from './checkin.service';

class GoalUpdateDto {
  @IsUUID() goalId!: string;
  @IsNumber() @Min(0) @Max(100) progressPct!: number;
  @IsOptional() @IsString() note?: string;
}

class SubmitCheckinDto {
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly']) cadence!: string;
  @IsString() @Length(4, 10) periodKey!: string;
  @IsOptional() @IsString() progressNote?: string;
  @IsOptional() @IsString() blocker?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => GoalUpdateDto)
  goalUpdates!: GoalUpdateDto[];
}

class ReviewCheckinDto {
  @IsString() @Length(1, 2000) managerComment!: string;
}

@Controller('checkins')
export class CheckinController {
  constructor(private checkins: CheckinService) {}

  @Get()
  @RequirePermission('checkin:read')
  list(@CurrentUser() user: RequestUser, @Query('personId') personId?: string) {
    return this.checkins.list(user, personId);
  }

  @Post()
  @RequirePermission('checkin:write')
  @Audited('checkin.submit')
  submit(@CurrentUser() user: RequestUser, @Body() dto: SubmitCheckinDto) {
    return this.checkins.submit(user, dto);
  }

  /** Manager nhận xét — human-in-the-loop. */
  @Post(':id/review')
  @RequirePermission('checkin:review')
  @Audited('checkin.review')
  review(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCheckinDto,
  ) {
    return this.checkins.review(user, id, dto.managerComment);
  }
}
