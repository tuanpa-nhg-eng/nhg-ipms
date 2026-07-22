import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { OverviewService } from './overview.service';

class OverviewQueryDto {
  @IsOptional() @IsUUID() cycleId?: string;
}

/**
 * [Trục A — L1] `/exec/overview` — tổng hợp cho bảng điều khiển điều hành.
 * Gác `goal:read`, nhưng phạm vi dữ liệu do SCOPE quyết định (xem OverviewService):
 * employee gọi được và chỉ nhận số của chính mình.
 */
@Controller('exec')
export class OverviewController {
  constructor(private overview: OverviewService) {}

  @Get('overview')
  @RequirePermission('goal:read')
  get(@CurrentUser() user: RequestUser, @Query() q: OverviewQueryDto) {
    return this.overview.overview(user, q);
  }
}
