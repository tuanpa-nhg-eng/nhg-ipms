import { Injectable } from '@nestjs/common';
import { Prisma } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';

export interface AuditQuery {
  action?: string;      // khớp tiền tố: 'review.' lấy cả review.create/review.self/...
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  from?: string;        // ISO
  to?: string;          // ISO
  limit?: number;
  cursor?: string;      // id (BigInt dạng chuỗi) của trang trước — phân trang keyset
}

const LIST_CAP = 200;

/**
 * [Trục A — L1] Đọc audit_log.
 *
 * Vì sao tới giờ mới có: permission `audit:read` nằm trong catalog từ Phase 0 và role
 * `auditor` vẫn được cấp, nhưng KHÔNG endpoint nào dùng ⇒ quyền treo, màn /audit/logs
 * không có nguồn. Đây là chỗ hở về năng lực (không phải về bảo mật) tồn tại lâu nhất.
 *
 * [I6 — SoD, đừng "sửa" thành tiện lợi] `tenant_admin` CỐ Ý không có `audit:read`
 * (seed.ts: PERMISSIONS.filter(p => p !== 'audit:read')). Người quản trị hệ thống
 * không được tự đọc vết của chính mình. admin@ gọi endpoint này PHẢI nhận 403.
 *
 * [I5 + F5] KHÔNG trả `before`/`after`. Hai cột này chứa payload nghiệp vụ thô — F5 đã
 * ghi nhận có PII trong `after` từ Phase 0 và tới nay chưa có allowlist field. Trả ra
 * đây là biến màn kiểm toán thành cửa đọc dữ liệu nhân sự vòng qua mọi scope guard.
 * Thay bằng cờ `hasPayload` để kiểm toán viên biết CÓ dữ liệu mà xin trích xuất theo
 * quy trình riêng. Muốn mở phải làm allowlist per-action trước — ghi backlog, không
 * làm ở lát này.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  list(user: RequestUser, q: AuditQuery = {}) {
    const take = Math.min(Math.max(q.limit ?? 100, 1), LIST_CAP);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: Record<string, unknown> = {};
      // RLS đã khoá theo tenant; các filter dưới đây chỉ để thu hẹp, không phải để gác.
      if (q.action) where.action = { startsWith: q.action };
      if (q.entityType) where.entityType = q.entityType;
      if (q.entityId) where.entityId = q.entityId;
      if (q.actorUserId) where.actorUserId = q.actorUserId;
      if (q.from || q.to) {
        where.at = {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lte: new Date(q.to) } : {}),
        };
      }
      if (q.cursor) {
        let cur: bigint;
        try {
          cur = BigInt(q.cursor);
        } catch {
          cur = BigInt(0);
        }
        if (cur > BigInt(0)) where.id = { lt: cur };
      }

      const rows = await tx.auditLog.findMany({
        where,
        select: {
          id: true, action: true, entityType: true, entityId: true,
          actorUserId: true, ip: true, at: true,
          // KHÔNG select before/after — xem ghi chú đầu file.
        },
        orderBy: { id: 'desc' },
        take: take + 1,
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;

      // Người thực hiện: gộp 1 query. Chỉ email + tên — đủ để kiểm toán truy vết,
      // không kéo theo hồ sơ nhân sự.
      const actorIds = [...new Set(page.map((r) => r.actorUserId).filter(Boolean))] as string[];
      const actors = actorIds.length
        ? await tx.appUser.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, personId: true },
          })
        : [];
      const personIds = [...new Set(actors.map((a) => a.personId).filter(Boolean))] as string[];
      const persons = personIds.length
        ? await tx.person.findMany({
            where: { id: { in: personIds } },
            select: { id: true, fullName: true },
          })
        : [];
      const personById = new Map(persons.map((p) => [p.id, p.fullName]));
      const actorById = new Map(
        actors.map((a) => [a.id, {
          email: a.email,
          fullName: a.personId ? personById.get(a.personId) ?? null : null,
        }]),
      );

      // Có payload hay không: đếm bằng query riêng trên chính tập id đang trả (không
      // đọc nội dung). Rẻ hơn nhiều so với kéo jsonb về rồi vứt đi.
      const idsWithPayload = page.length
        ? await tx.auditLog.findMany({
            where: {
              id: { in: page.map((r) => r.id) },
              // Prisma phân biệt DbNull (NULL trong cột jsonb) với JsonNull (giá trị
              // JSON `null`) — dùng `null` trần ở đây không compile.
              OR: [{ before: { not: Prisma.DbNull } }, { after: { not: Prisma.DbNull } }],
            },
            select: { id: true },
          })
        : [];
      const payloadIds = new Set(idsWithPayload.map((r) => r.id.toString()));

      return {
        // BigInt không JSON.stringify được — luôn trả chuỗi (và cursor cũng nhận chuỗi).
        nextCursor: hasMore && page.length ? page[page.length - 1].id.toString() : null,
        total: page.length,
        entries: page.map((r) => ({
          id: r.id.toString(),
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          at: r.at,
          ip: r.ip,
          actor: r.actorUserId
            ? { id: r.actorUserId, ...(actorById.get(r.actorUserId) ?? { email: null, fullName: null }) }
            : null,
          hasPayload: payloadIds.has(r.id.toString()),
        })),
      };
    });
  }

  /** Thống kê theo hành động — feed cho màn tuân thủ (không đọc payload). */
  stats(user: RequestUser, q: { from?: string; to?: string } = {}) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: Record<string, unknown> = {};
      if (q.from || q.to) {
        where.at = {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lte: new Date(q.to) } : {}),
        };
      }
      const byAction = await tx.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 50,
      });
      return {
        actions: byAction.map((a) => ({ action: a.action, count: a._count._all })),
      };
    });
  }
}
