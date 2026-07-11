/**
 * Integration lát 4i — Seed 815 tác vụ Task Catalog qua pipeline import §6.5:
 * chạy seed THẬT trên H.01 (dev DB) → 283 canonical (Q1: 100% kpiRef ∈ Từ điển KPI)
 * + 532 phiếu submission chờ B1 · idempotent (chạy lại không nhân bản) ·
 * audit_log per run · cô lập tenant (T2 không dính).
 *
 * LƯU Ý: spec này CỐ Ý không dọn dữ liệu seed — 815 tác vụ là trạng thái nền
 * mong muốn của dev DB (như 20 KPI dictionary), các spec khác không phụ thuộc
 * đếm tuyệt đối trên task_cell/library_contribution.
 */
import { createPrismaClient, PrismaClient, buildSeedPlan } from '@ipms/db';
import { KPI_DICTIONARY } from '@ipms/db';
import { seedTaskCatalog } from '../../src/scripts/seed-task-catalog';
import { PrismaService } from '../../src/prisma.service';

jest.setTimeout(300_000);

const DICT = new Set(KPI_DICTIONARY.map((k) => k.code));

describe('Phase 3 lát 4i — seed Task Catalog 815 tác vụ', () => {
  let owner: PrismaClient;
  let prisma: PrismaService;
  let h01: string;
  let t2: string;
  let allCodes: string[];
  let canonicalCodes: string[];
  let submissionCodes: string[];

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    prisma = new PrismaService();
    h01 = (await owner.tenant.findUnique({ where: { code: 'H.01' } }))!.id;
    t2 = (await owner.tenant.findUnique({ where: { code: 'T2.TEST' } }))!.id;
    const plan = buildSeedPlan();
    allCodes = plan.flatMap((b) => b.rows.map((r) => r.code));
    canonicalCodes = plan.filter((b) => b.mode === 'as_canonical').flatMap((b) => b.rows.map((r) => r.code));
    submissionCodes = plan.filter((b) => b.mode === 'as_submission').flatMap((b) => b.rows.map((r) => r.code));
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    await owner?.$disconnect();
  });

  it('seed lần 1 (hoặc trạng thái đã seed): 283 canonical + 532 submission, không row nào rớt gate', async () => {
    const r1 = await seedTaskCatalog({ tenantCode: 'H.01', prisma, log: () => undefined });
    expect(r1.totals.rows).toBe(815);
    // lần đầu: imported 283 + contributions 532; DB đã seed trước: updated/protected/skipped thay thế
    const canon = r1.batches.filter((b) => b.mode === 'as_canonical');
    const subs = r1.batches.filter((b) => b.mode === 'as_submission');
    expect(canon.reduce((s, b) => s + b.imported + b.updated + b.protected + b.skipped, 0)).toBe(283);
    expect(subs.reduce((s, b) => s + b.contributions + b.skipped, 0)).toBe(532);
  });

  it('[Q1 CHẶN CỨNG] mọi cell canonical từ catalog có kpiRef trỏ Từ điển KPI thật', async () => {
    const cells = await owner.taskCell.findMany({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: canonicalCodes } },
      select: { code: true, kpiRef: true, origin: true, libScope: true },
    });
    expect(cells).toHaveLength(283);
    for (const c of cells) {
      expect(c.kpiRef).toBeTruthy();
      expect(DICT.has(c.kpiRef!)).toBe(true);
      expect(c.origin).toBe('imported');
      expect(c.libScope).toBe('tenant');
    }
  });

  it('[Q1] 532 tác vụ ngoài 3 domain KHÔNG vào canonical — nằm ở tầng submission chờ B1', async () => {
    const wrong = await owner.taskCell.count({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: submissionCodes } },
    });
    expect(wrong).toBe(0);

    // [F114] không lọc status — phiếu có thể đã vào vòng review; bất biến là TỒN TẠI phiếu
    const contribs = await owner.libraryContribution.findMany({
      where: { tenantId: h01, deletedAt: null },
      select: { payload: true, kpiRef: true },
    });
    const codes = new Set(
      contribs.map((c) => (c.payload as { code?: string } | null)?.code).filter(Boolean),
    );
    for (const code of submissionCodes) expect(codes.has(code)).toBe(true);
  });

  it('idempotent: seed lần 2 không nhân bản — cell không tăng, không phiếu submission mới', async () => {
    const cellsBefore = await owner.taskCell.count({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: allCodes } },
    });
    const contribsBefore = await owner.libraryContribution.count({
      where: { tenantId: h01, deletedAt: null },
    });

    const r2 = await seedTaskCatalog({ tenantCode: 'H.01', prisma, log: () => undefined });
    expect(r2.totals.imported).toBe(0);          // canonical: update/giữ nguyên, không cell mới
    expect(r2.totals.contributions).toBe(0);     // submission: bỏ qua toàn bộ
    const canon2 = r2.batches.filter((b) => b.mode === 'as_canonical');
    const subs2 = r2.batches.filter((b) => b.mode === 'as_submission');
    expect(canon2.reduce((s, b) => s + b.updated + b.protected + b.skipped, 0)).toBe(283);
    expect(subs2.reduce((s, b) => s + b.skipped, 0)).toBe(532);

    expect(await owner.taskCell.count({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: allCodes } },
    })).toBe(cellsBefore);
    expect(await owner.libraryContribution.count({
      where: { tenantId: h01, deletedAt: null },
    })).toBe(contribsBefore);
  });

  it('audit: mỗi lượt apply ghi audit_log library.import với stats', async () => {
    // [F114] lọc theo mode trong payload — không phụ thuộc log mới nhất của suite khác
    const logs = await owner.auditLog.findMany({
      where: { tenantId: h01, action: 'library.import' },
      orderBy: { at: 'desc' }, take: 200,
    });
    const seedLogs = logs.filter((l) => {
      const a = l.after as { mode?: string } | null;
      return a?.mode === 'as_canonical' || a?.mode === 'as_submission';
    });
    expect(seedLogs.length).toBeGreaterThanOrEqual(8); // ≥ 8 batch canonical lần đầu
  });

  it('cô lập tenant: T2.TEST không nhận cell/phiếu nào từ seed H.01', async () => {
    expect(await owner.taskCell.count({
      where: { tenantId: t2, code: { in: allCodes } },
    })).toBe(0);
    expect(await owner.libraryContribution.count({
      where: { tenantId: t2, kpiRef: null, payload: { path: ['governance', 'provenance'], string_contains: 'Task_Catalog_Tech_Exec' } },
    })).toBe(0);
  });

  it('mã sinh tự động tra được qua thư viện canonical (ví dụ TS-*, CCLG-*)', async () => {
    const ts = await owner.taskCell.findFirst({
      where: { tenantId: h01, configVersionId: null, code: { startsWith: 'TS-G' }, deletedAt: null },
    });
    expect(ts).toBeTruthy();
    expect(ts!.kpiRef).toMatch(/^ADM-/);
    const cclg = await owner.taskCell.findFirst({
      where: { tenantId: h01, configVersionId: null, code: { startsWith: 'CCLG-G' }, deletedAt: null },
    });
    expect(cclg!.kpiRef).toMatch(/^TCH-/);
  });
});
