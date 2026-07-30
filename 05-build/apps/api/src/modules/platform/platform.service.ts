import {
  ConflictException, ForbiddenException, Injectable, UnprocessableEntityException,
} from '@nestjs/common';
import { PLATFORM_ADMIN_PERMISSIONS } from '@ipms/shared';
import { TenantTx, uuidv7, withPlatform, withPlatformWrite } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục C L2] Hình dạng metrics — chốt ở đây vì cột `metrics` là jsonb (DB không giữ kiểu).
 *
 * QUY TẮC DUY NHẤT khi thêm chỉ số: **chỉ được là số đếm, tổng, hoặc dấu thời gian.** Không
 * mã nhân viên, không tên, không email, không điểm, không nội dung. Test `platform-admin.spec`
 * quét mọi khoá/giá trị và làm đỏ nếu thấy chuỗi trông giống PII — nên vi phạm quy tắc này
 * không dừng ở tranh luận phong cách, nó làm gãy build.
 */
export interface PlatformMetrics {
  users: number;
  usersDisabled: number;
  orgUnits: number;
  persons: number;
  goals: number;
  goalsAtRisk: number;
  reviewsOpen: number;
  reviewsFinal: number;
  evidencePending: number;
  exportEvents: number;
  exportLastAt: string | null;
  aiCallsMonth: number;
  aiCostUsdMonth: number;
  integrationConnections: number;
  integrationRunsFailed: number;
  outboxPending: number;
  outboxDead: number;
  auditEvents: number;
}

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

  /**
   * [K9 — phòng tuyến thứ hai] Vai `platform_admin` trong DB phải KHỚP allowlist khai trong
   * mã. RBAC guard đã chặn theo từng permission rồi; hàm này bắt tình huống khác: ai đó cấp
   * THÊM quyền cho vai `platform_admin` trong DB (qua seed sửa tay, qua script vá) mà không
   * sửa allowlist. Khi đó guard vẫn cho qua vì permission có thật — chỉ phép so này phát hiện.
   * Gọi ở mọi endpoint nền tảng: rẻ (dữ liệu đã nằm trong `user.permissions`), và fail-closed.
   */
  private assertWithinAllowlist(user: RequestUser) {
    const allowed = new Set<string>(PLATFORM_ADMIN_PERMISSIONS as readonly string[]);
    const extras = [...user.permissions].filter(
      (p) => !allowed.has(p) && !p.includes('.self:') && p !== 'taskdict:read',
    );
    if (extras.length === 0) return;

    /**
     * HAI tình huống khác nhau về bản chất, và bản đầu gộp cả hai vào 409 — sai:
     *
     * ① Người gọi KHÔNG phải tài khoản nền tảng, chỉ tình cờ giữ một quyền trùng tên với
     *    allowlist (`tenant_admin` có `flag:read` từ trục B!) ⇒ RBAC guard cho qua route
     *    `flag:read`, rồi hàm này bắn 409 kèm LIỆT KÊ toàn bộ quyền của họ. Vừa sai mã lỗi
     *    (đây là "bạn không có quyền vào đây" = 403), vừa lộ thông tin không cần lộ.
     * ② Đúng là tài khoản nền tảng nhưng vai bị CẤP THÊM quyền trong DB ⇒ đây mới là trôi
     *    cấu hình, và 409 kèm tên quyền vi phạm là đúng thứ người vận hành cần thấy.
     *
     * Phân biệt bằng `tenant:list` — quyền chỉ tầng nền tảng có, dùng làm dấu nhận diện.
     */
    if (!user.permissions.has('tenant:list')) {
      throw new ForbiddenException(
        'Bề mặt quản trị nền tảng chỉ dành cho tài khoản tầng ① (platform_admin)',
      );
    }
    throw new ConflictException(
      `Tài khoản nền tảng giữ quyền NGOÀI allowlist: ${extras.join(', ')} — `
      + 'K9 yêu cầu platform_admin không có quyền nghiệp vụ nào. Rà lại vai trong DB.',
    );
  }

  /** Danh sách đơn vị + snapshot hiện hành. Đọc xuyên đơn vị qua GUC, KHÔNG có tenant context. */
  async listTenants(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, nameVi: true, type: true, createdAt: true },
        orderBy: { code: 'asc' },
      });
      const snaps = await tx.platformSnapshot.findMany();
      const byTenant = new Map(snaps.map((s) => [s.tenantId, s]));
      return {
        entries: tenants.map((t) => {
          const s = byTenant.get(t.id);
          return {
            tenantId: t.id, code: t.code, nameVi: t.nameVi, type: t.type,
            createdAt: t.createdAt,
            health: s?.health ?? 'unknown',
            capturedAt: s?.capturedAt ?? null,
            metrics: (s?.metrics as unknown as PlatformMetrics) ?? null,
          };
        }),
        total: tenants.length,
        // Snapshot cũ hơn dữ liệu là trạng thái BÌNH THƯỜNG — nói ra thay vì để B3 tự đoán.
        staleWarning: snaps.length < tenants.length
          ? `${tenants.length - snaps.length} đơn vị chưa có snapshot — chạy POST /platform/snapshot/refresh`
          : null,
      };
    });
  }

  /**
   * Sức khoẻ toàn hệ — tổng hợp TỪ SNAPSHOT, không truy vấn chéo bảng nghiệp vụ.
   * `alert` của một đơn vị kéo cả hệ về `alert`: B3 cần biết "có chỗ đang cháy", không cần
   * một con số trung bình đẹp che mất nó.
   */
  async health(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const snaps = await tx.platformSnapshot.findMany();
      const tenantCount = await tx.tenant.count({ where: { deletedAt: null } });
      const byHealth = { ok: 0, warn: 0, alert: 0, unknown: Math.max(0, tenantCount - snaps.length) };
      let outboxDead = 0; let runsFailed = 0;
      for (const s of snaps) {
        byHealth[(s.health as 'ok' | 'warn' | 'alert')] += 1;
        const m = s.metrics as unknown as PlatformMetrics;
        outboxDead += m?.outboxDead ?? 0;
        runsFailed += m?.integrationRunsFailed ?? 0;
      }
      const overall = byHealth.alert > 0 ? 'alert' : byHealth.warn > 0 ? 'warn' : 'ok';
      const oldest = snaps.reduce<Date | null>(
        (acc, s) => (acc === null || s.capturedAt < acc ? s.capturedAt : acc), null,
      );
      return {
        overall, tenants: tenantCount, byHealth,
        outboxDead, integrationRunsFailed: runsFailed,
        oldestSnapshotAt: oldest,
      };
    });
  }

  /** Mức dùng + chi phí AI theo đơn vị — số tổng, không một dòng hội thoại nào. */
  async aiUsage(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null }, select: { id: true, code: true },
      });
      const codeById = new Map(tenants.map((t) => [t.id, t.code]));
      const snaps = await tx.platformSnapshot.findMany();
      const entries = snaps.map((s) => {
        const m = s.metrics as unknown as PlatformMetrics;
        return {
          tenantId: s.tenantId, code: codeById.get(s.tenantId) ?? '(đã xoá)',
          calls: m?.aiCallsMonth ?? 0,
          costUsd: Number((m?.aiCostUsdMonth ?? 0).toFixed(6)),
          capturedAt: s.capturedAt,
        };
      }).sort((a, b) => b.costUsd - a.costUsd);
      return {
        entries,
        totalCostUsd: Number(entries.reduce((s, e) => s + e.costUsd, 0).toFixed(6)),
        totalCalls: entries.reduce((s, e) => s + e.calls, 0),
      };
    });
  }

  /**
   * Nhật ký xuất dữ liệu ở MỨC ĐẾM theo đơn vị.
   *
   * ⚠️ Lệch có chủ đích so với chữ trong kế hoạch ("màn nhật ký xuất dữ liệu"): B3 thấy *số
   * lần xuất và lần gần nhất*, KHÔNG thấy từng dòng `export_log`. Vì đọc từng dòng nghĩa là
   * biết đơn vị nào xuất dữ liệu gì đi đâu — đó là hồ sơ giám sát của B0 (`auditor`,
   * `exportlog:read` trong phạm vi đơn vị), và K1 nói tầng nền tảng chỉ đọc METADATA. Muốn
   * xem chi tiết ⇒ đi qua ngoại lệ có thời hạn ở L3, đúng như kế hoạch đã định.
   */
  async exportActivity(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null }, select: { id: true, code: true },
      });
      const codeById = new Map(tenants.map((t) => [t.id, t.code]));
      const snaps = await tx.platformSnapshot.findMany();
      return {
        entries: snaps.map((s) => {
          const m = s.metrics as unknown as PlatformMetrics;
          return {
            tenantId: s.tenantId, code: codeById.get(s.tenantId) ?? '(đã xoá)',
            exportEvents: m?.exportEvents ?? 0,
            lastExportAt: m?.exportLastAt ?? null,
            capturedAt: s.capturedAt,
          };
        }).sort((a, b) => b.exportEvents - a.exportEvents),
        note: 'Chỉ số đếm. Nội dung từng lần xuất thuộc phạm vi kiểm toán của đơn vị (B0).',
      };
    });
  }

  /** Trạng thái tích hợp theo đơn vị — số kết nối, số lần chạy lỗi, tồn đọng outbox. */
  async integrationStatus(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null }, select: { id: true, code: true },
      });
      const codeById = new Map(tenants.map((t) => [t.id, t.code]));
      const snaps = await tx.platformSnapshot.findMany();
      return {
        entries: snaps.map((s) => {
          const m = s.metrics as unknown as PlatformMetrics;
          return {
            tenantId: s.tenantId, code: codeById.get(s.tenantId) ?? '(đã xoá)',
            connections: m?.integrationConnections ?? 0,
            runsFailed: m?.integrationRunsFailed ?? 0,
            outboxPending: m?.outboxPending ?? 0,
            outboxDead: m?.outboxDead ?? 0,
          };
        }),
      };
    });
  }

  /**
   * LÀM MỚI SNAPSHOT — trái tim của K1.
   *
   * Đọc danh sách đơn vị qua GUC đọc (chỉ metadata), rồi **với TỪNG đơn vị** mở một
   * transaction `withTenant(t)` bình thường — tức đếm dưới RLS y như mọi truy vấn nghiệp vụ
   * khác — và ghi đúng dòng của đơn vị đó (policy ghi là tenant-bound). Ở đây KHÔNG tồn tại
   * một truy vấn nào đọc dữ liệu của hai đơn vị cùng lúc.
   *
   * Một đơn vị lỗi KHÔNG làm hỏng cả lượt: ghi lỗi vào `note`, để `health='alert'`, đi tiếp.
   * Job dừng giữa chừng vì một đơn vị hỏng nghĩa là B3 mất tầm nhìn toàn hệ đúng lúc cần nhất.
   */
  async refreshAll() {
    const tenants = await withPlatform(this.prisma.client, (tx: TenantTx) =>
      tx.tenant.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }));

    const results: Array<{ code: string; health: string; error?: string }> = [];
    for (const t of tenants) {
      try {
        const health = await this.refreshOne(t.id);
        results.push({ code: t.code, health });
      } catch (e: any) {
        results.push({ code: t.code, health: 'alert', error: String(e?.message ?? e).slice(0, 200) });
        await this.writeSnapshot(t.id, null, 'alert', `Lỗi khi làm mới: ${String(e?.message ?? e).slice(0, 300)}`)
          .catch(() => { /* best effort — không để lỗi ghi che lỗi gốc */ });
      }
    }
    return { refreshed: results.length, results, at: new Date().toISOString() };
  }

  private async refreshOne(tenantId: string): Promise<string> {
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);

    const metrics = await this.prisma.withTenant(tenantId, async (tx: TenantTx) => {
      const [
        users, usersDisabled, orgUnits, persons, goals, goalsAtRisk,
        reviewsOpen, reviewsFinal, evidencePending,
        exportEvents, lastExport, aiRows,
        integrationConnections, integrationRunsFailed, outboxPending, outboxDead, auditEvents,
      ] = await Promise.all([
        tx.appUser.count({ where: { deletedAt: null } }),
        tx.appUser.count({ where: { deletedAt: null, status: { not: 'active' } } }),
        tx.orgUnit.count({ where: { deletedAt: null } }),
        tx.person.count({ where: { deletedAt: null } }),
        tx.goal.count({ where: { deletedAt: null } }),
        tx.goal.count({ where: { deletedAt: null, status: { in: ['at_risk', 'off_track'] } } }),
        tx.review.count({ where: { deletedAt: null, status: { not: 'final' } } }),
        tx.review.count({ where: { deletedAt: null, status: 'final' } }),
        tx.evidence.count({ where: { deletedAt: null, status: 'pending' } }),
        tx.exportLog.count(),
        tx.exportLog.findFirst({ orderBy: { id: 'desc' }, select: { at: true } }),
        tx.aiInteraction.findMany({
          where: { at: { gte: monthStart } },
          select: { costUsd: true },
        }),
        tx.integrationConnection.count({ where: { deletedAt: null, status: 'active' } }),
        tx.integrationRun.count({ where: { status: 'failed' } }),
        tx.outboxEvent.count({ where: { status: 'pending' } }),
        tx.outboxEvent.count({ where: { status: 'dead' } }),
        tx.auditLog.count(),
      ]);
      const m: PlatformMetrics = {
        users, usersDisabled, orgUnits, persons, goals, goalsAtRisk,
        reviewsOpen, reviewsFinal, evidencePending,
        exportEvents,
        exportLastAt: lastExport?.at ? lastExport.at.toISOString() : null,
        aiCallsMonth: aiRows.length,
        aiCostUsdMonth: Number(aiRows.reduce((s, r) => s + Number(r.costUsd ?? 0), 0).toFixed(6)),
        integrationConnections, integrationRunsFailed, outboxPending, outboxDead, auditEvents,
      };
      return m;
    });

    const health = PlatformService.deriveHealth(metrics);
    await this.writeSnapshot(tenantId, metrics, health, null);
    return health;
  }

  /**
   * Suy trạng thái từ số đếm — MỘT chỗ duy nhất. Ngưỡng để trong mã (không cấu hình) cho tới
   * khi B3 có ý kiến từ vận hành thật: một ngưỡng cấu hình được mà chưa ai biết đặt bao nhiêu
   * chỉ tạo cảm giác linh hoạt.
   */
  static deriveHealth(m: PlatformMetrics): 'ok' | 'warn' | 'alert' {
    if (m.outboxDead > 0 || m.integrationRunsFailed > 0) return 'alert';
    if (m.outboxPending > 50 || m.goalsAtRisk > 0 || m.evidencePending > 20) return 'warn';
    return 'ok';
  }

  /** Ghi snapshot — LUÔN trong tenant context (policy ghi tenant-bound, không dùng GUC). */
  private writeSnapshot(
    tenantId: string, metrics: PlatformMetrics | null, health: string, note: string | null,
  ) {
    return this.prisma.withTenant(tenantId, async (tx: TenantTx) => {
      const existing = await tx.platformSnapshot.findFirst({ where: { tenantId } });
      const data = {
        metrics: (metrics ?? {}) as object, health, note,
        capturedAt: new Date(),
      };
      if (existing) {
        await tx.platformSnapshot.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        });
      } else {
        await tx.platformSnapshot.create({ data: { id: uuidv7(), tenantId, ...data } });
      }
    });
  }

  /** Cờ tính năng TOÀN CỤC (tenant_id NULL) — bề mặt duy nhất ghi được hàng global. */
  async listFlags(user: RequestUser) {
    this.assertWithinAllowlist(user);
    return withPlatform(this.prisma.client, async (tx: TenantTx) => {
      const rows = await tx.featureFlag.findMany({ orderBy: [{ key: 'asc' }] });
      return {
        entries: rows.map((f) => ({
          key: f.key, enabled: f.enabled, payload: f.payload,
          scope: f.tenantId === null ? ('global' as const) : ('tenant' as const),
          tenantId: f.tenantId, version: f.version,
        })),
        total: rows.length,
      };
    });
  }

  async setGlobalFlag(user: RequestUser, key: string, enabled: boolean, version?: number) {
    this.assertWithinAllowlist(user);
    if (!/^[a-z][a-z0-9_.]{2,63}$/.test(key)) {
      throw new UnprocessableEntityException(
        `Khoá cờ không hợp lệ: '${key}' — chữ thường, số, '_' và '.', 3–64 ký tự`,
      );
    }
    return withPlatformWrite(this.prisma.client, async (tx: TenantTx) => {
      const existing = await tx.featureFlag.findFirst({ where: { tenantId: null, key } });
      if (existing) {
        if (version !== undefined && version !== existing.version) {
          throw new ConflictException('Version lệch — tải lại và thử lại');
        }
        await tx.featureFlag.updateMany({
          where: { id: existing.id, version: existing.version },
          data: { enabled, version: { increment: 1 } },
        });
        return { key, enabled, scope: 'global' as const, created: false };
      }
      await tx.featureFlag.create({
        data: { id: uuidv7(), tenantId: null, key, enabled, payload: {} },
      });
      return { key, enabled, scope: 'global' as const, created: true };
    });
  }

  /** Tạo đơn vị mới — hành động vận hành thứ hai (và cuối cùng) của tầng nền tảng. */
  async createTenant(
    user: RequestUser, input: { code: string; nameVi: string; type: string },
  ) {
    this.assertWithinAllowlist(user);
    if (!/^[A-Z0-9][A-Z0-9.\-]{1,15}$/.test(input.code)) {
      throw new UnprocessableEntityException(
        `Mã đơn vị không hợp lệ: '${input.code}' — chữ HOA/số/'.'/'-', 2–16 ký tự`,
      );
    }
    if (!['holding', 'opco', 'propco'].includes(input.type)) {
      throw new UnprocessableEntityException(`Loại đơn vị không hợp lệ: '${input.type}'`);
    }
    const id = uuidv7();
    return withPlatformWrite(this.prisma.client, async (tx: TenantTx) => {
      /**
       * ⚠️ INSERT THÔ, KHÔNG `prisma.create()` — và đây là một bài học đắt, không phải sở thích.
       *
       * Postgres áp policy SELECT lên mệnh đề RETURNING của INSERT. `prisma.create()` LUÔN
       * sinh `INSERT ... RETURNING`, nên nó đòi đọc lại dòng vừa ghi. Đường ghi nền tảng cố ý
       * KHÔNG bật `app.platform_read` (tách đọc/ghi), và `tenant_isolation` so `id` với
       * `app.tenant_id` cũng không set ⇒ RETURNING bị từ chối, và Postgres báo lỗi dưới dạng
       * *"new row violates row-level security policy"* — thông báo trỏ sai hướng hoàn toàn:
       * nó nói WITH CHECK sai trong khi thực tế là SELECT sai.
       *
       * Ba cách sửa; chọn cách này vì nó giữ nguyên bất biến thay vì nới nó:
       *   ✗ bật thêm `platform_read` trong đường ghi  → đường ghi lại đọc được xuyên đơn vị
       *   ✗ thêm policy SELECT theo `platform_write`  → y hệt, chỉ chuyển chỗ
       *   ✓ không RETURNING: `id` do ta sinh (uuidv7), không có gì cần đọc lại
       *
       * Hệ quả phải chấp nhận: mất P2002 của Prisma, phải bắt mã lỗi Postgres 23505 thô.
       */
      try {
        await tx.$executeRaw`
          INSERT INTO tenant (id, code, name_vi, type, settings, created_at, updated_at, version, created_by)
          VALUES (${id}::uuid, ${input.code}, ${input.nameVi}, ${input.type}, '{}'::jsonb,
                  now(), now(), 1, ${user.claims.sub}::uuid)`;
      } catch (e: any) {
        const pg = String(e?.meta?.code ?? e?.code ?? '');
        const msg = String(e?.message ?? '');
        if (pg === '23505' || msg.includes('duplicate key') || msg.includes('tenant_code_key')) {
          throw new ConflictException(`Mã đơn vị '${input.code}' đã tồn tại`);
        }
        throw e;
      }
      return { tenantId: id, code: input.code, nameVi: input.nameVi, type: input.type };
    });
  }
}
