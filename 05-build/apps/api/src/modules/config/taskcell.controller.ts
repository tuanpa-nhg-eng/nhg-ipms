import { Controller, Get, Param, Query, UnprocessableEntityException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma.service';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';

/**
 * Task Cell read API (Spec §11) — Từ điển Tác vụ version-scoped.
 * Lát 4d chỉ cần GET (Process Designer hiển thị cell sinh ra); POST/curation
 * thuộc BU Authoring Gate (spec riêng, lát sau).
 */
@Controller('task-cells')
export class TaskCellController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('taskcell:read')
  list(
    @CurrentUser() user: RequestUser,
    @Query('configVersionId') configVersionId?: string,
    @Query('processStepId') processStepId?: string,
  ) {
    // [F74] filter bắt buộc + phải là UUID — giá trị rác không rơi xuống Prisma thành 500
    if ((!configVersionId && !processStepId)
      || (configVersionId && !isUUID(configVersionId))
      || (processStepId && !isUUID(processStepId))) {
      throw new UnprocessableEntityException('Cần configVersionId hoặc processStepId (uuid)');
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.taskCell.findMany({
        where: {
          deletedAt: null,
          ...(configVersionId ? { configVersionId } : {}),
          ...(processStepId ? { processStepId } : {}),
        },
        orderBy: { code: 'asc' },
      }),
    );
  }

  @Get(':code')
  @RequirePermission('taskcell:read')
  async byCode(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Query('configVersionId') configVersionId?: string,
  ) {
    if (!configVersionId || !isUUID(configVersionId)) {
      throw new UnprocessableEntityException('Cần configVersionId (uuid — cell version-scoped)');
    }
    const cell = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.taskCell.findFirst({ where: { code, configVersionId, deletedAt: null } }),
    );
    if (!cell) throw new UnprocessableEntityException(`Task cell '${code}' không tồn tại trong version này`);
    return cell;
  }
}
