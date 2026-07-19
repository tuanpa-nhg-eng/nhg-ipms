/**
 * Seed Task Catalog V2 — 694 tác vụ Archive/Task_Dashboard_v2 (lát G1 go-live;
 * THAY bộ 815 keyword theo quyết định D1 15/07/2026) — đi qua CHÍNH pipeline
 * import §6.5 (LibraryService.importPreview → applyImport): quality gate per-row,
 * Q1 chặn cứng KPI (assertKpiRefExists), SoD F91, idempotent upsert theo mã,
 * audit_log per run.
 *
 * Mode per row (Q1/D2 — spec Task Dictionary §12 + kế hoạch go-live §5):
 * - Tác vụ REAL + KPI ∈ Từ điển (gốc 20 + FIN-EXT đề xuất) → as_canonical
 *   (đợt 1 = domain FIN: Kế toán/Tài chính/Nguồn vốn, map explainable).
 * - Còn lại (chưa có KPI thật hoặc phòng "(giả định)") → as_submission chờ B1,
 *   KHÔNG vào canonical/active — đúng chặn cứng Q1.
 *
 * Chạy: pnpm --filter @ipms/api seed:taskcatalog [TENANT_CODE]   (mặc định H.01)
 * Idempotent: as_canonical upsert theo mã; as_submission bỏ qua mã đã có phiếu/cell.
 *
 * Vai trò thực thi (SoD giữ nguyên):
 * - as_canonical: curator@ (library_curator — có library:import:canonical, KHÔNG
 *   taskcell:author nên qua SoD F91).
 * - as_submission: admin@ (tenant_admin) đứng tên tác giả phiếu → curator vẫn duyệt
 *   được về sau (không tự duyệt bài mình).
 */
import 'dotenv/config';
import { createPrismaClient, buildSeedPlanV2, PrismaClient } from '@ipms/db';
import { PrismaService } from '../prisma.service';
import { LibraryService } from '../modules/library/library.service';
import type { RequestUser } from '../common/auth/decorators';
import { normalizeName, type CellPayload } from '../modules/library/quality-gate';

export interface SeedBatchStat {
  dept: string;
  mode: string;
  rows: number;
  skipped: number;    // submission đã có phiếu/cell · canonical đã deprecate (tôn trọng governance)
  protected: number;  // [F109] cell canonical đã bị người khác hiệu chỉnh — KHÔNG đè
  unchanged: number;  // [F132a] row y hệt cell hiện hữu — import bỏ qua, không revision nhiễu
  imported: number;
  updated: number;
  contributions: number;
}

export interface SeedResult {
  tenantCode: string;
  batches: SeedBatchStat[];
  totals: {
    rows: number; skipped: number; protected: number; unchanged: number;
    imported: number; updated: number; contributions: number;
  };
}

/** Dựng RequestUser từ DB thật (role→permission→scope) — không hardcode quyền. */
async function requestUserFor(
  owner: PrismaClient, tenantId: string, emailPrefix: string,
): Promise<RequestUser> {
  const user = await owner.appUser.findFirst({
    where: { tenantId, email: { startsWith: emailPrefix }, status: 'active' },
  });
  if (!user) throw new Error(`Không tìm thấy user '${emailPrefix}*' trong tenant — chạy pnpm db:seed trước`);
  const roles = await owner.userRole.findMany({ where: { tenantId, appUserId: user.id } });
  const perms = await owner.rolePermission.findMany({
    where: { roleId: { in: roles.map((r) => r.roleId) } },
    include: { permission: true },
  });
  return {
    claims: { sub: user.id, tid: tenantId, email: user.email } as RequestUser['claims'],
    tenantId,
    permissions: new Set(perms.map((p) => p.permission.code)),
    scopes: roles.map((r) => ({
      scopeType: r.scopeType as 'tenant' | 'org_unit' | 'self', scopeId: r.scopeId ?? null,
    })),
  };
}

export async function seedTaskCatalog(opts: {
  tenantCode?: string;
  prisma?: PrismaService;
  ownerUrl?: string;
  log?: (msg: string) => void;
}): Promise<SeedResult> {
  const tenantCode = opts.tenantCode ?? 'H.01';
  const log = opts.log ?? ((m: string) => console.log(m));
  const owner = createPrismaClient(opts.ownerUrl ?? process.env.OWNER_DATABASE_URL);
  const prisma = opts.prisma ?? new PrismaService();
  const library = new LibraryService(prisma);

  try {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant) throw new Error(`Tenant '${tenantCode}' không tồn tại — chạy pnpm db:seed trước`);

    const curator = await requestUserFor(owner, tenant.id, 'curator@');
    const admin = await requestUserFor(owner, tenant.id, 'admin@');

    // Idempotency tầng submission: mã đã có phiếu đóng góp (mọi trạng thái chưa xoá)
    // hoặc đã thành canonical → không tạo phiếu lặp khi chạy lại seed.
    const existingContribs = await owner.libraryContribution.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { payload: true, taskCellId: true },
    });
    const existingCanonical = await owner.taskCell.findMany({
      where: { tenantId: tenant.id, configVersionId: null, deletedAt: null },
      select: { code: true, nameVi: true, updatedBy: true },
    });
    // [F111] canonical đã deprecate (soft-delete) — quyết định governance, seed KHÔNG hồi sinh
    const deprecatedCanonical = await owner.taskCell.findMany({
      where: { tenantId: tenant.id, configVersionId: null, deletedAt: { not: null } },
      select: { code: true },
    });
    const alreadySubmitted = new Set<string>();
    // [F110] map mã → tên chuẩn hoá hiện hữu: phát hiện DRIFT mã vị trí khi HTML nguồn đổi
    const existingNameByCode = new Map<string, string>();
    for (const c of existingContribs) {
      const p = c.payload as { code?: string; nameVi?: string } | null;
      // [F135] phiếu KHÔNG vào drift map: mã đã có phiếu luôn bị SKIP (alreadySubmitted)
      // nên seed không ghi gì lên chúng — tên phiếu có thể đã sửa HỢP LỆ (needs_changes,
      // vòng tối ưu 4k) → so với catalog là fail oan. Drift nguồn được gác bởi
      // (a) drift-check cell canonical seed sẽ update + (b) unit test PIN sha256 toàn plan.
      if (p?.code) alreadySubmitted.add(p.code);
    }
    const activeCanonical = new Map<string, { name: string; updatedBy: string | null }>();
    for (const c of existingCanonical) {
      alreadySubmitted.add(c.code);
      activeCanonical.set(c.code, { name: normalizeName(c.nameVi), updatedBy: c.updatedBy });
      // [4k] cell đã được PHÒNG TỐI ƯU (updatedBy ≠ seed curator) → seed không ghi đè (F109)
      // nên cũng KHÔNG drift-check theo tên hiện tại — tên có thể đã đổi HỢP LỆ qua vòng lặp;
      // drift guard F110 chỉ áp cho cell mà seed sẽ thật sự cập nhật
      if (!c.updatedBy || c.updatedBy === curator.claims.sub) {
        existingNameByCode.set(c.code, normalizeName(c.nameVi));
      }
    }
    const deprecatedCodes = new Set(
      deprecatedCanonical.map((c) => c.code).filter((code) => !activeCanonical.has(code)),
    );

    const plan = buildSeedPlanV2();

    // [F110] GUARD DRIFT — mã tác vụ sinh theo VỊ TRÍ trong HTML nguồn: nếu nguồn
    // chèn/xoá/đổi thứ tự, cùng mã sẽ mang NỘI DUNG KHÁC. So tên chuẩn hoá theo mã;
    // lệch → FAIL CỨNG (cần migration mã có chủ đích), tuyệt đối không đè âm thầm.
    const drift: string[] = [];
    for (const batch of plan) {
      for (const row of batch.rows) {
        const existing = existingNameByCode.get(row.code);
        if (existing !== undefined && existing !== normalizeName(row.nameVi)) {
          drift.push(`${row.code}: '${row.nameVi}' ≠ bản đang có`);
        }
      }
    }
    if (drift.length > 0) {
      throw new Error(
        `[F110] Phát hiện ${drift.length} mã lệch nội dung so với thư viện — HTML nguồn đã đổi thứ tự/chèn tác vụ. `
        + `KHÔNG seed đè; cần migration mã có chủ đích. Ví dụ: ${drift.slice(0, 5).join(' · ')}`,
      );
    }

    const batches: SeedBatchStat[] = [];

    for (const batch of plan) {
      const stat: SeedBatchStat = {
        dept: batch.dept, mode: batch.mode, rows: batch.rows.length,
        skipped: 0, protected: 0, unchanged: 0, imported: 0, updated: 0, contributions: 0,
      };

      let rows = batch.rows as unknown as CellPayload[];
      let actor = curator;
      if (batch.mode === 'as_submission') {
        actor = admin;
        const fresh = rows.filter((r) => !alreadySubmitted.has(r.code!));
        stat.skipped = rows.length - fresh.length;
        rows = fresh;
      } else {
        // [F111] không hồi sinh cell đã deprecate
        const alive = rows.filter((r) => !deprecatedCodes.has(r.code!));
        stat.skipped = rows.length - alive.length;
        // [F109] cell đã bị NGƯỜI KHÁC hiệu chỉnh sau seed (updatedBy ≠ curator seed)
        // → giữ nguyên bản phòng ban đã tối ưu, không đè lại map sơ bộ
        rows = alive.filter((r) => {
          const cell = activeCanonical.get(r.code!);
          if (cell && cell.updatedBy && cell.updatedBy !== curator.claims.sub) {
            stat.protected += 1;
            return false;
          }
          return true;
        });
      }
      if (rows.length === 0) {
        log(`  · ${batch.dept}: ${batch.mode} — đã seed đủ, bỏ qua (idempotent)`);
        batches.push(stat);
        continue;
      }

      const preview = await library.importPreview(actor, {
        mode: batch.mode, rows,
        sourceRef: `task-catalog-g1:${batch.slug}:${batch.mode}`,
      });
      const diff = preview.diff as unknown as { add: string[]; update: string[]; invalid: unknown[] };
      if (diff.invalid.length > 0) {
        // fail-closed: mapper phải sinh 100% payload qua gate — lệch là bug, không seed thiếu âm thầm.
        // [F113] đánh dấu run failed trước khi throw — không để orphan run 'preview' tích tụ
        await prisma.withTenant(tenant.id, (tx) =>
          tx.libraryImportRun.update({
            where: { id: preview.id },
            data: { status: 'failed', error: { reason: `seed 4i: ${diff.invalid.length} row rớt quality gate` } as object },
          }),
        );
        throw new Error(
          `Batch '${batch.dept}' có ${diff.invalid.length} row rớt quality gate: ${JSON.stringify(diff.invalid).slice(0, 500)}`,
        );
      }

      const applied = await library.applyImport(actor, preview.id);
      const stats = applied!.stats as unknown as {
        imported?: number; updated?: number; unchanged?: number; contributions?: number;
      };
      stat.imported = stats.imported ?? 0;
      stat.updated = stats.updated ?? 0;
      stat.unchanged = stats.unchanged ?? 0;
      stat.contributions = stats.contributions ?? 0;
      batches.push(stat);
      log(`  · ${batch.dept}: ${batch.mode} — mới ${stat.imported}/cập nhật ${stat.updated}/không đổi ${stat.unchanged}/phiếu ${stat.contributions}${stat.skipped ? `/bỏ qua ${stat.skipped}` : ''}${stat.protected ? `/giữ nguyên (đã hiệu chỉnh) ${stat.protected}` : ''}`);
    }

    const totals = batches.reduce(
      (s, b) => ({
        rows: s.rows + b.rows, skipped: s.skipped + b.skipped, protected: s.protected + b.protected,
        unchanged: s.unchanged + b.unchanged,
        imported: s.imported + b.imported, updated: s.updated + b.updated,
        contributions: s.contributions + b.contributions,
      }),
      { rows: 0, skipped: 0, protected: 0, unchanged: 0, imported: 0, updated: 0, contributions: 0 },
    );
    log(`Seed Task Catalog '${tenantCode}': ${totals.rows} tác vụ — canonical mới ${totals.imported}, cập nhật ${totals.updated}, không đổi ${totals.unchanged}, giữ nguyên (đã hiệu chỉnh) ${totals.protected}, phiếu submission ${totals.contributions}, bỏ qua ${totals.skipped}`);
    return { tenantCode, batches, totals };
  } finally {
    await owner.$disconnect();
    if (!opts.prisma) await prisma.onModuleDestroy();
  }
}

/* istanbul ignore next — CLI entry */
if (require.main === module) {
  seedTaskCatalog({ tenantCode: process.argv[2] })
    .catch((e) => { console.error(e); process.exit(1); });
}
