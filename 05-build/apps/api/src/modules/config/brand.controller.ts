import { Body, Controller, Get, Put, Query, UnprocessableEntityException } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, isUUID, Length } from 'class-validator';
import { uuidv7 } from '@ipms/db';
import { Audited, CurrentUser, Public, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma.service';
import { ConfigService } from './config.service';

class PutBrandKitDto {
  @IsUUID() configVersionId!: string;
  // [F89] "" = xoá tên (map → null khi lưu); undefined = giữ nguyên
  @IsOptional() @IsString() @Length(0, 255) displayName?: string;
  @IsOptional() @IsString() logoLightUri?: string;
  @IsOptional() @IsString() logoDarkUri?: string;
  @IsOptional() @IsString() faviconUri?: string;
  @IsOptional() @IsObject() tokens?: Record<string, unknown>;
  @IsOptional() @IsBoolean() a11yChecked?: boolean;
}

/**
 * [F83] Validate tokens TẠI BE (không tin whitelist FE): resolver /brand-kit/resolve là
 * PUBLIC — token độc hại (vd `url(http://attacker/px)`) sau publish sẽ phát tán cho mọi
 * client của tenant (beacon/exfil qua CSS). Fail-closed: chỉ key whitelist + value là màu.
 */
const TOKEN_KEY_WHITELIST = new Set([
  '--nhg-primary', '--nhg-primary-hover', '--nhg-primary-subtle', '--nhg-primary-fg',
  '--nhg-accent', '--nhg-accent-fg',
]);
const COLOR_VALUE_RE =
  /^(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?|rgba?\([\d\s.,%]{1,40}\)|hsla?\([\d\s.,%deg]{1,40}\))$/;

function validateBrandTokens(tokens: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(tokens);
  if (entries.length > TOKEN_KEY_WHITELIST.size) {
    throw new UnprocessableEntityException(`Tối đa ${TOKEN_KEY_WHITELIST.size} token override`);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!TOKEN_KEY_WHITELIST.has(key)) {
      throw new UnprocessableEntityException(
        `Token '${key}' không nằm trong whitelist: ${[...TOKEN_KEY_WHITELIST].join(', ')}`,
      );
    }
    if (typeof value !== 'string' || !COLOR_VALUE_RE.test(value.trim())) {
      throw new UnprocessableEntityException(`Token '${key}': giá trị phải là màu (#hex / rgb() / hsl())`);
    }
    out[key] = value.trim();
  }
  return out;
}

/** ① Brand Kit — white-label runtime theming (tokens override, KHÔNG build lại app). */
@Controller('brand-kit')
export class BrandController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  /** [Lát 4e] Đọc brand kit của một version (editor FE cần giá trị hiện tại của draft). */
  @Get()
  @RequirePermission('config:read')
  async get(@CurrentUser() user: RequestUser, @Query('configVersionId') configVersionId?: string) {
    if (!configVersionId || !isUUID(configVersionId)) {
      throw new UnprocessableEntityException('Cần configVersionId (uuid)');
    }
    const found = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.brandKit.findFirst({ where: { configVersionId, deletedAt: null } }),
    );
    return found ?? { configVersionId, tokens: {}, displayName: null, status: 'empty' };
  }

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
        // [F89] "" tường minh = xoá tên; undefined = không đổi (Prisma bỏ qua)
        displayName: dto.displayName === '' ? null : dto.displayName,
        logoLightUri: dto.logoLightUri,
        logoDarkUri: dto.logoDarkUri,
        faviconUri: dto.faviconUri,
        // [F83] fail-closed tại BE — whitelist key + value màu (resolver là public)
        tokens: validateBrandTokens((dto.tokens ?? {}) as Record<string, unknown>) as any,
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
