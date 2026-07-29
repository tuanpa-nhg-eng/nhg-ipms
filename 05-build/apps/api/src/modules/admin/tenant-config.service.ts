import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục B L1] Cấu hình đơn vị — dùng `tenant.settings` jsonb ĐÃ CÓ SẴN (rẻ hơn bảng mới),
 * nhưng WHITELIST KEY tại cửa (§6 giả định 4) — jsonb tự do là đường để cấu hình biến thành
 * bãi rác không ai biết ai đọc. Key ngoài whitelist → 422, không "nhét gì cũng được".
 */
// [F185 — Reviewer đối kháng, MAJOR] Bản đầu dùng object LITERAL + `KEY_WHITELIST[key]`.
// Bracket-access trên object literal đọc được CẢ thuộc tính KẾ THỪA từ Object.prototype:
// key='constructor' → trả về hàm `Object` (truthy, GỌI ĐƯỢC — qua cả hai lớp kiểm, key lọt
// thẳng vào tenant.settings dù không nằm trong whitelist); key='__proto__' → trả về CHÍNH
// Object.prototype (truthy nhưng KHÔNG gọi được) → `validator(value)` ném TypeError chưa bắt
// → 500 thay vì 422. Map không có bề mặt này: `.get('constructor')` trả `undefined` trừ khi
// tự tay `.set('constructor', ...)`, không có chuỗi kế thừa nào để đọc nhầm.
const KEY_WHITELIST = new Map<string, (v: unknown) => boolean>([
  ['defaultLocale', (v) => v === 'vi' || v === 'en'],
  ['checkinCadence', (v) => ['weekly', 'monthly', 'quarterly', 'yearly'].includes(v as string)],
  ['reminderThresholdDays', (v) => typeof v === 'number' && v >= 0 && v <= 90],
  ['notifyOnCheckinDue', (v) => typeof v === 'boolean'],
  ['notifyOnReviewFinalized', (v) => typeof v === 'boolean'],
]);

export type TenantConfigPatch = Record<string, unknown>;

@Injectable()
export class TenantConfigService {
  constructor(private prisma: PrismaService) {}

  get(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const tenant = await tx.tenant.findFirst({ where: { id: user.tenantId } });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const key of KEY_WHITELIST.keys()) if (key in settings) filtered[key] = settings[key];
      // [F189 — Reviewer đối kháng] `version` PHẢI có trong GET — PATCH đòi optimistic lock,
      // thiếu trường này FE không patch được gì ngoài round-trip riêng lấy version trước.
      return { ...filtered, version: tenant?.version ?? 1 };
    });
  }

  update(user: RequestUser, patch: TenantConfigPatch, version: number) {
    // [F185] `@IsObject()` không còn chạy qua ValidationPipe (bỏ DTO class — xem controller);
    // tự kiểm ở đây trước khi Object.entries.
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new UnprocessableEntityException('patch phải là object');
    }
    const entries = Object.entries(patch);
    for (const [key, value] of entries) {
      const validator = KEY_WHITELIST.get(key);
      if (!validator) {
        throw new UnprocessableEntityException(
          `Key '${key}' không nằm trong whitelist: ${[...KEY_WHITELIST.keys()].join(', ')}`,
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
      // [F189 — Reviewer đối kháng, MINOR] Trước đây update() KHÔNG đòi version — hai tab admin
      // cùng sửa cấu hình tenant (vd một tab đổi checkinCadence, tab kia đổi defaultLocale)
      // ghi đè lặng lẽ lên nhau. Cùng khuôn J7: updateMany điều kiện version + đếm dòng đổi.
      const count = await tx.tenant.updateMany({
        where: { id: user.tenantId, version },
        data: { settings: merged as any, updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Version lệch — tải lại và thử lại');
      const updated = await tx.tenant.findFirstOrThrow({ where: { id: user.tenantId } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'admin.tenant_config_update', entityType: 'tenant', entityId: user.tenantId,
          before: before as object, after: patch as object,
        },
      });
      const settings = (updated.settings ?? {}) as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const key of KEY_WHITELIST.keys()) if (key in settings) filtered[key] = settings[key];
      return { ...filtered, version: updated.version };
    });
  }
}
