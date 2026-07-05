import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID,
  Length, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ReviewService } from './review.service';

class CreateCycleDto {
  @IsString() @Length(1, 255) name!: string;
  @IsString() @Length(4, 20) period!: string;
}

class CreateReviewDto {
  @IsUUID() cycleId!: string;
  @IsUUID() revieweeId!: string;
  @IsUUID() scorecardId!: string;
}

class SelfDto {
  @IsString() @Length(1, 5000) selfReflection!: string;
}

class ManagerDto {
  @IsString() @Length(1, 5000) managerAssessment!: string;
  @IsOptional() @IsString() proposedRating?: string;
}

class ComputeInputDto {
  @IsUUID() kpiId!: string;
  @IsNumber() target!: number;
  @IsOptional() @IsNumber() actual?: number;
  @IsOptional() @IsNumber() base?: number;
}

class ComputeScoreDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ComputeInputDto)
  inputs!: ComputeInputDto[];
}

class FinalizeDto {
  @IsString() @Length(1, 20) finalRating!: string;
  @IsString() @Length(1, 2000) rationale!: string;
  @IsInt() @Min(1) version!: number;
}

@Controller()
export class ReviewController {
  constructor(private reviews: ReviewService) {}

  @Post('review-cycles')
  @RequirePermission('review:write')
  @Audited('review_cycle.create')
  createCycle(@CurrentUser() user: RequestUser, @Body() dto: CreateCycleDto) {
    return this.reviews.createCycle(user, dto);
  }

  @Get('review-cycles')
  @RequirePermission('review:read')
  listCycles(@CurrentUser() user: RequestUser) {
    return this.reviews.listCycles(user);
  }

  @Post('reviews')
  @RequirePermission('review:write')
  @Audited('review.create')
  createReview(@CurrentUser() user: RequestUser, @Body() dto: CreateReviewDto) {
    return this.reviews.createReview(user, dto);
  }

  @Get('reviews/:id')
  @RequirePermission('review:read')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.get(user, id);
  }

  @Post('reviews/:id/self')
  @RequirePermission('review:write')
  @Audited('review.self')
  self(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SelfDto) {
    return this.reviews.self(user, id, dto.selfReflection);
  }

  @Post('reviews/:id/manager')
  @RequirePermission('review:write')
  @Audited('review.manager')
  manager(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManagerDto) {
    return this.reviews.manager(user, id, dto);
  }

  @Post('reviews/:id/compute-score')
  @RequirePermission('review:write')
  @Audited('review.compute_score')
  compute(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComputeScoreDto) {
    return this.reviews.computeScore(user, id, dto);
  }

  /** HUMAN-IN-THE-LOOP — rating:approve + optimistic lock + governance check. Audit cùng transaction (F5). */
  @Post('reviews/:id/finalize')
  @RequirePermission('rating:approve')
  finalize(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeDto,
    @Req() req: any,
  ) {
    return this.reviews.finalize(user, id, dto, req.ip);
  }
}
