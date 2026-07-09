import {
  Body, Controller, Get, NotFoundException, Put, Query, UnprocessableEntityException,
} from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsUUID, isUUID } from 'class-validator';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';

class PutLayoutDto {
  @IsUUID() refId!: string;
  @IsObject() nodes!: Record<string, { x: number; y: number }>;
  // [F73] GET trả edges là MẢNG — DTO phải nhận đúng shape đó (round-trip GET→PUT)
  @IsOptional() @IsArray() edges?: unknown[];
}

/** Cap bố cục — mỗi node ~50 bytes, 64KB đủ cho >1000 node (chuẩn F64: đo bytes). */
const LAYOUT_MAX_BYTES = 65_536;

/**
 * Canvas layout (Spec §4.3/§13) — vị trí node kéo–thả của Org/Process Designer.
 * Chỉ là BỐ CỤC HIỂN THỊ, không phải dữ liệu nghiệp vụ ⇒ không đi qua config_change/publish.
 * PUT tách theo kind để permission fail-closed: org → org:design · process → process:design.
 */
@Controller('canvas-layout')
export class CanvasController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermission('config:read')
  async get(
    @CurrentUser() user: RequestUser,
    @Query('kind') kind: string,
    @Query('refId') refId: string,
  ) {
    // [F74] validate UUID tại cửa — refId rác không được rơi xuống Prisma thành 500
    if (!['org', 'process'].includes(kind) || !isUUID(refId)) {
      throw new UnprocessableEntityException('kind (org|process) và refId (uuid) bắt buộc');
    }
    const found = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.canvasLayout.findFirst({ where: { kind, refId } }),
    );
    return found ?? { kind, refId, nodes: {}, edges: [] };
  }

  @Put('org')
  @RequirePermission('org:design')
  @Audited('canvas_layout.put_org')
  putOrg(@CurrentUser() user: RequestUser, @Body() dto: PutLayoutDto) {
    // bố cục org chart là singleton per tenant — ref phải là chính tenant
    if (dto.refId !== user.tenantId) {
      throw new UnprocessableEntityException('refId của layout org phải là tenant id hiện tại');
    }
    return this.upsert(user, 'org', dto);
  }

  @Put('process')
  @RequirePermission('process:design')
  @Audited('canvas_layout.put_process')
  async putProcess(@CurrentUser() user: RequestUser, @Body() dto: PutLayoutDto) {
    const proc = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.process.findFirst({ where: { id: dto.refId, deletedAt: null } }),
    );
    if (!proc) throw new NotFoundException('Process không tồn tại');
    return this.upsert(user, 'process', dto);
  }

  /** [F77] validate + chuẩn hoá: chỉ giữ đúng {x,y} (strip key thừa — defense-in-depth). */
  private normalize(dto: PutLayoutDto): Record<string, { x: number; y: number }> {
    const nodes: Record<string, { x: number; y: number }> = {};
    for (const [key, pos] of Object.entries(dto.nodes)) {
      if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number'
        || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        throw new UnprocessableEntityException(`Node '${key}': cần {x, y} là số hữu hạn`);
      }
      nodes[key] = { x: pos.x, y: pos.y };
    }
    const bytes = Buffer.byteLength(JSON.stringify({ nodes, edges: dto.edges ?? [] }), 'utf8');
    if (bytes > LAYOUT_MAX_BYTES) {
      throw new UnprocessableEntityException(`Layout tối đa ${LAYOUT_MAX_BYTES} bytes (hiện ${bytes})`);
    }
    return nodes;
  }

  private upsert(user: RequestUser, kind: 'org' | 'process', dto: PutLayoutDto) {
    const nodes = this.normalize(dto);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const data = {
        nodes: nodes as object, edges: (dto.edges ?? []) as object,
        updatedBy: user.claims.sub,
      };
      const existing = await tx.canvasLayout.findFirst({ where: { kind, refId: dto.refId } });
      if (existing) {
        return tx.canvasLayout.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        });
      }
      try {
        return await tx.canvasLayout.create({
          data: { ...data, id: uuidv7(), tenantId: user.tenantId, kind, refId: dto.refId },
        });
      } catch (e) {
        // [F75] 2 PUT đầu tiên song song: thua unique (tenant,kind,ref) → chuyển sang update
        if ((e as { code?: string }).code !== 'P2002') throw e;
        const row = await tx.canvasLayout.findFirst({ where: { kind, refId: dto.refId } });
        return tx.canvasLayout.update({
          where: { id: row!.id },
          data: { ...data, version: { increment: 1 } },
        });
      }
    });
  }
}
