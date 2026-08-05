/**
 * Integration — vá đợt Reviewer đối kháng 05/08/2026 (F191–F197).
 *
 * Sáu vé ở đây có một điểm chung đáng ghi: KHÔNG vé nào bị bắt bởi 869 ca kiểm sẵn có, bởi
 * cả sáu đều nằm ở chỗ mà chính người viết mã đã tin là mình hiểu đúng —
 *
 *   · F191 ngữ nghĩa `not` của Prisma với NULL (ghi chú trong mã khẳng định ngược lại sự thật)
 *   · F192 hai lớp bảo vệ đúng, nhưng tương tác của chúng chưa ai thử
 *   · F194 một giá trị mặc định trông vô hại (`?? cap`)
 *   · F195 hai policy PERMISSIVE bị OR — cổng thứ hai không bao giờ được hỏi tới
 *   · F196 vật hoá một-đối-một, đúng cho tới khi có dữ liệu thật
 *   · F197 `total` là số dòng của trang
 *
 * Nên spec này cố ý kiểm TRẠNG THÁI SAU CÙNG (dòng nào còn NULL, DB có nhận lệnh ghi không),
 * không kiểm "hàm có được gọi không".
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  createPrismaClient, PrismaClient, uuidv7, withTenant, withPlatformWrite,
} from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(240_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('[Reviewer 05/08] Vá F191–F197', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let steward: Ctx;   // B5 — duyệt ngoại lệ, chạy lưu trữ, đọc cờ rủi ro
  let admin: Ctx;     // tenant_admin — người XIN ngoại lệ
  let plat: Ctx;      // platform_admin — người NHẬN trong ca F192
  let auditor: Ctx;   // B0 — người nhận trong ca F194

  const fx = {
    cycleId: '', reviewWithText: '', reviewAllNull: '',
    personA: '', personB: '',
    excId: '', usedExcId: '',
  };
  const TEXT = 'Nhận xét nhận dạng được người cụ thể — phải bị khử danh';
  const REASON = 'Điều tra sự cố theo yêu cầu của khối tuân thủ, cần đọc hồ sơ trong 2 giờ';

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

  async function wipe() {
    const t = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    await owner.review.deleteMany({ where: { cycle: { name: { startsWith: 'ZZ-F191-' } } } });
    await owner.reviewCycle.deleteMany({ where: { name: { startsWith: 'ZZ-F191-' } } });
    await owner.retentionRun.deleteMany({ where: { assetCode: 'review.result' } });
    await owner.retentionPolicy.deleteMany({
      where: { tenantId: { not: null }, assetCode: 'review.result' },
    });
    await owner.riskFlag.deleteMany({ where: { sourceType: 'policy_exception' } });
    await owner.userRole.deleteMany({ where: { policyExceptionId: { not: null } } });
    await owner.policyException.deleteMany({ where: { tenantId: t!.id } });
    // CỐ Ý không dọn `audit_log`: K6 — sổ vết là append-only, và trigger chặn kể cả kết nối
    // OWNER. Lần chạy đầu của spec này ăn đúng phát đó, và đó là bằng chứng bất biến còn sống.
    // Không cần dọn: mọi khẳng định dưới đây lọc theo id ngoại lệ MỚI của chính lượt chạy này.
    await owner.featureFlag.deleteMany({ where: { key: { startsWith: 'zz_f195_' } } });
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    steward = await ctxFor('steward@');
    admin = await ctxFor('admin@');
    plat = await ctxFor('platform@');
    auditor = await ctxFor('auditor@');
    await wipe();

    const persons = await owner.person.findMany({
      where: { tenantId: steward.id, deletedAt: null }, take: 2, orderBy: { employeeCode: 'asc' },
    });
    fx.personA = persons[0].id;
    fx.personB = persons[1].id;

    const cycle = await owner.reviewCycle.create({
      data: { id: uuidv7(), tenantId: steward.id, name: 'ZZ-F191-đã chốt', period: '2018-H1', status: 'closed' },
    });
    fx.cycleId = cycle.id;
    const old = new Date('2018-01-15T00:00:00Z');

    const withText = await owner.review.create({
      data: {
        id: uuidv7(), tenantId: steward.id, cycleId: cycle.id, revieweeId: fx.personA,
        selfReflection: TEXT, managerAssessment: TEXT, strengths: TEXT,
        gaps: TEXT, developmentNeeds: TEXT, finalRationale: TEXT,
        finalRating: 'A', finalScore: 4.5, status: 'final', createdAt: old,
      },
    });
    fx.reviewWithText = withText.id;

    // ⭐ Hàng quyết định của F191: quá hạn, kỳ đã chốt, nhưng SÁU CỘT VĂN BẢN ĐỀU NULL —
    // chưa từng có gì để khử danh. Bản mã cũ vẫn kéo nó vào kế hoạch và ghi đè sáu chuỗi.
    const allNull = await owner.review.create({
      data: {
        id: uuidv7(), tenantId: steward.id, cycleId: cycle.id, revieweeId: fx.personB,
        finalRating: 'B', finalScore: 3.2, status: 'final', createdAt: old,
      },
    });
    fx.reviewAllNull = allNull.id;

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await wipe();
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════ F191 — khử danh không được đụng bản ghi vốn rỗng ═══════════

  describe('[F191] Khử danh chỉ đụng cột THỰC SỰ còn nội dung', () => {
    it('chạy thử → chạy thật: hàng có văn bản bị khử, hàng toàn NULL còn NGUYÊN NULL', async () => {
      const dry = await api().post('/api/v1/retention/dry-run/review.result').set(H(steward)).send({});
      expect(dry.status).toBe(201);
      expect(dry.body.planned).toBeGreaterThan(0);

      const applied = await api().post('/api/v1/retention/apply/review.result')
        .set(H(steward)).send({ dryRunId: dry.body.id });
      expect(applied.status).toBe(201);

      const hit = await owner.review.findUnique({ where: { id: fx.reviewWithText } });
      const untouched = await owner.review.findUnique({ where: { id: fx.reviewAllNull } });

      // Vế thuận: hàng có dữ liệu cá nhân thì phải bị khử.
      expect(hit!.selfReflection).not.toBe(TEXT);
      expect(hit!.selfReflection).toContain('khử danh');

      // Vế NGƯỢC — đây mới là F191. Sáu cột phải còn NULL, không được biến thành chuỗi
      // "[đã khử danh…]": ghi đè không đảo ngược được, và nó bịa ra một quá khứ chưa từng có
      // (đọc hồ sơ sau này sẽ tưởng ở đây từng có dữ liệu cá nhân).
      expect(untouched!.selfReflection).toBeNull();
      expect(untouched!.managerAssessment).toBeNull();
      expect(untouched!.strengths).toBeNull();
      expect(untouched!.gaps).toBeNull();
      expect(untouched!.developmentNeeds).toBeNull();
      expect(untouched!.finalRationale).toBeNull();
    });

    it('chạy lần hai KHÔNG còn gì để làm — `planned` cho hàng fixture về 0 (idempotent thật)', async () => {
      const dry = await api().post('/api/v1/retention/dry-run/review.result').set(H(steward)).send({});
      expect(dry.status).toBe(201);
      // Không khẳng định planned === 0 cho toàn đơn vị (dữ liệu seed khác có thể còn), mà
      // khẳng định đúng phần thuộc về ca kiểm này: hai hàng fixture đều không còn trong phạm vi.
      const still = await owner.review.count({
        where: {
          id: { in: [fx.reviewWithText, fx.reviewAllNull] },
          OR: [
            { selfReflection: { not: null, notIn: ['[đã khử danh theo chính sách lưu trữ]'] } },
            { managerAssessment: { not: null, notIn: ['[đã khử danh theo chính sách lưu trữ]'] } },
          ],
        },
      });
      expect(still).toBe(0);
    });
  });

  // ═══════════ F194 + F192 — giờ ngoại lệ và cảnh báo tự khoá ═══════════

  describe('[F194] Duyệt không nêu giờ = cấp đúng số giờ ĐỀ NGHỊ, không phải trần', () => {
    it('xin 2 giờ, duyệt không truyền `hours` ⇒ được đúng 2 giờ', async () => {
      const req = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: auditor.userId, permissionCode: 'person:read',
        reason: REASON, requestedHours: 2,
      });
      expect(req.status).toBe(201);
      fx.excId = req.body.id;

      // Người duyệt nhìn thấy con số đề nghị NGAY trên hàng chờ — trước đây nó chỉ nằm trong
      // `audit_log`, mà `data_steward` cố ý không có quyền đọc sổ vết (J3).
      const list = await api().get('/api/v1/policy-exceptions?status=pending').set(H(steward));
      const row = list.body.entries.find((e: any) => e.id === fx.excId);
      expect(row.requestedHours).toBe(2);

      const dec = await api().post(`/api/v1/policy-exceptions/${fx.excId}/decide`)
        .set(H(steward)).send({ approve: true });
      expect(dec.status).toBe(201);
      expect(dec.body.hours).toBe(2);          // KHÔNG phải 72
      expect(dec.body.requestedHours).toBe(2);
    });

    it('người duyệt vẫn cấp được số giờ khác — nhưng phải NÓI RA con số đó', async () => {
      const req = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: auditor.userId, permissionCode: 'review:read',
        reason: REASON, requestedHours: 8,
      });
      const dec = await api().post(`/api/v1/policy-exceptions/${req.body.id}/decide`)
        .set(H(steward)).send({ approve: true, hours: 1 });
      expect(dec.body.hours).toBe(1);
    });
  });

  describe('[F192] Bề mặt nền tảng tự khoá — phải được cảnh báo TRƯỚC và giải thích ĐÚNG', () => {
    it('xin quyền cho tài khoản nền tảng ⇒ cảnh báo ngay lúc nộp đơn VÀ lúc duyệt', async () => {
      const req = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: plat.userId, permissionCode: 'person:read',
        reason: REASON, requestedHours: 2,
      });
      expect(req.status).toBe(201);
      expect(String(req.body.warning ?? '')).toContain('/platform/*');
      fx.usedExcId = req.body.id;

      const dec = await api().post(`/api/v1/policy-exceptions/${fx.usedExcId}/decide`)
        .set(H(steward)).send({ approve: true });
      expect(dec.status).toBe(201);
      expect(String(dec.body.warning ?? '')).toContain('CẢNH BÁO');
    });

    it('sau khi duyệt, /platform/tenants trả 409 NÓI ĐÚNG nguyên nhân và cách gỡ', async () => {
      const r = await api().get('/api/v1/platform/tenants').set(H(plat));
      expect(r.status).toBe(409);
      const msg = String(r.body?.error?.message ?? '');
      // Câu cũ ("rà lại vai trong DB") dẫn người vận hành đi tìm một thứ không tồn tại — vai
      // tạm là hợp lệ, không ai cấp sai cả.
      expect(msg).toContain('TỰ KHOÁ');
      expect(msg).toContain('revoke');
      expect(msg).not.toContain('Rà lại vai trong DB');
    });

    it('thu hồi ngoại lệ ⇒ bề mặt nền tảng mở lại NGAY, không phải chờ hết hạn', async () => {
      const rev = await api().post(`/api/v1/policy-exceptions/${fx.usedExcId}/revoke`)
        .set(H(steward)).send({ note: 'Điều tra xong' });
      expect(rev.status).toBe(201);
      const r = await api().get('/api/v1/platform/tenants').set(H(plat));
      expect(r.status).toBe(200);
    });
  });

  // ═══════════ F196 + F197 — cờ rủi ro gom theo đơn, và `total` thật ═══════════

  describe('[F196] Nhiều lượt DÙNG một ngoại lệ ⇒ đúng MỘT cờ rủi ro', () => {
    it('ba dòng vết `policy.exception_used` cùng một đơn chỉ sinh một cờ', async () => {
      for (let i = 0; i < 3; i += 1) {
        await owner.auditLog.create({
          data: {
            tenantId: steward.id, actorUserId: auditor.userId,
            action: 'policy.exception_used', entityType: 'policy_exception', entityId: fx.excId,
            after: { route: `GET /persons?page=${i}` } as object,
          },
        });
      }
      // Bộ sinh chạy trong đường ĐỌC — gọi API là đủ, không có job nào phải kích hoạt.
      const r = await api().get('/api/v1/risk?limit=500').set(H(steward));
      expect(r.status).toBe(200);
      const mine = r.body.entries.filter(
        (e: any) => e.source.type === 'policy_exception' && e.source.ref === fx.excId,
      );
      expect(mine).toHaveLength(1);

      // Và khoá chống trùng nằm ở DB, không ở bộ nhớ: đọc lại lần nữa vẫn đúng một.
      const again = await api().get('/api/v1/risk?limit=500').set(H(steward));
      expect(again.body.entries.filter(
        (e: any) => e.source.type === 'policy_exception' && e.source.ref === fx.excId,
      )).toHaveLength(1);
    });
  });

  describe('[F197] `total` là số đếm THẬT, không phải số dòng của trang', () => {
    it('`limit=1` ⇒ returned = 1, total ≥ số cờ có thật, `capped` = true', async () => {
      const all = await api().get('/api/v1/risk?limit=500').set(H(steward));
      const realCount = all.body.total;
      expect(all.body.returned).toBe(all.body.entries.length);

      const one = await api().get('/api/v1/risk?limit=1').set(H(steward));
      expect(one.body.entries).toHaveLength(1);
      expect(one.body.returned).toBe(1);
      expect(one.body.total).toBe(realCount);     // KHÔNG phải 1
      expect(one.body.capped).toBe(true);
    });

    it('bộ lọc thu hẹp thì `total` phải giảm theo — total gắn với ĐIỀU KIỆN LỌC, không phải trang', async () => {
      const all = await api().get('/api/v1/risk?limit=500').set(H(steward));
      const low = await api().get('/api/v1/risk?severity=low&limit=500').set(H(steward));
      expect(low.body.total).toBeLessThanOrEqual(all.body.total);
      expect(low.body.entries.every((e: any) => e.severity === 'low')).toBe(true);
      expect(low.body.total).toBe(low.body.entries.length); // dưới trần ⇒ hai số trùng nhau
    });

    it('sổ ngoại lệ và sổ lượt chạy lưu trữ cũng trả đủ bộ ba total/returned/capped', async () => {
      const exc = await api().get('/api/v1/policy-exceptions').set(H(steward));
      expect(typeof exc.body.total).toBe('number');
      expect(exc.body.returned).toBe(exc.body.entries.length);
      expect(exc.body.capped).toBe(false);

      const runs = await api().get('/api/v1/retention/runs').set(H(steward));
      expect(runs.body.returned).toBe(runs.body.entries.length);
      expect(runs.body.total).toBeGreaterThanOrEqual(runs.body.returned);
    });
  });

  // ═══════════ F195 — cổng GUC ở tầng cơ sở dữ liệu ═══════════

  describe('[F195] Ghi `feature_flag` phải đi qua `withPlatformWrite`, DB tự chặn', () => {
    let appClient: PrismaClient;
    beforeAll(() => { appClient = createPrismaClient(process.env.DATABASE_URL); });
    afterAll(async () => { await appClient?.$disconnect(); });

    it('ghi cờ TOÀN CỤC ngoài cổng ⇒ DB từ chối (trước bản vá: lọt)', async () => {
      await expect(
        withTenant(appClient, steward.id, (tx) =>
          tx.featureFlag.create({
            data: { id: uuidv7(), tenantId: null, key: 'zz_f195_global', enabled: true },
          })),
      ).rejects.toThrow();
      expect(await owner.featureFlag.count({ where: { key: 'zz_f195_global' } })).toBe(0);
    });

    it('ghi cờ CỦA ĐƠN VỊ ngoài cổng cũng bị chặn — không có đường vòng qua tenant_id', async () => {
      await expect(
        withTenant(appClient, steward.id, (tx) =>
          tx.featureFlag.create({
            data: { id: uuidv7(), tenantId: steward.id, key: 'zz_f195_tenant', enabled: true },
          })),
      ).rejects.toThrow();
      expect(await owner.featureFlag.count({ where: { key: 'zz_f195_tenant' } })).toBe(0);
    });

    it('cùng lệnh đó QUA cổng thì chạy được — chốt chặn không phải là cấm tiệt', async () => {
      await withPlatformWrite(appClient, (tx) =>
        tx.featureFlag.create({
          data: { id: uuidv7(), tenantId: null, key: 'zz_f195_ok', enabled: false },
        }));
      expect(await owner.featureFlag.count({ where: { key: 'zz_f195_ok' } })).toBe(1);
    });

    it('SỬA cờ ngoài cổng cũng bị chặn (không chỉ INSERT)', async () => {
      const flag = await owner.featureFlag.findFirst({ where: { key: 'zz_f195_ok' } });
      await expect(
        withTenant(appClient, steward.id, (tx) =>
          tx.featureFlag.update({ where: { id: flag!.id }, data: { enabled: true } })),
      ).rejects.toThrow();
      const after = await owner.featureFlag.findFirst({ where: { key: 'zz_f195_ok' } });
      expect(after!.enabled).toBe(false);
    });
  });
});
