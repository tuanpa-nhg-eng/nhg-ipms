import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục B L1] "Quyền của tôi" + tuỳ chọn cá nhân + thông báo — mọi role, luôn CHÍNH MÌNH.
 * Không endpoint nào ở đây nhận `?userId=` — đó là việc của `/admin/users/:id/effective-access`
 * (có gác riêng theo scope người GỌI, không phải người XEM).
 */
const PREF_WHITELIST: Record<string, (v: unknown) => boolean> = {
  locale: (v) => v === 'vi' || v === 'en',
  theme: (v) => v === 'light' || v === 'dark' || v === 'system',
  density: (v) => v === 'compact' || v === 'comfortable',
};

// [Trục B L1] Ma trận sự kiện × kênh mặc định — KHÔNG có row trong notification_setting
// nghĩa là BẬT (mặc định an toàn cho người mới, không cần seed sẵn toàn ma trận).
const EVENT_KEYS = ['review.finalized', 'checkin.due', 'task.feedback', 'authoring.grant'] as const;
const CHANNELS = ['in_app', 'email'] as const;

@Injectable()
export class MeService {
  constructor(private prisma: PrismaService) {}

  async access(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const roles = await tx.userRole.findMany({
        where: { appUserId: user.claims.sub, deletedAt: null, role: { deletedAt: null } },
        include: { role: { include: { rolePermissions: { include: { permission: { select: { code: true } } } } } } },
        orderBy: { createdAt: 'asc' },
      });
      const granterIds = [...new Set(roles.map((r) => r.createdBy).filter(Boolean))] as string[];
      const granters = granterIds.length
        ? await tx.appUser.findMany({ where: { id: { in: granterIds } }, select: { id: true, email: true } })
        : [];
      const granterEmail = new Map(granters.map((g) => [g.id, g.email]));

      // [J13 — chốt bổ sung 28/07, chuẩn bị sẵn cho L4 impersonation] Ai đã đóng vai tôi.
      // Bảng impersonation_session CHƯA tồn tại (dựng ở L4) — trả mảng rỗng có chủ đích,
      // không phải quên: khi L4 thêm bảng, chỉ cần đổi truy vấn ở đây, contract giữ nguyên.
      const impersonatedBy: Array<{ actorEmail: string; startedAt: Date; reason: string }> = [];

      return {
        permissions: [...new Set(roles.flatMap((r) => r.role.rolePermissions.map((rp) => rp.permission.code)))].sort(),
        roles: roles.map((r) => ({
          roleCode: r.role.code,
          scopeType: r.scopeType,
          scopeId: r.scopeId,
          grantedAt: r.createdAt,
          grantedBy: r.createdBy ? { id: r.createdBy, email: granterEmail.get(r.createdBy) ?? null } : null,
        })),
        impersonatedBy,
      };
    });
  }

  async getSettings(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const appUser = await tx.appUser.findFirst({ where: { id: user.claims.sub } });
      return (appUser?.preferences ?? {}) as Record<string, unknown>;
    });
  }

  updateSettings(user: RequestUser, patch: Record<string, unknown>) {
    for (const [key, value] of Object.entries(patch)) {
      const validator = PREF_WHITELIST[key];
      if (!validator) {
        throw new UnprocessableEntityException(
          `Key '${key}' không nằm trong whitelist: ${Object.keys(PREF_WHITELIST).join(', ')}`,
        );
      }
      if (!validator(value)) throw new UnprocessableEntityException(`Key '${key}': giá trị không hợp lệ`);
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const appUser = await tx.appUser.findFirst({ where: { id: user.claims.sub } });
      const before = (appUser?.preferences ?? {}) as Record<string, unknown>;
      const merged = { ...before, ...patch };
      const updated = await tx.appUser.update({
        where: { id: user.claims.sub },
        data: { preferences: merged as any, version: { increment: 1 } },
      });
      return updated.preferences as Record<string, unknown>;
    });
  }

  private buildMatrix(rows: Array<{ eventKey: string; channel: string; enabled: boolean }>) {
    const byKey = new Map(rows.map((r) => [`${r.eventKey}::${r.channel}`, r.enabled]));
    const matrix: Array<{ eventKey: string; channel: string; enabled: boolean }> = [];
    for (const eventKey of EVENT_KEYS) {
      for (const channel of CHANNELS) {
        matrix.push({ eventKey, channel, enabled: byKey.get(`${eventKey}::${channel}`) ?? true });
      }
    }
    return matrix;
  }

  async getNotifications(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.notificationSetting.findMany({ where: { appUserId: user.claims.sub } });
      return this.buildMatrix(rows);
    });
  }

  updateNotifications(user: RequestUser, items: Array<{ eventKey: string; channel: string; enabled: boolean }>) {
    for (const it of items) {
      if (!(EVENT_KEYS as readonly string[]).includes(it.eventKey)) {
        throw new UnprocessableEntityException(`eventKey '${it.eventKey}' không hợp lệ`);
      }
      if (!(CHANNELS as readonly string[]).includes(it.channel)) {
        throw new UnprocessableEntityException(`channel '${it.channel}' không hợp lệ`);
      }
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      for (const it of items) {
        await tx.notificationSetting.upsert({
          where: {
            appUserId_eventKey_channel: {
              appUserId: user.claims.sub, eventKey: it.eventKey, channel: it.channel,
            },
          },
          update: { enabled: it.enabled },
          create: {
            tenantId: user.tenantId, appUserId: user.claims.sub,
            eventKey: it.eventKey, channel: it.channel, enabled: it.enabled,
          },
        });
      }
      // [Trục B L1] Đọc lại TRONG CÙNG tx — nếu gọi getNotifications() (mở tx MỚI) ở đây,
      // tx mới sẽ không thấy các upsert vừa làm khi tx ngoài CHƯA commit (read-committed
      // giữa hai transaction riêng biệt) ⇒ trả về dữ liệu cũ ngay sau khi vừa ghi.
      const rows = await tx.notificationSetting.findMany({ where: { appUserId: user.claims.sub } });
      return this.buildMatrix(rows);
    });
  }
}
