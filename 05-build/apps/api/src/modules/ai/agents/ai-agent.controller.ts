import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { AiAgentService } from './ai-agent.service';

/**
 * [Trục D L0] Danh bạ agent AI (BR-M09-02).
 *
 * KHÔNG khai `@Exported`: đường dẫn `/ai/agents` không khớp heuristic bề mặt xuất, và nội dung
 * trả về là HIẾN CHƯƠNG của agent (mục đích, chủ quản, trần, quyền) — không có dữ liệu nghiệp
 * vụ, không có lượt gọi nào. Đây là siêu dữ liệu quản trị, cùng loại với `/data-catalog`.
 */
@Controller('ai/agents')
export class AiAgentController {
  constructor(private svc: AiAgentService) {}

  /** Danh bạ hiệu lực (bản chuẩn tập đoàn, đè bởi bản riêng của đơn vị nếu có). */
  @Get()
  @RequirePermission('aiagent:read')
  list(@CurrentUser() user: RequestUser) {
    return this.svc.list(user);
  }

  /** Tra danh tính hiệu lực của một agent — hàm mà L1/L2/L3 sẽ gọi. */
  @Get(':code')
  @RequirePermission('aiagent:read')
  resolve(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.svc.resolve(user.tenantId, code);
  }

  /**
   * Đơn vị SIẾT hiến chương của một agent. Chỉ `data_steward` giữ `aiagent:write`.
   *
   * KHÔNG dùng DTO class cho body — cùng lý do F185 ở tenant-config và ở data-catalog:
   * ValidationPipe toàn cục chạy plainToClass đệ quy trên @Body() có metatype là class, và key
   * 'constructor' do client gửi làm cái đoán kiểu đó đọc trúng giá trị client control → 500
   * TRƯỚC khi tới whitelist. Trích từng trường bằng @Body('x') thì NestJS bỏ qua transform.
   */
  @Put(':code')
  @RequirePermission('aiagent:write')
  @Audited('aiagent.override')
  upsert(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body('maxDataClass') maxDataClass?: string,
    @Body('dataAssetCodes') dataAssetCodes?: string[],
    @Body('permissions') permissions?: string[],
    @Body('hitlMode') hitlMode?: string,
    @Body('status') status?: string,
    @Body('note') note?: string,
    @Body('version') version?: number,
  ) {
    return this.svc.upsertTenantOverride(user, code, {
      maxDataClass,
      // Mảng đến từ JSON body: lọc về string[] tại CỬA, không tin client. Service còn lọc lần
      // nữa khi đọc jsonb từ DB — hai lớp cho hai nguồn không tin cậy khác nhau.
      dataAssetCodes: Array.isArray(dataAssetCodes)
        ? dataAssetCodes.filter((x): x is string => typeof x === 'string') : undefined,
      permissions: Array.isArray(permissions)
        ? permissions.filter((x): x is string => typeof x === 'string') : undefined,
      hitlMode, status, note,
      version: version === undefined ? undefined : Number(version),
    });
  }
}
