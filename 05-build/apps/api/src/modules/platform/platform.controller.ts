import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ExportExempt } from '../../common/export/export.decorators';
import { PlatformService } from './platform.service';

/**
 * [Trục C L2] Quản trị NỀN TẢNG (tầng ①) — bề mặt của B3.
 *
 * Mọi route ở đây đọc `platform_snapshot` (số đếm + trạng thái) qua GUC, KHÔNG có tenant
 * context ⇒ không route nào chạm được một dòng dữ liệu nghiệp vụ, kể cả khi có lỗi lập trình:
 * `app.tenant_id` không set thì policy của mọi bảng nghiệp vụ trả 0 dòng.
 *
 * Mốc demo của lát: B3 thấy đơn vị nào đang có vấn đề, bật tắt cờ tính năng, biết chi phí AI
 * và số lần xuất dữ liệu — mà KHÔNG đọc được một dòng đánh giá nào. Ca đối chứng chứng minh
 * chiều ngược lại nằm ở `platform-admin.spec` (quét mọi endpoint nghiệp vụ → 403).
 */
@Controller('platform')
export class PlatformController {
  constructor(private svc: PlatformService) {}

  @Get('tenants')
  @RequirePermission('tenant:list')
  tenants(@CurrentUser() user: RequestUser) {
    return this.svc.listTenants(user);
  }

  @Post('tenants')
  @RequirePermission('tenant:create')
  @Audited('platform.tenant_create')
  createTenant(
    @CurrentUser() user: RequestUser,
    @Body('code') code: string,
    @Body('nameVi') nameVi: string,
    @Body('type') type: string,
  ) {
    // Không dùng DTO class — cùng lý do F185/datacatalog: ValidationPipe toàn cục chạy
    // plainToClass đệ quy trên @Body() có metatype là class, và khoá 'constructor' do client
    // gửi làm bước đoán kiểu đọc trúng giá trị client kiểm soát → 500 trước cả whitelist.
    return this.svc.createTenant(user, { code, nameVi, type });
  }

  @Get('health')
  @RequirePermission('system:health')
  health(@CurrentUser() user: RequestUser) {
    return this.svc.health(user);
  }

  @Get('ai-usage')
  @RequirePermission('ai:usage_read')
  aiUsage(@CurrentUser() user: RequestUser) {
    return this.svc.aiUsage(user);
  }

  @Get('integrations')
  @RequirePermission('integration:status')
  integrations(@CurrentUser() user: RequestUser) {
    return this.svc.integrationStatus(user);
  }

  /**
   * Số lần xuất dữ liệu theo đơn vị — KHÔNG phải từng dòng `export_log` (xem ghi chú trong
   * service: chi tiết là hồ sơ giám sát của B0, K1 chỉ cho tầng nền tảng đọc metadata).
   */
  @Get('export-activity')
  @RequirePermission('exportlog:read_metadata')
  // Đường dẫn chứa 'export' nên khớp heuristic egress của trục C L1 — nhưng đây là ĐỌC số
  // đếm trong hệ, không phải đường mang dữ liệu ra ngoài.
  @ExportExempt('đọc số đếm hoạt động xuất — metadata, không phải đường dữ liệu ra')
  exportActivity(@CurrentUser() user: RequestUser) {
    return this.svc.exportActivity(user);
  }

  /** [Trục C L4] Số đếm cờ rủi ro theo đơn vị — B3 thấy đơn vị nào đỏ, không đọc được nội dung. */
  @Get('risk')
  @RequirePermission('risk:read_summary')
  risk(@CurrentUser() user: RequestUser) {
    return this.svc.riskOverview(user);
  }

  @Get('flags')
  @RequirePermission('flag:read')
  flags(@CurrentUser() user: RequestUser) {
    return this.svc.listFlags(user);
  }

  @Put('flags/:key')
  @RequirePermission('flag:write')
  @Audited('platform.flag_set')
  setFlag(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string,
    @Body('enabled') enabled: boolean,
    @Body('version') version?: number,
  ) {
    return this.svc.setGlobalFlag(
      user, key, enabled === true,
      version === undefined ? undefined : Number(version),
    );
  }

  /**
   * Làm mới read model. Gác sau `system:health` chứ không tạo permission riêng: đây là thao
   * tác VẬN HÀNH trên chính read model của mình, không phải quyền mới trên dữ liệu.
   */
  @Post('snapshot/refresh')
  @RequirePermission('system:health')
  @Audited('platform.snapshot_refresh')
  refresh(@CurrentUser() user: RequestUser) {
    return this.svc.refreshAll();
  }
}
