import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { DictionaryService } from './dictionary.service';

/**
 * [Go-live Từ điển Tác vụ] API tra cứu công khai trong tenant (read-only, canonical).
 * Permission taskdict:read — cấp cho MỌI persona (tài nguyên tham chiếu toàn hàng).
 * Tách khỏi /task-cells (Config Studio, version-scoped) để không lộ config draft.
 */
@Controller('task-dictionary')
export class DictionaryController {
  constructor(private svc: DictionaryService) {}

  @Get()
  @RequirePermission('taskdict:read')
  list(
    @CurrentUser() user: RequestUser,
    @Query('q') q?: string,
    @Query('groupCode') groupCode?: string,
    @Query('aiLevel') aiLevel?: string,
    @Query('kpiRef') kpiRef?: string,
    @Query('role') role?: string,
  ) {
    // chuẩn hoá query: cắt độ dài để tránh lạm dụng (read-only nhưng vẫn cap)
    const cap = (s?: string) => (s ? s.slice(0, 120) : undefined);
    return this.svc.list(user, {
      q: cap(q), groupCode: cap(groupCode), aiLevel: cap(aiLevel),
      kpiRef: cap(kpiRef), role: cap(role),
    });
  }

  @Get(':code')
  @RequirePermission('taskdict:read')
  detail(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.svc.detail(user, code);
  }
}
