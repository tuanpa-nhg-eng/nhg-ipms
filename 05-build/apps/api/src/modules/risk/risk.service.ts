import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  INCIDENT_ROOT_CAUSE_MIN_LEN, RISK_KINDS, RISK_RULES_BY_AUDIT_ACTION,
  RISK_RULE_AI_EGRESS_BLOCKED, incidentStatusRank,
} from '@ipms/shared';
import { uuidv7, type TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { LIST_PAGE_CAP, pagedList } from '../../common/list-page';
import type { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục C L4] CỜ RỦI RO (K8 — sinh tự động) + LUỒNG SỰ CỐ.
 *
 * Cách sinh cờ: SUY RA từ sự kiện đã ghi (`audit_log`, `ai_interaction`), không có màn nhập
 * tay. Bộ sinh idempotent theo `(tenant, source_type, source_ref)` nên chạy lại bao nhiêu lần
 * cũng ra cùng một tập.
 *
 * Vì sao chạy bộ sinh NGAY TRONG ĐƯỜNG ĐỌC thay vì để một cron: cổng ra của lát này là "tạo
 * một vi phạm SoD thật → cờ xuất hiện trên cả bốn đường, KHÔNG cần ai nhập tay". Một cron
 * 5 phút vẫn thoả câu chữ, nhưng nó tạo ra một khoảng thời gian dashboard nói sai sự thật, và
 * độ dài khoảng đó phụ thuộc cron còn sống hay không — đúng loại phụ thuộc mà L3 vừa loại bỏ
 * ở chỗ hết hạn ngoại lệ. Đọc là thấy, không có độ trễ nào để giải thích.
 *
 * Đánh đổi đã cân: đường ĐỌC có ghi (materialize). Chấp nhận được vì ba lẽ — nó chỉ vật hoá
 * những sự kiện ĐÃ ghi ở nơi khác (không sinh sự thật mới), nó idempotent, và cửa sổ quét có
 * chặn trên nên chi phí không tăng theo tuổi hệ thống.
 */
const SCAN_WINDOW_DAYS = 90;
const SCAN_CAP = 5_000;

/**
 * [F196 — Reviewer 05/08] Những sự kiện GOM THEO ĐỐI TƯỢNG, không theo từng lượt.
 *
 * `policy.exception_used` được ghi vào `audit_log` MỖI REQUEST đi qua bằng quyền tạm — đó là
 * đúng cho sổ vết (B0 phải dựng lại được từng lượt truy cập). Nhưng vật hoá một-đối-một sang
 * cờ rủi ro thì một ngoại lệ đọc dùng trong 72 giờ đẻ ra hàng trăm cờ: 300 lượt xem/ngày là
 * 300 cờ `low`, và màn "Cờ rủi ro & Sự cố" của B5 chỉ còn là danh sách cuộn vô tận. Đúng thứ
 * L4 muốn tránh khi ghi "cờ phải ĐỌC ĐƯỢC, không phải đếm được".
 *
 * Với nhóm này, khoá chống trùng chuyển từ `audit_log.id` sang **id của đối tượng** (ở đây là
 * đơn ngoại lệ) ⇒ UNIQUE `(tenant, source_type, source_ref)` tự gom về MỘT cờ cho mỗi đơn.
 * Số lần dùng không nằm trên cờ (cờ bất biến theo K8) mà đọc từ `policy_exception.used_count`,
 * nơi nó luôn là con số hiện tại chứ không phải ảnh chụp lúc sinh cờ.
 */
const AGGREGATED_BY_ENTITY: Readonly<Record<string, string>> = {
  'policy.exception_used': 'policy_exception',
};

@Injectable()
export class RiskService {
  constructor(private prisma: PrismaService) {}

  /**
   * Vật hoá cờ từ sự kiện. Trả về số cờ MỚI (0 nghĩa là không có gì xảy ra thêm — một con số
   * đáng tin, không phải "job chưa chạy").
   */
  async generate(tenantId: string): Promise<{ created: number; scanned: number }> {
    const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 86_400_000);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rows: Array<{
        id: string; tenantId: string; kind: string; severity: string;
        sourceType: string; sourceRef: string; actorUserId: string | null;
        summary: string; detail: object; occurredAt: Date;
      }> = [];

      const audits = await tx.auditLog.findMany({
        where: { action: { in: Object.keys(RISK_RULES_BY_AUDIT_ACTION) }, at: { gte: since } },
        orderBy: { at: 'desc' },
        take: SCAN_CAP,
        select: { id: true, action: true, actorUserId: true, entityType: true, entityId: true, after: true, at: true },
      });
      for (const a of audits) {
        const rule = RISK_RULES_BY_AUDIT_ACTION[a.action];
        if (!rule) continue;
        const after = (a.after ?? {}) as Record<string, unknown>;
        // [F196] Nhóm gom: khoá là đối tượng, không phải dòng vết. Vết không gắn được với đối
        // tượng nào (entity_id NULL) thì BỎ QUA thay vì rơi về khoá theo dòng — rơi về sẽ làm
        // phép gom im lặng mất tác dụng đúng lúc dữ liệu bất thường.
        const aggregateAs = AGGREGATED_BY_ENTITY[a.action];
        if (aggregateAs && !a.entityId) continue;
        rows.push({
          id: uuidv7(), tenantId, kind: rule.kind, severity: rule.severity,
          sourceType: aggregateAs ?? 'audit_log',
          sourceRef: aggregateAs ? String(a.entityId) : String(a.id),
          actorUserId: a.actorUserId,
          // Tóm tắt lấy TỪ vết gốc (`rule`/`reason` do chính chỗ chặn ghi ra) — không diễn
          // giải lại ở đây: hai câu chữ khác nhau cho cùng một sự kiện là cách nhanh nhất
          // làm người đọc dashboard mất tin vào cả hai.
          summary: String(after['rule'] ?? after['reason'] ?? rule.label),
          detail: { action: a.action, entity_type: a.entityType, entity_id: a.entityId, ...after },
          occurredAt: a.at,
        });
      }

      const blocked = await tx.aiInteraction.findMany({
        where: { status: 'blocked', at: { gte: since } },
        orderBy: { at: 'desc' },
        take: SCAN_CAP,
        select: { id: true, agent: true, model: true, at: true, toolName: true },
      });
      for (const b of blocked) {
        rows.push({
          id: uuidv7(), tenantId,
          kind: RISK_RULE_AI_EGRESS_BLOCKED.kind, severity: RISK_RULE_AI_EGRESS_BLOCKED.severity,
          // `ai_interaction.id` là BIGINT (khác `audit_log.id` cũng BIGINT nhưng khác bảng) —
          // `source_ref` cố ý là TEXT để một khoá chống trùng duy nhất phục vụ được mọi nguồn,
          // kể cả nguồn tương lai có khoá không phải số.
          sourceType: 'ai_interaction', sourceRef: String(b.id),
          actorUserId: null,
          summary: `${RISK_RULE_AI_EGRESS_BLOCKED.label}: ${b.agent}`,
          detail: { agent: b.agent, model: b.model, tool_name: b.toolName },
          occurredAt: b.at,
        });
      }

      if (rows.length === 0) return { created: 0, scanned: 0 };

      // [F196] Gom TRONG BỘ NHỚ trước khi ghi. `skipDuplicates` (ON CONFLICT DO NOTHING) đã
      // chặn trùng so với dòng ĐÃ có trong bảng, nhưng ở đây một lượt quét thường chứa hàng
      // trăm dòng vết cùng trỏ về MỘT đơn ngoại lệ — gom trước thì `scanned` báo đúng số cờ
      // thực sự đề nghị ghi, thay vì số dòng vết đã đọc.
      //
      // Vết đọc theo thứ tự MỚI→CŨ, nên ghi đè liên tục sẽ để lại bản CŨ NHẤT: thời điểm đáng
      // ghi của một cờ gom là LẦN ĐẦU chạm, không phải lần gần nhất.
      const byKey = new Map<string, (typeof rows)[number]>();
      for (const r of rows) byKey.set(`${r.sourceType}|${r.sourceRef}`, r);
      const deduped = [...byKey.values()];

      // Chống trùng thật sự vẫn là RÀNG BUỘC ở DB (UNIQUE tenant, source_type, source_ref) —
      // phép gom trên chỉ để tiết kiệm, hai lượt chạy song song vẫn đúng nhờ ràng buộc.
      const res = await tx.riskFlag.createMany({ data: deduped as any, skipDuplicates: true });
      return { created: res.count, scanned: deduped.length };
    });
  }

  /** Danh sách CHI TIẾT — `risk:read`, trong phạm vi đơn vị (B5 tuân thủ, B0 kiểm toán). */
  async list(user: RequestUser, q: { kind?: string; severity?: string; linked?: string; limit?: number }) {
    await this.generate(user.tenantId);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where = {
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.severity ? { severity: q.severity } : {}),
        ...(q.linked === 'true' ? { incidentId: { not: null } } : {}),
        ...(q.linked === 'false' ? { incidentId: null } : {}),
      };
      const rows = await tx.riskFlag.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: Math.min(q.limit ?? 100, 500),
      });
      // [F197] Số đếm THẬT trên cùng điều kiện lọc. Bản cũ trả `rows.length` — với trần 100 và
      // 744 cờ trong DB thì màn hình báo "100" vĩnh viễn. Đây chính là phép đo đã làm driver
      // sống báo đỏ nhầm ở L4; lần đó sửa driver, lần này sửa đúng chỗ sai.
      const total = await tx.riskFlag.count({ where });
      const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))] as string[];
      const users = actorIds.length
        ? await tx.appUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
        : [];
      const emailOf = new Map(users.map((u) => [u.id, u.email]));
      return pagedList(
        rows.map((r) => ({
          id: r.id, kind: r.kind, severity: r.severity,
          summary: r.summary, detail: r.detail,
          actor: r.actorUserId ? { id: r.actorUserId, email: emailOf.get(r.actorUserId) ?? null } : null,
          occurredAt: r.occurredAt, incidentId: r.incidentId,
          source: { type: r.sourceType, ref: r.sourceRef },
        })),
        total,
      );
    });
  }

  /**
   * Bản TỔNG HỢP một màn — `risk:read_summary`. Chỉ SỐ ĐẾM: không tên người, không mô tả, không
   * tài nguyên bị chạm. Đây là bề mặt cho V1 (điều hành) và cho tầng nền tảng, đúng ranh giới
   * K1 mà L2 đã đặt: "biết có chuyện gì đang xảy ra" khác "đọc được chuyện đó là gì".
   */
  async summary(user: RequestUser) {
    await this.generate(user.tenantId);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.riskFlag.groupBy({
        by: ['kind', 'severity'],
        _count: { _all: true },
      });
      const byKind: Record<string, number> = {};
      // Hiện ĐỦ mọi loại cờ hệ có thể sinh, kể cả đếm 0 — một nhóm biến mất khỏi màn hình đọc
      // ra "không có vấn đề gì" y hệt một nhóm bằng 0, nhưng chỉ một trong hai là sự thật.
      for (const k of RISK_KINDS) byKind[k] = 0;
      const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
      for (const r of rows) {
        byKind[r.kind] = (byKind[r.kind] ?? 0) + r._count._all;
        bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + r._count._all;
      }
      const openIncidents = await tx.incident.count({ where: { status: { not: 'closed' } } });
      const unlinked = await tx.riskFlag.count({ where: { incidentId: null } });
      return {
        total: Object.values(bySeverity).reduce((a, b) => a + b, 0),
        byKind, bySeverity, openIncidents, unlinkedFlags: unlinked,
      };
    });
  }

  // ═══════════ Sự cố ═══════════

  async openIncident(
    user: RequestUser,
    input: { title: string; severity: string; assigneeUserId?: string; note?: string; flagIds?: string[] },
    ip?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const id = uuidv7();
      await tx.incident.create({
        data: {
          id, tenantId: user.tenantId, title: input.title, severity: input.severity,
          status: 'open', assigneeUserId: input.assigneeUserId ?? null,
          openedBy: user.claims.sub, note: input.note ?? null,
        },
      });
      const linked = await this.linkFlags(tx, id, input.flagIds ?? []);
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'incident.opened', entityType: 'incident', entityId: id,
          after: { title: input.title, severity: input.severity, linked_flags: linked } as object, ip,
        },
      });
      return { id, status: 'open', linkedFlags: linked };
    });
  }

  /** Gắn cờ vào sự cố — thao tác GHI DUY NHẤT được phép trên một dòng cờ (K8, trigger DB). */
  private async linkFlags(tx: TenantTx, incidentId: string, flagIds: string[]): Promise<number> {
    if (flagIds.length === 0) return 0;
    const res = await tx.riskFlag.updateMany({
      where: { id: { in: flagIds }, incidentId: null },
      data: { incidentId },
    });
    return res.count;
  }

  async updateIncident(
    user: RequestUser,
    id: string,
    input: { status?: string; assigneeUserId?: string; note?: string; flagIds?: string[]; version: number },
    ip?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cur = await tx.incident.findFirst({ where: { id } });
      if (!cur) throw new NotFoundException('Sự cố không tồn tại');
      if (cur.status === 'closed') throw new ConflictException('Sự cố đã đóng — mở lại phải là một sự cố MỚI');
      if (input.status && incidentStatusRank(input.status) < incidentStatusRank(cur.status)) {
        throw new UnprocessableEntityException(
          `Trạng thái chỉ đi một chiều: '${cur.status}' → '${input.status}' không hợp lệ`,
        );
      }
      // Đóng KHÔNG đi qua đường này — nó cần nguyên nhân gốc, có endpoint riêng.
      if (input.status === 'closed') {
        throw new UnprocessableEntityException('Đóng sự cố phải qua POST /incidents/:id/close (bắt buộc ghi nguyên nhân)');
      }
      const upd = await tx.incident.updateMany({
        where: { id, version: input.version },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          version: { increment: 1 },
        },
      });
      if (upd.count !== 1) throw new ConflictException('Version lệch — tải lại rồi thử lại');
      const linked = await this.linkFlags(tx, id, input.flagIds ?? []);
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'incident.updated', entityType: 'incident', entityId: id,
          after: { status: input.status ?? cur.status, linked_flags: linked } as object, ip,
        },
      });
      return { id, status: input.status ?? cur.status, linkedFlags: linked };
    });
  }

  /** Đóng sự cố — nguyên nhân gốc BẮT BUỘC (CHECK constraint ở DB là lớp thứ hai). */
  async closeIncident(user: RequestUser, id: string, input: { rootCause: string; version: number }, ip?: string) {
    const rootCause = input.rootCause.trim();
    if (rootCause.length < INCIDENT_ROOT_CAUSE_MIN_LEN) {
      throw new UnprocessableEntityException(
        `Nguyên nhân gốc phải có ít nhất ${INCIDENT_ROOT_CAUSE_MIN_LEN} ký tự — "đã xong" không phải một nguyên nhân`,
      );
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cur = await tx.incident.findFirst({ where: { id } });
      if (!cur) throw new NotFoundException('Sự cố không tồn tại');
      if (cur.status === 'closed') throw new ConflictException('Sự cố đã đóng');
      const now = new Date();
      const upd = await tx.incident.updateMany({
        where: { id, version: input.version },
        data: {
          status: 'closed', rootCause, closedAt: now, closedBy: user.claims.sub,
          version: { increment: 1 },
        },
      });
      if (upd.count !== 1) throw new ConflictException('Version lệch — tải lại rồi thử lại');
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'incident.closed', entityType: 'incident', entityId: id,
          after: { root_cause: rootCause } as object, ip,
        },
      });
      return { id, status: 'closed', closedAt: now };
    });
  }

  async listIncidents(user: RequestUser, status?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where = { ...(status ? { status } : {}) };
      const rows = await tx.incident.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        take: LIST_PAGE_CAP,
      });
      const total = await tx.incident.count({ where }); // [F197]
      const ids = [...new Set(rows.flatMap((r) => [r.openedBy, r.assigneeUserId, r.closedBy].filter(Boolean)))] as string[];
      const users = ids.length
        ? await tx.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
        : [];
      const emailOf = new Map(users.map((u) => [u.id, u.email]));
      const counts = await tx.riskFlag.groupBy({
        by: ['incidentId'],
        where: { incidentId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      });
      const flagCount = new Map(counts.map((c) => [c.incidentId, c._count._all]));
      return pagedList(
        rows.map((r) => ({
          id: r.id, title: r.title, severity: r.severity, status: r.status,
          openedAt: r.openedAt, closedAt: r.closedAt, rootCause: r.rootCause, note: r.note,
          openedBy: { id: r.openedBy, email: emailOf.get(r.openedBy) ?? null },
          assignee: r.assigneeUserId
            ? { id: r.assigneeUserId, email: emailOf.get(r.assigneeUserId) ?? null } : null,
          closedBy: r.closedBy ? { id: r.closedBy, email: emailOf.get(r.closedBy) ?? null } : null,
          flagCount: flagCount.get(r.id) ?? 0,
          version: r.version,
        })),
        total,
      );
    });
  }
}
