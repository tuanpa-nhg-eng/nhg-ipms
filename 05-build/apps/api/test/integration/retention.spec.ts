/**
 * Integration [Trục C — L5] Thời hạn lưu trữ & xoá dữ liệu cá nhân (NĐ13).
 *
 * Cổng ra của kế hoạch §4 L5:
 *   "chạy thử trên dữ liệu seed cho danh sách đúng; chạy thật trên dữ liệu thử xoá đúng phạm
 *    vi; `audit_log` còn nguyên vẹn; bản ghi thuộc kỳ chưa chốt không bị đụng."
 *
 * Đây là lát duy nhất của trục có khả năng PHÁ HUỶ dữ liệu, nên spec này dựng dữ liệu THẬT của
 * riêng nó (một kỳ đã chốt + một kỳ đang mở, mỗi kỳ một review có văn bản tự do), chạy thật
 * lên đó, rồi kiểm từng bản ghi một: cái phải mất thì mất, cái phải còn thì còn NGUYÊN VĂN.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(240_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('[Trục C L5] Lưu trữ & xoá dữ liệu cá nhân', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let steward: Ctx;   // B5 — đặt chính sách + chạy
  let auditor: Ctx;   // B0 — chỉ đọc
  let admin: Ctx;     // tenant_admin — không dính gì tới lưu trữ (ca đối chứng 403)

  /** Dữ liệu dựng riêng cho spec — xoá sạch trước VÀ sau (bài học L1). */
  const fixture = {
    closedCycleId: '', openCycleId: '',
    oldReviewClosed: '', oldReviewOpen: '', freshReviewClosed: '',
    personId: '',
  };
  const LONG_TEXT = 'Nhận xét chi tiết có thể nhận dạng người cụ thể — phải bị khử danh';

  async function ctxFor(prefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: prefix } },
    });
    if (!user) throw new Error(`User ${prefix} chưa seed`);
    const token = jwt.sign(
      { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user.id, email: user.email };
  }

  const H = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  async function wipeFixture() {
    await owner.review.deleteMany({ where: { id: { in: [fixture.oldReviewClosed, fixture.oldReviewOpen, fixture.freshReviewClosed].filter(Boolean) } } });
    await owner.reviewCycle.deleteMany({ where: { name: { startsWith: 'ZZ-L5-' } } });
    await owner.retentionRun.deleteMany({ where: { assetCode: { in: ['review.result', 'system.log'] } } });
    await owner.retentionPolicy.deleteMany({ where: { tenantId: { not: null }, assetCode: { in: ['review.result', 'system.log'] } } });
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    steward = await ctxFor('steward@');
    auditor = await ctxFor('auditor@');
    admin = await ctxFor('admin@');
    await wipeFixture();

    // BA người khác nhau: `review` có UNIQUE (tenant, cycle, reviewee) nên hai review cùng
    // kỳ + cùng người là hàng không tồn tại được. Bắt được ngay lần chạy đầu — và đó là một
    // ràng buộc ĐÚNG của sản phẩm (một người một phiếu mỗi kỳ), không phải chỗ cần nới.
    const persons = await owner.person.findMany({
      where: { tenantId: steward.id, deletedAt: null }, take: 3, orderBy: { employeeCode: 'asc' },
    });
    if (persons.length < 3) throw new Error('Cần ≥3 person trong H.01 để dựng fixture');
    fixture.personId = persons[0].id;

    // Hai kỳ: một ĐÃ CHỐT, một ĐANG MỞ — khác biệt duy nhất là `status`.
    const closed = await owner.reviewCycle.create({
      data: {
        id: uuidv7(), tenantId: steward.id, name: 'ZZ-L5-đã chốt', period: '2019-H1', status: 'closed',
      },
    });
    const open = await owner.reviewCycle.create({
      data: {
        id: uuidv7(), tenantId: steward.id, name: 'ZZ-L5-đang mở', period: '2019-H2', status: 'open',
      },
    });
    fixture.closedCycleId = closed.id;
    fixture.openCycleId = open.id;

    const old = new Date('2019-01-15T00:00:00Z');   // quá hạn 60 tháng
    const mk = async (cycleId: string, createdAt: Date, revieweeId: string) => {
      const r = await owner.review.create({
        data: {
          id: uuidv7(), tenantId: steward.id, cycleId, revieweeId,
          selfReflection: LONG_TEXT, managerAssessment: LONG_TEXT,
          strengths: LONG_TEXT, gaps: LONG_TEXT, developmentNeeds: LONG_TEXT,
          finalRationale: LONG_TEXT, finalRating: 'A', finalScore: 4.5,
          status: 'final', createdAt,
        },
      });
      return r.id;
    };
    fixture.oldReviewClosed = await mk(closed.id, old, persons[0].id);        // phải bị khử danh
    fixture.oldReviewOpen = await mk(open.id, old, persons[1].id);            // [K7] phải CÒN NGUYÊN
    fixture.freshReviewClosed = await mk(closed.id, new Date(), persons[2].id); // chưa quá hạn → còn nguyên

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await wipeFixture();
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════ ① Chính sách ═══════════

  describe('Chính sách lưu trữ', () => {
    it('chuẩn tập đoàn có sẵn, mỗi mã dữ liệu tra được thời hạn + nguồn chính sách', async () => {
      const r = await api().get('/api/v1/retention/policies').set(H(steward));
      expect(r.status).toBe(200);
      const byCode = Object.fromEntries(r.body.entries.map((e: any) => [e.assetCode, e]));
      expect(byCode['review.result'].retentionMonths).toBe(60);
      expect(byCode['review.result'].action).toBe('anonymize');
      expect(byCode['review.result'].source).toBe('chuẩn tập đoàn');
      expect(byCode['system.log'].retentionMonths).toBe(24);
      // mã chưa có chính sách riêng → suy từ mức phân loại, và NÓI RÕ là suy diễn
      expect(byCode['finance.metric'].source).toContain('mặc định');
    });

    it('[K6] hai sổ giám sát được đánh dấu bất khả xâm phạm', async () => {
      const r = await api().get('/api/v1/retention/policies').set(H(steward));
      const audit = r.body.entries.find((e: any) => e.assetCode === 'audit.log');
      expect(audit.untouchable).toBe(true);
      expect(['cold_archive', 'keep']).toContain(audit.action);
    });

    it('[K6] KHÔNG đặt được chính sách xoá cho `audit.log` — 422, kể cả B5', async () => {
      const r = await api().put('/api/v1/retention/policies/audit.log').set(H(steward))
        .send({ retentionMonths: 12, action: 'hard_delete' });
      expect(r.status).toBe(422);
      expect(String(r.body?.error?.message ?? '')).toContain('K6');
    });

    it('[K6 — tầng DB] chèn thẳng chính sách xoá sổ vết vào DB cũng bị chặn', async () => {
      await expect(
        owner.retentionPolicy.create({
          data: {
            id: uuidv7(), tenantId: steward.id, assetCode: 'export.log',
            retentionMonths: 6, action: 'hard_delete',
          },
        }),
      ).rejects.toThrow();
    });

    it('đơn vị RÚT NGẮN được thời hạn (60 → 36 tháng)', async () => {
      const r = await api().put('/api/v1/retention/policies/review.result').set(H(steward))
        .send({ retentionMonths: 36, action: 'anonymize', note: 'Đơn vị siết chặt hơn chuẩn' });
      expect(r.status).toBe(200);
      const list = await api().get('/api/v1/retention/policies').set(H(steward));
      const eff = list.body.entries.find((e: any) => e.assetCode === 'review.result');
      expect(eff.retentionMonths).toBe(36);
      expect(eff.source).toBe('đơn vị');
      expect(eff.groupStandardMonths).toBe(60);
    });

    it('đơn vị KHÔNG kéo dài được (36 → 120 tháng) — trigger DB chặn', async () => {
      const r = await api().put('/api/v1/retention/policies/review.result').set(H(steward))
        .send({ retentionMonths: 120, action: 'anonymize' });
      expect(r.status).toBeGreaterThanOrEqual(400);
      const list = await api().get('/api/v1/retention/policies').set(H(steward));
      expect(list.body.entries.find((e: any) => e.assetCode === 'review.result').retentionMonths).toBe(36);
    });

    it('hành động không khớp bộ thực thi bị từ chối (xoá cứng kết quả đánh giá) — 422', async () => {
      const r = await api().put('/api/v1/retention/policies/review.result').set(H(steward))
        .send({ retentionMonths: 36, action: 'hard_delete' });
      expect(r.status).toBe(422);
      expect(String(r.body?.error?.message ?? '')).toContain('anonymize');
    });

    it('[SoD] B0 đọc được chính sách nhưng KHÔNG đặt được; tenant_admin không đọc được', async () => {
      expect((await api().get('/api/v1/retention/policies').set(H(auditor))).status).toBe(200);
      const w = await api().put('/api/v1/retention/policies/system.log').set(H(auditor))
        .send({ retentionMonths: 12, action: 'hard_delete' });
      expect(w.status).toBe(403);
      expect((await api().get('/api/v1/retention/policies').set(H(admin))).status).toBe(403);
    });
  });

  // ═══════════ ② Chạy thử bắt buộc trước ═══════════

  describe('[CỔNG RA] Chạy thử → chạy thật', () => {
    let dryRunId: string;

    it('chạy thật KHÔNG đi qua chạy thử → chặn (dryRunId là bắt buộc ở DTO)', async () => {
      const r = await api().post('/api/v1/retention/apply/review.result').set(H(steward)).send({});
      expect(r.status).toBe(400);
    });

    it('chạy thật với dryRunId bịa → 422, không đụng dữ liệu', async () => {
      const before = await owner.review.findUniqueOrThrow({ where: { id: fixture.oldReviewClosed } });
      const r = await api().post('/api/v1/retention/apply/review.result').set(H(steward))
        .send({ dryRunId: '00000000-0000-0000-0000-000000000000' });
      expect(r.status).toBe(422);
      const after = await owner.review.findUniqueOrThrow({ where: { id: fixture.oldReviewClosed } });
      expect(after.selfReflection).toBe(before.selfReflection);
    });

    it('chạy thử: đếm ĐÚNG phạm vi và ĐẾM RIÊNG phần bị bảo vệ (K7), không đụng dữ liệu', async () => {
      const r = await api().post('/api/v1/retention/dry-run/review.result').set(H(steward)).send({});
      expect(r.status).toBe(201);
      dryRunId = r.body.id;
      expect(r.body.mode).toBe('dry_run');
      expect(r.body.planned).toBeGreaterThanOrEqual(1);
      // [K7] review của kỳ ĐANG MỞ phải nằm ở cột "bỏ qua vì được bảo vệ", không nằm trong kế hoạch
      expect(r.body.skippedProtected).toBeGreaterThanOrEqual(1);
      expect(r.body.affected).toBe(0);
      expect(String(r.body.report.protection)).toContain('K7');

      // và dữ liệu còn nguyên vẹn sau lượt thử
      const row = await owner.review.findUniqueOrThrow({ where: { id: fixture.oldReviewClosed } });
      expect(row.selfReflection).toBe(LONG_TEXT);
    });

    it('chạy thật: khử danh ĐÚNG bản ghi quá hạn thuộc kỳ ĐÃ CHỐT', async () => {
      const r = await api().post('/api/v1/retention/apply/review.result').set(H(steward))
        .send({ dryRunId });
      expect(r.status).toBe(201);
      expect(r.body.affected).toBeGreaterThanOrEqual(1);

      const done = await owner.review.findUniqueOrThrow({ where: { id: fixture.oldReviewClosed } });
      expect(done.selfReflection).toContain('khử danh');
      expect(done.managerAssessment).toContain('khử danh');
      expect(done.finalRationale).toContain('khử danh');
      // Số liệu thống kê GIỮ NGUYÊN — khử danh không phải xoá bản ghi
      expect(done.finalRating).toBe('A');
      expect(Number(done.finalScore)).toBe(4.5);
    });

    it('[K7] review của kỳ CHƯA CHỐT còn NGUYÊN VĂN — không bị đụng một chữ', async () => {
      const protectedRow = await owner.review.findUniqueOrThrow({ where: { id: fixture.oldReviewOpen } });
      expect(protectedRow.selfReflection).toBe(LONG_TEXT);
      expect(protectedRow.managerAssessment).toBe(LONG_TEXT);
    });

    it('review CHƯA quá hạn (kỳ đã chốt) cũng còn nguyên — mốc cắt tính đúng', async () => {
      const fresh = await owner.review.findUniqueOrThrow({ where: { id: fixture.freshReviewClosed } });
      expect(fresh.selfReflection).toBe(LONG_TEXT);
    });

    /**
     * [Lỗi tự bắt] Bản đầu lọc "còn thứ để khử" bằng `IS NOT NULL`, mà khử danh GHI ĐÈ một
     * chuỗi — nên hàng đã xử lý vẫn lọt vào kế hoạch lượt sau: báo cáo luôn còn việc phải làm
     * và `affected` phồng lên mỗi lượt. Ca này đóng đinh tính idempotent.
     */
    it('chạy lần hai KHÔNG còn gì để làm — job idempotent, báo cáo không nói dối', async () => {
      const r = await api().post('/api/v1/retention/dry-run/review.result').set(H(steward)).send({});
      expect(r.status).toBe(201);
      expect(r.body.planned).toBe(0);
      // phần được bảo vệ vẫn phải hiện ra: 0 ở đây nghĩa là phép lọc K7 hỏng, không phải xong việc
      expect(r.body.skippedProtected).toBeGreaterThanOrEqual(1);
    });

    it('[K6] `audit_log` còn NGUYÊN VẸN sau lượt chạy thật', async () => {
      // Đếm trước/sau một lượt chạy nữa: sổ vết chỉ được PHÌNH ra (chính lượt chạy ghi vết),
      // không bao giờ co lại.
      const before = await owner.auditLog.count({ where: { tenantId: steward.id } });
      const dry = await api().post('/api/v1/retention/dry-run/review.result').set(H(steward)).send({});
      await api().post('/api/v1/retention/apply/review.result').set(H(steward))
        .send({ dryRunId: dry.body.id });
      const after = await owner.auditLog.count({ where: { tenantId: steward.id } });
      expect(after).toBeGreaterThan(before);
    });

    it('dùng lại một lượt thử CŨ khi kế hoạch đã đổi → 409, bắt chạy thử lại', async () => {
      // `dryRunId` ở trên được lập khi còn 1 bản ghi trong phạm vi; sau khi đã khử danh, kế
      // hoạch mới có 0 bản ghi ⇒ vân tay khác ⇒ phải từ chối.
      const r = await api().post('/api/v1/retention/apply/review.result').set(H(steward))
        .send({ dryRunId });
      expect(r.status).toBe(409);
      expect(String(r.body?.error?.message ?? '')).toContain('chạy thử lại');
    });

    it('sổ lượt chạy ghi đủ: chế độ, mốc cắt, số hoạch định, số tác động, số bị bảo vệ, người chạy', async () => {
      const r = await api().get('/api/v1/retention/runs?asset=review.result').set(H(auditor));
      expect(r.status).toBe(200);
      const applied = r.body.entries.find((e: any) => e.mode === 'apply');
      expect(applied).toBeDefined();
      expect(applied.actor.email).toBe(steward.email);
      expect(applied.dryRunId).not.toBeNull();
      expect(applied.retentionMonths).toBe(36);
      expect(applied.cutoffAt).toBeTruthy();
      expect(applied.skippedProtected).toBeGreaterThanOrEqual(1);
    });

    it('[K6] không chạy được lượt quét nào cho `audit.log` — 422 nói rõ lý do', async () => {
      const r = await api().post('/api/v1/retention/dry-run/audit.log').set(H(steward)).send({});
      expect(r.status).toBe(422);
      expect(String(r.body?.error?.message ?? '')).toContain('K6');
    });

    it('mã có chính sách nhưng CHƯA có bộ thực thi → nói thẳng "chưa hỗ trợ", không im lặng', async () => {
      // `hr.profile` có chính sách chuẩn tập đoàn (keep) — đổi sang anonymize để lộ đúng nhánh
      // "không có executor" thay vì nhánh "keep".
      const set = await api().put('/api/v1/retention/policies/hr.profile').set(H(steward))
        .send({ retentionMonths: 60, action: 'anonymize' });
      expect(set.status).toBe(200);
      try {
        const r = await api().post('/api/v1/retention/dry-run/hr.profile').set(H(steward)).send({});
        expect(r.status).toBe(422);
        expect(String(r.body?.error?.message ?? '').toLowerCase()).toContain('chưa có bộ thực thi');
      } finally {
        await owner.retentionPolicy.deleteMany({ where: { tenantId: steward.id, assetCode: 'hr.profile' } });
      }
    });

    it('`cold_archive` báo CHƯA THỰC THI ĐƯỢC thay vì trả về 0 bản ghi', async () => {
      const set = await api().put('/api/v1/retention/policies/task.dictionary').set(H(steward))
        .send({ retentionMonths: 24, action: 'cold_archive' });
      expect(set.status).toBe(200);
      try {
        const r = await api().post('/api/v1/retention/dry-run/task.dictionary').set(H(steward)).send({});
        expect(r.status).toBe(422);
        expect(String(r.body?.error?.message ?? '')).toContain('CHƯA THỰC THI');
      } finally {
        await owner.retentionPolicy.deleteMany({ where: { tenantId: steward.id, assetCode: 'task.dictionary' } });
      }
    });

    it('[SoD] B0 KHÔNG bấm chạy được (chỉ đọc sổ)', async () => {
      const r = await api().post('/api/v1/retention/dry-run/system.log').set(H(auditor)).send({});
      expect(r.status).toBe(403);
    });
  });

  // ═══════════ ③ Cổng xoá — chỉ mở trong một lượt lưu trữ ═══════════

  /**
   * [Tự bắt khi chạy driver] `ipms_app` không có DELETE trên `ai_interaction` (nhật ký chỉ
   * thêm). L5 cần xoá thật, nên quyền được cấp — nhưng chốt sau GUC `app.retention_run` mà
   * trong mã chỉ `withRetention` bật. Ca này chứng minh cánh cửa đó HẸP: cùng một lệnh xoá,
   * chạy ngoài đường lưu trữ thì bị chặn.
   */
  it('[cổng xoá] xoá `ai_interaction` NGOÀI một lượt lưu trữ bị chặn ở tầng DB', async () => {
    const app0 = createPrismaClient(process.env.DATABASE_URL);
    const before = await owner.aiInteraction.count();
    expect(before).toBeGreaterThan(0);   // chống "assert chạy 0 lần": phải có gì đó để xoá
    try {
      // Mốc phải KHỚP dòng có thật: `deleteMany` khớp 0 dòng thì trigger BEFORE DELETE không
      // chạy lần nào và lệnh "thành công" — test sẽ xanh mà chẳng chứng minh gì (đúng lỗi đã
      // mắc ở lần chạy đầu với mốc 2000-01-01).
      await expect(
        app0.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${steward.id}, true)`;
          return tx.aiInteraction.deleteMany({ where: { at: { lt: new Date() } } });
        }),
      ).rejects.toThrow();
    } finally {
      await app0.$disconnect();
    }
    // Bằng chứng thật sự: KHÔNG một dòng nào mất. Thông báo lỗi có thể đổi theo phiên bản
    // Prisma, số dòng thì không.
    expect(await owner.aiInteraction.count()).toBe(before);
  });

  // ═══════════ ④ Hồ sơ lượt chạy không sửa lại được ═══════════

  it('hồ sơ một lượt chạy KHÔNG sửa lại được (trigger DB)', async () => {
    // [Lỗi tự bắt khi chạy FULL SUITE] Bản đầu lấy `findFirstOrThrow` rồi gán `mode: 'dry_run'`.
    // Chạy riêng spec này thì dòng đầu tình cờ là `apply` ⇒ có thay đổi ⇒ trigger chặn ⇒ xanh.
    // Chạy full suite thì thứ tự khác, dòng đầu là `dry_run` ⇒ gán đúng giá trị cũ ⇒ KHÔNG có
    // thay đổi nào ⇒ trigger không phản đối ⇒ đỏ. Test bất định theo thứ tự dữ liệu là test
    // không nói lên điều gì: phải chọn ĐÍCH DANH dòng và đổi sang giá trị THỰC SỰ KHÁC.
    const run = await owner.retentionRun.findFirstOrThrow({
      where: { tenantId: steward.id, assetCode: 'review.result', mode: 'dry_run' },
    });
    await expect(
      owner.retentionRun.update({ where: { id: run.id }, data: { mode: 'apply' } }),
    ).rejects.toThrow(/không sửa lại được/);
    await expect(
      owner.retentionRun.update({ where: { id: run.id }, data: { planHash: 'giả mạo' } }),
    ).rejects.toThrow(/không sửa lại được/);
  });
});
