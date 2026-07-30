/**
 * Integration [Trục C L0] Sổ đăng ký dữ liệu — `/data-catalog`.
 *
 * Trọng tâm, đúng cổng ra mà kế hoạch trục C đòi ở L0:
 *  - mọi đường xuất dữ liệu tra được nhóm + mức phân loại của mã
 *  - đơn vị chỉ SIẾT CHẶT được, không nới lỏng — kiểm CẢ ở service (422 đọc được) lẫn ở
 *    TRIGGER DB (đường ghi trực tiếp, bỏ qua service, vẫn bị chặn)
 *  - phân quyền: đọc rộng cho vai quản trị, ghi CHỈ data_steward
 *  - mã chưa đăng ký ⇒ 404 fail-closed, KHÔNG mặc định về 'internal'
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string }

describe('[Trục C L0] Sổ đăng ký dữ liệu', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;    // tenant_admin — có datacatalog:read, KHÔNG có :write
  let steward: Ctx;  // data_steward — vai DUY NHẤT có :write
  let emp: Ctx;      // employee — không có quyền nào với sổ
  let t2admin: Ctx;

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    if (!user) throw new Error(`User ${emailPrefix} @ ${tenantCode} chưa seed`);
    const token = jwt.sign(
      { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user.id };
  }

  const H = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    admin = await ctxFor('H.01', 'admin@');
    steward = await ctxFor('H.01', 'steward@');
    emp = await ctxFor('H.01', 'emp1@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    // dọn mọi bản riêng của đơn vị do test tạo — trả DB về trạng thái seed
    await owner.dataAsset.deleteMany({ where: { tenantId: { not: null } } });
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══ đọc ═══
  it('bản chuẩn cấp tập đoàn có đủ 9 nhóm dữ liệu, mọi dòng đều có chủ dữ liệu', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/data-catalog').set(H(admin)).expect(200);
    expect(r.body.entries.length).toBeGreaterThanOrEqual(9);
    for (const e of r.body.entries) {
      expect(e.ownerRole).toBeTruthy();
      expect(['public', 'internal', 'confidential', 'restricted']).toContain(e.classification);
    }
  });

  it('mức phân loại của các nhóm nhạy cảm đúng như BRD §12', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/data-catalog').set(H(admin)).expect(200);
    const byCode = Object.fromEntries(r.body.entries.map((e: any) => [e.code, e]));
    expect(byCode['payroll.reward'].classification).toBe('restricted');
    expect(byCode['opco.operational'].classification).toBe('restricted');
    expect(byCode['review.result'].classification).toBe('confidential');
    expect(byCode['audit.log'].classification).toBe('confidential');
    expect(byCode['objective.kpi'].classification).toBe('internal');
  });

  it('tra một mã trả về mức hiệu lực + chủ dữ liệu', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/data-catalog/review.result').set(H(admin)).expect(200);
    expect(r.body).toMatchObject({ code: 'review.result', classification: 'confidential', scope: 'global' });
  });

  it('mã CHƯA đăng ký → 404 fail-closed (KHÔNG mặc định về internal)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/data-catalog/khong.ton.tai').set(H(admin)).expect(404);
  });

  // ═══ phân quyền ═══
  it('employee KHÔNG đọc được sổ (không có việc gì với nó)', async () => {
    await request(app.getHttpServer()).get('/api/v1/data-catalog').set(H(emp)).expect(403);
  });

  it('tenant_admin đọc được nhưng KHÔNG ghi được — :write chỉ của data_steward', async () => {
    await request(app.getHttpServer()).get('/api/v1/data-catalog').set(H(admin)).expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/data-catalog/objective.kpi').set(H(admin))
      .send({ classification: 'confidential' })
      .expect(403);
  });

  // ═══ siết chặt / nới lỏng ═══
  it('data_steward SIẾT CHẶT được: objective.kpi internal → confidential', async () => {
    const r = await request(app.getHttpServer())
      .put('/api/v1/data-catalog/objective.kpi').set(H(steward))
      .send({ classification: 'confidential' })
      .expect(200);
    expect(r.body).toMatchObject({ classification: 'confidential', scope: 'tenant' });

    const after = await request(app.getHttpServer())
      .get('/api/v1/data-catalog/objective.kpi').set(H(admin)).expect(200);
    expect(after.body).toMatchObject({ classification: 'confidential', scope: 'tenant' });
  });

  it('KHÔNG nới lỏng được: payroll.reward restricted → internal bị chặn ở service (422)', async () => {
    const r = await request(app.getHttpServer())
      .put('/api/v1/data-catalog/payroll.reward').set(H(steward))
      .send({ classification: 'internal' })
      .expect(422);
    expect(String(r.body?.error?.message ?? '')).toContain('siết chặt');
  });

  it('mức phân loại lạ → 422, không lọt vào DB', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/data-catalog/objective.kpi').set(H(steward))
      .send({ classification: 'top-secret' })
      .expect(422);
  });

  /**
   * Ca quan trọng nhất của lát: chặn ở service là chưa đủ. Đường ghi TRỰC TIẾP vào bảng —
   * một endpoint mới thêm sau này, một script vá dữ liệu, một job — phải bị TRIGGER DB chặn.
   * Bỏ lớp này nghĩa là một đơn vị tự hạ dữ liệu lương xuống 'internal' rồi đẩy ra AI ngoài.
   */
  it('TRIGGER DB chặn nới lỏng kể cả khi ghi thẳng vào bảng, bỏ qua service', async () => {
    await expect(
      owner.dataAsset.create({
        data: {
          id: uuidv7(), tenantId: admin.id, code: 'payroll.reward',
          groupName: 'Lương thưởng (ca thử trigger)', ownerRole: 'B1',
          classification: 'internal',
        },
      }),
    ).rejects.toThrow(/siết chặt hơn bản chuẩn/);
  });

  it('TRIGGER DB cho phép siết chặt (đối chứng: không chặn oan)', async () => {
    const row = await owner.dataAsset.create({
      data: {
        id: uuidv7(), tenantId: admin.id, code: 'system.log',
        groupName: 'Nhật ký (ca đối chứng)', ownerRole: 'B3',
        classification: 'confidential',   // chuẩn là 'internal' — siết lên, hợp lệ
      },
    });
    expect(row.classification).toBe('confidential');
    await owner.dataAsset.delete({ where: { id: row.id } });
  });

  it('CHECK constraint chặn mức không nằm trong 4 mức chuẩn', async () => {
    await expect(
      owner.dataAsset.create({
        data: {
          id: uuidv7(), tenantId: admin.id, code: 'test.badclass',
          groupName: 'x', ownerRole: 'B3', classification: 'secret',
        },
      }),
    ).rejects.toThrow();
  });

  // ═══ cô lập tenant ═══
  it('bản riêng của H.01 KHÔNG lộ sang T2 — T2 vẫn thấy bản chuẩn', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/data-catalog/task.dictionary').set(H(steward))
      .send({ classification: 'restricted' })
      .expect(200);

    const t2 = await request(app.getHttpServer())
      .get('/api/v1/data-catalog/task.dictionary').set(H(t2admin)).expect(200);
    expect(t2.body).toMatchObject({ classification: 'internal', scope: 'global' });
  });

  it('không rỗng — chống "assert chạy 0 lần"', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/data-catalog').set(H(admin)).expect(200);
    expect(r.body.total).toBeGreaterThan(0);
  });
});
