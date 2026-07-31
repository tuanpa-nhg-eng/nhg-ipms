import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ExportExempt } from '../../common/export/export.decorators';
import { PrismaService } from '../../prisma.service';

/**
 * [Trục C L1] Đọc sổ nhật ký xuất dữ liệu — bề mặt để B0 (kiểm toán) trả lời câu
 * "tháng qua dữ liệu gì đã rời hệ, ai mang ra, đi đâu, bao nhiêu bản ghi".
 *
 * Gác sau `exportlog:read`, hiện chỉ `auditor` giữ (L2 cấp thêm cho `platform_admin`). KHÔNG
 * cấp cho vai vận hành — cùng tinh thần J3: người xuất không tự soát vết xuất của mình.
 */
@Controller('export-log')
export class ExportLogController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('exportlog:read')
  // Đường dẫn chứa 'export' nên khớp heuristic egress — nhưng đây là ĐỌC chính sổ vết
  // (metadata trong tenant), không phải đường mang dữ liệu nghiệp vụ ra ngoài.
  @ExportExempt('đọc chính sổ vết xuất — metadata, không phải đường dữ liệu ra')
  async list(
    @CurrentUser() user: RequestUser,
    @Query('asset') asset?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number.parseInt(limit ?? '', 10);
    const take = Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 100;
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where = asset ? { assetCode: asset.slice(0, 120) } : {};
      const rows = await tx.exportLog.findMany({ where, orderBy: { id: 'desc' }, take });
      // [Trục C L6 — lỗ nhỏ lộ ra khi soát] `total` TRƯỚC ĐÂY là `rows.length`, tức bị TRẦN
      // TRANG cắt: sổ có 500 lần xuất thì nó vẫn báo 200 và đứng yên mãi mãi. Một trường tên
      // `total` mà không phải tổng là kiểu sai lệch không ai kiểm chứng lại — người đọc tin
      // luôn. Driver sống đã đo nhầm đúng vì nó (lần thứ hai trong trục, sau danh sách cờ rủi
      // ro ở L4). Nay trả số đếm THẬT, kèm `returned` để phân biệt rõ hai con số.
      const total = await tx.exportLog.count({ where });
      return {
        entries: rows.map((r) => ({
          // id là BIGSERIAL — trả string, JSON không mang BigInt an toàn.
          id: String(r.id),
          at: r.at,
          actorUserId: r.actorUserId,
          onBehalfOfUserId: r.onBehalfOfUserId,
          assetCode: r.assetCode,
          classification: r.classification,
          destination: r.destination,
          destinationKind: r.destinationKind,
          recordCount: r.recordCount,
          route: r.route,
          rule: r.rule,
          policyExceptionId: r.policyExceptionId,
        })),
        total,
        returned: rows.length,
      };
    });
  }
}
