import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục B L1] Cấu hình đơn vị — dùng `tenant.settings` jsonb ĐÃ CÓ SẴN (rẻ hơn bảng mới),
 * nhưng WHITELIST KEY tại cửa (§6 giả định 4) — jsonb tự do là đường để cấu hình biến thành
 * bãi rác không ai biết ai đọc. Key ngoài whitelist → 422, không "nhét gì cũng được".
 */
const KEY_WHITELIST: Record<string, (v: unknown) => boolean> = {
  defaultLocale: (v) => v === 'vi' || v === 'en',
  checkinCadence: (v) => ['weekly', 'monthly', 'quarterly', 'yearly'].includes(v as string),
  reminderThresholdDays: (v) => typeof v === 'number' && v >= 0 && v <= 90,
  notifyOnCheckinDue: (v) => typeof v === 'boolean',
  notifyOnReviewFinalized: (v) => typeof v === 'boolean',
};

export type TenantConfigPatch = Record<string, unknown>;

@Injectable()
export class TenantConfigService {
  constructor(private prisma: PrismaService) {}

  get(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: user.tenantId } });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const key of Object.keys(KEY_WHITELIST)) if (key in settings) filtered[key] = settings[key];
      return filtered;
    });
  }

  update(user: RequestUser, patch: TenantConfigPatch) {
    const entries = Object.entries(patch);
    for (const [key, value] of entries) {
      const validator = KEY_WHITELIST[key];
      if (!validator) {
        throw new UnprocessableEntityException(
          `Key '${key}' không nằm trong whitelist: ${Object.keys(KEY_WHITELIST).join(', ')}`,
        );
      }
      if (!validator(value)) {
        throw new UnprocessableEntityException(`Key '${key}': giá trị không hợp lệ`);
      }
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: user.tenantId } });
      const before = (tenant?.settings ?? {}) as Record<string, unknown>;
      const merged = { ...before, ...patch };
      const updated = await tx.tenant.update({
        where: { id: user.tenantId },
        data: { settings: merged as any, updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.tenant_config_update', entityType: 'tenant', entityId: user.tenantId,
          before: before as object, after: patch as object,
        },
      });
      const settings = (updated.settings ?? {}) as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const key of Object.keys(KEY_WHITELIST)) if (key in settings) filtered[key] = settings[key];
      return filtered;
    });
  }
}
