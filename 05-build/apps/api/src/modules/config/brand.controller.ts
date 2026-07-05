import { Body, Controller, Get, Put, Query, UnprocessableEntityException } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { uuidv7 } from '@ipms/db';
import { Audited, CurrentUser, Public, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma.service';
import { ConfigService } from './config.service';

class PutBrandKitDto {
  @IsUUID() configVersionId!: string;
  @IsOptional() @IsString() @Length(1, 255) displayName?: string;
  @IsOptional() @IsString() logoLightUri?: string;
  @IsOptional() @IsString() logoDarkUri?: string;
  @IsOptional() @IsString() faviconUri?: string;
  @IsOptional() @IsObject() tokens?: Record<string, unknown>;
  @IsOptional() @IsBoolean() a11yChecked?: boolean;
}

/** ① Brand Kit — white-label runtime theming (tokens override, KHÔNG build lại app). */
@Controller('brand-kit')
export class BrandController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  /** Upsert brand kit của một config version draft. */
  @Put()
  @RequirePermission('brand:write')
  @Audited('brand_kit.put')
  async put(@CurrentUser() user: RequestUser, @Body() dto: PutBrandKitDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.config.mustGetDraft(tx, dto.configVersionId);
      const existing = await tx.brandKit.findFirst({
        where: { configVersionId: dto.configVersionId, deletedAt: null },
      });
      const data = {
        displayName: dto.displayName,
        logoLightUri: dto.logoLightUri,
        logoDarkUri: dto.logoDarkUri,
        faviconUri: dto.faviconUri,
        tokens: (dto.tokens ?? {}) as any,
        a11yChecked: dto.a11yChecked ?? false,
        updatedBy: user.claims.sub,
      };
      let result;
      if (existing) {
        result = await tx.brandKit.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        });
        await this.config.recordChange(tx, user, dto.configVersionId, 'brand', existing.id, 'update',
          { tokens: existing.tokens, displayName: existing.displayName }, data);
      } else {
        result = await tx.brandKit.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, configVersionId: dto.configVersionId,
            ...data, status: 'draft', createdBy: user.claims.sub,
          },
        });
        await this.config.recordChange(tx, user, dto.configVersionId, 'brand', result.id, 'create', null, data);
      }
      return result;
    });
  }

  /**
   * Runtime theming resolver — trả tokens của version PUBLISHED (fallback NHG DS = {}).
   * Public theo thiết kế FE §13 (theming cần trước khi đăng nhập) — chỉ lộ tokens/logo,
   * yêu cầu tenant code tường minh.
   */
  @Public()
  @Get('resolve')
  async resolve(@Query('tenant') tenantCode?: string) {
    if (!tenantCode) throw new UnprocessableEntityException('Thiếu ?tenant=<code>');
    // Trước đăng nhập chưa có tenant context → tra id qua SECURITY DEFINER function
    // (chỉ trả id theo code chính xác — không lộ dữ liệu khác).
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string | null }>>`
      SELECT resolve_tenant_id(${tenantCode}) AS id`;
    const tid = rows[0]?.id;
    if (!tid) return { tokens: {}, source: 'default' };
    return this.prisma.withTenant(tid, async (tx) => {
      const published = await tx.configVersion.findFirst({
        where: { status: 'published', deletedAt: null },
        orderBy: { publishedAt: 'desc' },
      });
      if (!published) return { tokens: {}, source: 'default' };
      const brand = await tx.brandKit.findFirst({
        where: { configVersionId: published.id, deletedAt: null },
      });
      if (!brand) return { tokens: {}, source: 'default' };
      return {
        tokens: brand.tokens,
        displayName: brand.displayName,
        logoLightUri: brand.logoLightUri,
        logoDarkUri: brand.logoDarkUri,
        source: published.label,
      };
    });
  }
}
