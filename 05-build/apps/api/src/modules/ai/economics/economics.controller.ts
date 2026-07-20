import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { EconomicsService } from './economics.service';

/**
 * [Learning Loop L3] Unit economics (PRD §16) — permission `ai:eval` (designer/admin,
 * cùng chủ thể vận hành eval/learning stats). Read-only analytics, không đổi trạng thái.
 */
@Controller()
export class EconomicsController {
  constructor(private svc: EconomicsService) {}

  /** Token/latency P50/P95 per agent + cost thực (mock=0) + projection ×0.5/×1/×2. */
  @Get('ai/economics')
  @RequirePermission('ai:eval')
  report(@CurrentUser() user: RequestUser) {
    return this.svc.report(user);
  }

  /** Bảng giá model (global catalog, app read-only — cập nhật qua seed/B3). */
  @Get('ai/economics/prices')
  @RequirePermission('ai:eval')
  prices(@CurrentUser() user: RequestUser) {
    return this.svc.listPrices(user);
  }
}
