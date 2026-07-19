/**
 * Migration D1 (go-live Từ điển Tác vụ) — DEPRECATE bộ 815 legacy khỏi dev DB.
 *
 * Quyết định D1 (15/07/2026): THAY danh mục 815 keyword (nguồn Task_Catalog_Tech_Exec.html,
 * seed lát 4i) bằng danh mục V2 giàu (Archive/Task_Dashboard_v2, seed G1). Script này
 * SOFT-DELETE (deletedAt + status=deprecated) mọi cell canonical + contribution có
 * provenance chứa 'Task_Catalog_Tech_Exec' → chúng biến khỏi Từ điển/hàng chờ, KHÔNG
 * xoá cứng (giữ dấu vết). Seed V2 dùng mã KHÁC nên không đụng; F111 chặn hồi sinh.
 *
 * AN TOÀN: chỉ tenant chỉ định (mặc định H.01), chỉ nhận diện qua provenance legacy,
 * idempotent (chạy lại không đổi), ghi audit_log per loại. KHÔNG chạm cell V2/khác.
 *
 * Chạy: pnpm --filter @ipms/api exec ts-node --transpile-only src/scripts/deprecate-legacy-catalog.ts [TENANT_CODE]
 */
import 'dotenv/config';
import { createPrismaClient } from '@ipms/db';

const LEGACY_PROVENANCE = 'Task_Catalog_Tech_Exec';

async function main() {
  const tenantCode = process.argv[2] ?? 'H.01';
  const owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
  try {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant) throw new Error(`Tenant '${tenantCode}' không tồn tại`);
    const tid = tenant.id;

    // 1) Cell canonical legacy còn sống (governance.provenance chứa marker)
    const cells = await owner.taskCell.findMany({
      where: {
        tenantId: tid, configVersionId: null, deletedAt: null,
        governance: { path: ['provenance'], string_contains: LEGACY_PROVENANCE },
      },
      select: { id: true, code: true },
    });
    // 2) Contribution legacy còn sống (payload.governance.provenance chứa marker)
    const contribs = await owner.libraryContribution.findMany({
      where: {
        tenantId: tid, deletedAt: null,
        payload: { path: ['governance', 'provenance'], string_contains: LEGACY_PROVENANCE },
      },
      select: { id: true },
    });

    if (cells.length === 0 && contribs.length === 0) {
      console.log(`[D1] '${tenantCode}': không còn legacy '${LEGACY_PROVENANCE}' — idempotent, bỏ qua.`);
      return;
    }

    const now = new Date();
    await owner.$transaction(async (tx) => {
      if (cells.length > 0) {
        await tx.taskCell.updateMany({
          where: { id: { in: cells.map((c) => c.id) } },
          data: { deletedAt: now, status: 'deprecated', updatedAt: now },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tid, action: 'library.deprecate_legacy', entityType: 'task_cell',
            after: { reason: 'D1 replace 815→V2', provenance: LEGACY_PROVENANCE, count: cells.length,
              sampleCodes: cells.slice(0, 10).map((c) => c.code) },
          },
        });
      }
      if (contribs.length > 0) {
        await tx.libraryContribution.updateMany({
          where: { id: { in: contribs.map((c) => c.id) } },
          data: { deletedAt: now },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tid, action: 'library.deprecate_legacy', entityType: 'library_contribution',
            after: { reason: 'D1 replace 815→V2', provenance: LEGACY_PROVENANCE, count: contribs.length },
          },
        });
      }
    });

    console.log(`[D1] '${tenantCode}': deprecate ${cells.length} cell canonical + ${contribs.length} contribution legacy (soft-delete + audit).`);
  } finally {
    await owner.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
