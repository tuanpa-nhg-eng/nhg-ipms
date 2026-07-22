import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID,
  Length, Max, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ReviewService } from './review.service';

class CreateCycleDto {
  @IsString() @Length(1, 255) name!: string;
  @IsString() @Length(4, 20) period!: string;
  @IsISO8601() startDate!: string; // [F29] bắt buộc — khung kỳ evidence
  @IsISO8601() endDate!: string;
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

class ManualActualDto {
  @IsUUID() kpiId!: string;
  @IsNumber() actual!: number;
}

class ComputeScoreDto {
  // [F26] client CHỈ gửi actual cho KPI manual — target/base server-side
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ManualActualDto)
  manualActuals!: ManualActualDto[];
}

const REVIEW_STATUSES = ['draft', 'self_done', 'manager_done', 'calibrated', 'final'] as const;

class ListReviewsDto {
  // [F74] uuid validate NGAY TẠI CỬA — không để chuỗi lạ đi vào query
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsUUID() revieweeId?: string;
  // whitelist trạng thái (F137): giá trị lạ → 400, không âm thầm trả rỗng
  @IsOptional() @IsIn(REVIEW_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
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
  @RequirePermission('review:manage') // [F31] quản trị cycle — hrbp/tenant_admin
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
  @RequirePermission('review:manage') // [F31] tạo review là việc quản trị — không phải employee
  @Audited('review.create')
  createReview(@CurrentUser() user: RequestUser, @Body() dto: CreateReviewDto) {
    return this.reviews.createReview(user, dto);
  }

  // [Trục A — L1] Danh sách review, lọc scope trong query (I1). Đặt TRƯỚC ':id' để
  // Nest không nuốt '/reviews' vào route param.
  @Get('reviews')
  @RequirePermission('review:read')
  list(@CurrentUser() user: RequestUser, @Query() q: ListReviewsDto) {
    return this.reviews.list(user, q);
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
