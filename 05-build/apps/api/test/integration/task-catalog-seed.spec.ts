/**
 * Integration lát G1/G2 (go-live Từ điển Tác vụ) — Seed Task Catalog V2 qua pipeline
 * import §6.5: chạy seed THẬT trên H.01 (dev DB) → 131 canonical đợt 1 FIN
 * (D5 Kế toán/Tài chính/Nguồn vốn; Q1: 100% kpiRef ∈ Từ điển 20 gốc + 21 FIN-EXT)
 * + 1063 phiếu submission chờ B1 · idempotent (chạy lại không nhân bản) ·
 * audit_log per run · cô lập tenant (T2 không dính).
 *
 * V2 THAY bộ 815 (D1 15/07/2026) — nguồn Archive/Task_Dashboard_v2.html, 1194 tác vụ.
 * LƯU Ý: spec này CỐ Ý không dọn dữ liệu seed — thư viện tác vụ là trạng thái nền
 * mong muốn của dev DB (như Từ điển KPI), các spec khác không phụ thuộc
 * đếm tuyệt đối trên task_cell/library_contribution.
 */
import { createPrismaClient, PrismaClient, buildSeedPlanV2 } from '@ipms/db';
import { KPI_DICTIONARY, KPI_DICTIONARY_EXT } from '@ipms/db';
import { seedTaskCatalog } from '../../src/scripts/seed-task-catalog';
import { PrismaService } from '../../src/prisma.service';

jest.setTimeout(600_000);

const DICT = new Set([...KPI_DICTIONARY, ...KPI_DICTIONARY_EXT].map((k) => k.code));

describe('G1/G2 — seed Task Catalog V2 (1194 tác vụ Archive)', () => {
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
    const plan = buildSeedPlanV2();
    allCodes = plan.flatMap((b) => b.rows.map((r) => r.code));
    canonicalCodes = plan.filter((b) => b.mode === 'as_canonical').flatMap((b) => b.rows.map((r) => r.code));
    submissionCodes = plan.filter((b) => b.mode === 'as_submission').flatMap((b) => b.rows.map((r) => r.code));
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    await owner?.$disconnect();
  });

  it('seed lần 1 (hoặc trạng thái đã seed): 131 canonical + 1063 submission, không row nào rớt gate', async () => {
    const r1 = await seedTaskCatalog({ tenantCode: 'H.01', prisma, log: () => undefined });
    expect(r1.totals.rows).toBe(1194);
    // lần đầu: imported 131 + contributions 1063; DB đã seed trước: updated/protected/skipped thay thế
    const canon = r1.batches.filter((b) => b.mode === 'as_canonical');
    const subs = r1.batches.filter((b) => b.mode === 'as_submission');
    expect(canon.reduce((s, b) => s + b.imported + b.updated + b.unchanged + b.protected + b.skipped, 0)).toBe(131);
    expect(subs.reduce((s, b) => s + b.contributions + b.skipped, 0)).toBe(1063);
  });

  it('[Q1/D2 CHẶN CỨNG] mọi cell canonical từ catalog có kpiRef trỏ Từ điển KPI thật (gốc + FIN-EXT)', async () => {
    const cells = await owner.taskCell.findMany({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: canonicalCodes } },
      select: { code: true, kpiRef: true, origin: true, libScope: true },
    });
    expect(cells).toHaveLength(131);
    for (const c of cells) {
      expect(c.kpiRef).toBeTruthy();
      expect(DICT.has(c.kpiRef!)).toBe(true);
      expect(c.origin).toBe('imported');
      expect(c.libScope).toBe('tenant');
    }
  });

  it('[G2] 21 KPI FIN-EXT đề xuất đã seed vào kpi_template (isDictionary) — hard-block dùng được', async () => {
    const ext = await owner.kpiTemplate.findMany({
      where: { tenantId: h01, code: { startsWith: 'FIN-EXT-' }, deletedAt: null },
      select: { code: true, isDictionary: true, domain: true },
    });
    expect(ext).toHaveLength(KPI_DICTIONARY_EXT.length);
    for (const k of ext) {
      expect(k.isDictionary).toBe(true);
      expect(k.domain).toBe('Tài chính - Kế toán');
    }
  });

  it('[Q1] 1063 tác vụ ngoài đợt 1 KHÔNG vào canonical — nằm ở tầng submission chờ B1', async () => {
    const wrong = await owner.taskCell.count({
      where: { tenantId: h01, configVersionId: null, deletedAt: null, code: { in: submissionCodes } },
    });
    expect(wrong).toBe(0);

    // [F114] không lọc status — phiếu có thể đã vào vòng review; bất biến là TỒN TẠI phiếu
    const contribs = await owner.libraryContribution.findMany({
      where: { tenantId: h01, deletedAt: null },
      select: { payload: true },
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
    expect(r2.totals.imported).toBe(0);          // canonical: unchanged/giữ nguyên, không cell mới
    expect(r2.totals.contributions).toBe(0);     // submission: bỏ qua toàn bộ
    const canon2 = r2.batches.filter((b) => b.mode === 'as_canonical');
    const subs2 = r2.batches.filter((b) => b.mode === 'as_submission');
    expect(canon2.reduce((s, b) => s + b.updated + b.unchanged + b.protected + b.skipped, 0)).toBe(131);
    expect(subs2.reduce((s, b) => s + b.skipped, 0)).toBe(1063);
    // [F132a] re-seed nội dung y hệt KHÔNG sinh revision nhiễu (unchanged, không update)
    expect(r2.totals.updated).toBe(0);

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
      orderBy: { at: 'desc' }, take: 300,
    });
    const seedLogs = logs.filter((l) => {
      const a = l.after as { mode?: string } | null;
      return a?.mode === 'as_canonical' || a?.mode === 'as_submission';
    });
    expect(seedLogs.length).toBeGreaterThanOrEqual(5); // ≥ 5 batch canonical lần đầu
  });

  it('cô lập tenant: T2.TEST không nhận cell/phiếu nào từ seed H.01', async () => {
    expect(await owner.taskCell.count({
      where: { tenantId: t2, code: { in: allCodes } },
    })).toBe(0);
    expect(await owner.libraryContribution.count({
      where: { tenantId: t2, payload: { path: ['governance', 'provenance'], string_contains: 'Task_Dashboard_v2' } },
    })).toBe(0);
  });

  it('dữ liệu giàu tra được qua canonical: mã thật (GL-DAY) + mã sinh tự động (FIN-CHIEF-ACCOUNTANT)', async () => {
    // GL-DAY-002 (KHÔNG dùng GL-DAY-001 vì task-loop.spec mutate cell đó qua vòng tối ưu)
    const gl = await owner.taskCell.findFirst({
      where: { tenantId: h01, configVersionId: null, code: 'GL-DAY-002', deletedAt: null },
    });
    expect(gl).toBeTruthy();
    expect(gl!.kpiRef).toMatch(/^FIN-EXT-/);
    expect(gl!.responsibleRole).toBe('Kế toán tổng hợp'); // RACI thật từ nguồn

    // codeless nguồn → mã sinh tất định, vẫn canonical (dept Kế toán trưởng ∈ đợt 1)
    const chief = await owner.taskCell.findFirst({
      where: { tenantId: h01, configVersionId: null, code: { startsWith: 'FIN-CHIEF-ACCOUNTANT-T' }, deletedAt: null },
    });
    expect(chief).toBeTruthy();
    expect(chief!.kpiRef).toMatch(/^FIN-EXT-/);
    const gov = chief!.governance as { synthesized?: string[] } | null;
    expect(gov?.synthesized?.some((s) => s.includes('mã tác vụ sinh tự động'))).toBe(true);
  });
});
