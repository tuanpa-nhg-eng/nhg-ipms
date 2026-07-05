import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ScorecardService } from './scorecard.service';

class ScorecardItemDto {
  @IsUUID() kpiId!: string;
  @IsOptional() @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsString() groupLabel?: string;
  @IsOptional() @IsNumber() @Min(0) groupWeight?: number;
  @IsOptional() @IsNumber() target?: number; // [F26] target server-side
  @IsOptional() @IsNumber() base?: number;
}

class CreateScorecardDto {
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsUUID() roleFamilyId?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsString() period?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ScorecardItemDto)
  items!: ScorecardItemDto[];
}

class ActualDto {
  @IsUUID() kpiId!: string;
  @IsNumber() actual!: number;
  @IsNumber() target!: number;
  @IsOptional() @IsNumber() base?: number;
}

class ComputePreviewDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ActualDto)
  actuals!: ActualDto[];
}

@Controller('scorecards')
export class ScorecardController {
  constructor(private scorecards: ScorecardService) {}

  @Get()
  @RequirePermission('scorecard:read')
  list(@CurrentUser() user: RequestUser) {
    return this.scorecards.list(user.tenantId);
  }

  @Post()
  @RequirePermission('scorecard:write')
  @Audited('scorecard.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateScorecardDto) {
    return this.scorecards.create(user.tenantId, user.claims.sub, dto);
  }

  @Post(':id/validate-weights')
  @RequirePermission('scorecard:read')
  validateWeights(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scorecards.validateWeights(user.tenantId, id);
  }

  /** Preview Scoring Engine — không ghi DB. */
  @Post(':id/compute-preview')
  @RequirePermission('scorecard:read')
  computePreview(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ComputePreviewDto,
  ) {
    return this.scorecards.computePreview(user.tenantId, id, dto);
  }
}
