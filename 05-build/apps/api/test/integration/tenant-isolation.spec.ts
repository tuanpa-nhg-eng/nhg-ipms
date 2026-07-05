/**
 * BÀI TEST BẮT BUỘC (Hiến pháp #1): rò rỉ cross-tenant = lỗi chặn phát hành.
 *
 * Yêu cầu môi trường: Postgres đã migrate + seed (tenant H.01 & T2.TEST).
 *   DATABASE_URL       = ipms_app (RLS enforce)
 *   OWNER_DATABASE_URL = ipms_owner (setup/verify)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(60_000);

describe('Tenant isolation (RLS + guards)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let appDb: PrismaClient;
  let h01: { id: string; token: string };
  let t2: { id: string; token: string };

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    appDb = createPrismaClient(process.env.DATABASE_URL);

    async function ctxFor(code: string) {
      const tenant = await owner.tenant.findUnique({ where: { code } });
      if (!tenant) throw new Error(`Tenant ${code} chưa seed — chạy pnpm db:seed trước`);
      const user = await owner.appUser.findFirst({ where: { tenantId: tenant.id } });
      if (!user) throw new Error(`User của ${code} chưa seed`);
      const token = jwt.sign(
        { sub: user.id, tid: tenant.id, email: user.email, person_id: user.personId ?? undefined },
        getJwtSecret(),
        { expiresIn: '1h' },
      );
      return { id: tenant.id, token };
    }
    h01 = await ctxFor('H.01');
    t2 = await ctxFor('T2.TEST');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
    await appDb?.$disconnect();
  });

  const CODE = `ISO-${Date.now()}`;

  it('H.01 tạo org unit thành công + phát sinh audit_log', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/org-units')
      .set('Authorization', `Bearer ${h01.token}`)
      .set('X-Tenant-Id', h01.id)
      .send({ code: CODE, nameVi: 'Đơn vị test cô lập', level: 'team' });
    expect(res.status).toBe(201);
    expect(res.body.tenantId).toBe(h01.id);

    // audit_log append-only đã ghi (fire-and-forget → chờ ngắn)
    await new Promise((r) => setTimeout(r, 500));
    const audits = await owner.auditLog.findMany({
      where: { tenantId: h01.id, action: 'org_unit.create', entityId: res.body.id },
    });
    expect(audits.length).toBe(1);
  });

  it('T2 KHÔNG thấy org unit của H.01 qua API', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/org-units')
      .set('Authorization', `Bearer ${t2.token}`)
      .set('X-Tenant-Id', t2.id);
    expect(res.status).toBe(200);
    const codes = res.body.map((u: any) => u.code);
    expect(codes).not.toContain(CODE);
    for (const u of res.body) expect(u.tenantId).toBe(t2.id);
  });

  it('Token T2 + header X-Tenant-Id của H.01 → 403 (chống mượn tenant)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/org-units')
      .set('Authorization', `Bearer ${t2.token}`)
      .set('X-Tenant-Id', h01.id);
    expect(res.status).toBe(403);
  });

  it('Thiếu X-Tenant-Id → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/org-units')
      .set('Authorization', `Bearer ${h01.token}`);
    expect(res.status).toBe(403);
  });

  it('RLS fail-closed: kết nối ipms_app KHÔNG set tenant context → 0 dòng', async () => {
    const rows = await appDb.$queryRaw<any[]>`SELECT * FROM org_unit`;
    expect(rows.length).toBe(0);
    const tenants = await appDb.$queryRaw<any[]>`SELECT * FROM tenant`;
    expect(tenants.length).toBe(0);
  });

  it('RLS: ipms_app set tenant T2 → không đọc được dữ liệu H.01 bằng raw SQL', async () => {
    const rows = await appDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t2.id}, true)`;
      return tx.$queryRaw<any[]>`SELECT * FROM org_unit WHERE code = ${CODE}`;
    });
    expect(rows.length).toBe(0);
  });

  it('audit_log append-only: UPDATE bị chặn ở tầng DB (kể cả owner)', async () => {
    await expect(
      owner.$executeRaw`UPDATE audit_log SET action = 'tampered' WHERE action = 'org_unit.create'`,
    ).rejects.toThrow(/append-only/);
  });

  it('ipms_app không có quyền DELETE bảng nghiệp vụ (soft-delete only)', async () => {
    await expect(
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${h01.id}, true)`;
        return tx.$executeRaw`DELETE FROM org_unit WHERE code = ${CODE}`;
      }),
    ).rejects.toThrow();
  });
});
