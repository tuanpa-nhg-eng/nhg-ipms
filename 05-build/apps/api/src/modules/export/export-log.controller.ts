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
      const rows = await tx.exportLog.findMany({
        where: asset ? { assetCode: asset.slice(0, 120) } : {},
        orderBy: { id: 'desc' },
        take,
      });
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
        total: rows.length,
      };
    });
  }
}
