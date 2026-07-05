/**
 * Integration Phase 1: KPI Dictionary → approve → Scorecard → validate-weights
 * → compute-preview (Scoring Engine end-to-end trên Postgres thật) + cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(60_000);

describe('KPI + Scorecard + Scoring Engine (integration)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let h01: { id: string; token: string };
  let t2: { id: string; token: string };
  const uniq = Date.now();

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);

    async function ctxFor(code: string) {
      const tenant = await owner.tenant.findUnique({ where: { code } });
      if (!tenant) throw new Error(`Tenant ${code} chưa seed`);
      const user = await owner.appUser.findFirst({ where: { tenantId: tenant.id } });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
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
  });

  const h01Req = () => ({ Authorization: `Bearer ${h01.token}`, 'X-Tenant-Id': h01.id });
  const t2Req = () => ({ Authorization: `Bearer ${t2.token}`, 'X-Tenant-Id': t2.id });

  let kpiSales: string;
  let kpiQuality: string;
  let scorecardId: string;

  const TIERS = [
    { minPct: 100, score: 100 },
    { minPct: 90, score: 88 },
    { minPct: 80, score: 76 },
    { minPct: 70, score: 64 },
  ];

  it('tạo KPI forward kèm formula + bậc thang', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/kpis').set(h01Req())
      .send({
        code: `KPI-SALES-${uniq}`, nameVi: 'Doanh số tuyển sinh', method: 'manual',
        direction: 'forward', frequency: 'monthly',
        formulaExpression: 'min(actual/target,1)*100',
        scoreTiers: TIERS,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.formula.expression).toBe('min(actual/target,1)*100');
    expect(res.body.scoreTiers).toHaveLength(4);
    kpiSales = res.body.id;
  });

  it('CHẶN formula ngoài whitelist ngay khi tạo (422)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/kpis').set(h01Req())
      .send({
        code: `KPI-EVIL-${uniq}`, nameVi: 'x', method: 'manual',
        direction: 'forward', frequency: 'monthly',
        formulaExpression: 'require(actual)',
      });
    expect(res.status).toBe(422);
  });

  it('tạo KPI reverse (thấp = tốt) + approve human-in-the-loop', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/kpis').set(h01Req())
      .send({
        code: `KPI-COMPLAIN-${uniq}`, nameVi: 'Tỷ lệ phàn nàn', method: 'manual',
        direction: 'reverse', frequency: 'monthly', scoreTiers: TIERS,
      });
    expect(res.status).toBe(201);
    kpiQuality = res.body.id;

    const ap = await request(app.getHttpServer())
      .post(`/api/v1/kpis/${kpiQuality}/approve`).set(h01Req());
    expect(ap.status).toBe(201);
    expect(ap.body.status).toBe('active');

    // approve lần 2 → 409
    const ap2 = await request(app.getHttpServer())
      .post(`/api/v1/kpis/${kpiQuality}/approve`).set(h01Req());
    expect(ap2.status).toBe(409);
  });

  it('tạo scorecard 2 KPI (60/40)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/scorecards').set(h01Req())
      .send({
        nameVi: `Scorecard TS ${uniq}`, period: '2026-Q3',
        items: [
          { kpiId: kpiSales, weight: 60 },
          { kpiId: kpiQuality, weight: 40 },
        ],
      });
    expect(res.status).toBe(201);
    scorecardId = res.body.id;
    expect(res.body.items).toHaveLength(2);
  });

  it('validate-weights: 60+40=100 → valid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/scorecards/${scorecardId}/validate-weights`).set(h01Req());
    expect(res.status).toBe(201);
    expect(res.body.valid).toBe(true);
    expect(res.body.sum).toBe(100);
  });

  it('validate-weights: scorecard lệch tổng → 422 (chặn theo TDD §7.2)', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/v1/scorecards').set(h01Req())
      .send({
        nameVi: `Bad ${uniq}`,
        items: [{ kpiId: kpiSales, weight: 60 }, { kpiId: kpiQuality, weight: 35 }],
      });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/scorecards/${bad.body.id}/validate-weights`).set(h01Req());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('compute-preview: engine chạy đúng end-to-end (95%→88 · reverse 80%→76 · final 83.2 → A)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/scorecards/${scorecardId}/compute-preview`).set(h01Req())
      .send({
        actuals: [
          { kpiId: kpiSales, actual: 95, target: 100 },   // formula min() → 95% → tier 88
          { kpiId: kpiQuality, actual: 5, target: 4 },    // reverse 4/5 = 80% → tier 76
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.finalScore).toBe(83.2);
    expect(res.body.ipcGrade).toBe('A');
    const sales = res.body.items.find((i: any) => i.achievedPct === 95);
    expect(sales.rawScore).toBe(88);
    expect(sales.formulaVersion).toBe(1);
  });

  it('[F18] update formula → version mới immutable; compute-preview dùng version mới', async () => {
    // v1: min(actual/target,1)*100 — cap 100. v2: cho vượt trần 120%
    const up = await request(app.getHttpServer())
      .post(`/api/v1/kpis/${kpiSales}/formula`).set(h01Req())
      .send({ expression: 'clamp(actual/target,0,1.2)*100' });
    expect(up.status).toBe(201);
    expect(up.body.formula.version).toBe(2);

    // bản v1 vẫn còn trong DB (immutable — recompute lịch sử)
    const formulas = await owner.kpiFormula.findMany({
      where: { tenantId: h01.id, version: { in: [1, 2] } },
      orderBy: { version: 'asc' },
    });
    expect(formulas.some((f) => f.expression === 'min(actual/target,1)*100')).toBe(true);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/scorecards/${scorecardId}/compute-preview`).set(h01Req())
      .send({
        actuals: [
          { kpiId: kpiSales, actual: 110, target: 100 },
          { kpiId: kpiQuality, actual: 4, target: 4 },
        ],
      });
    const sales = res.body.items.find((i: any) => i.formulaVersion === 2);
    expect(sales).toBeDefined();
    expect(sales.achievedPct).toBe(110); // v2 cho vượt 100%
  });

  it('CÔ LẬP: T2 không thấy KPI/scorecard của H.01', async () => {
    const kpis = await request(app.getHttpServer()).get('/api/v1/kpis').set(t2Req());
    expect(kpis.status).toBe(200);
    expect(kpis.body.map((k: any) => k.id)).not.toContain(kpiSales);

    const scs = await request(app.getHttpServer()).get('/api/v1/scorecards').set(t2Req());
    expect(scs.body.map((s: any) => s.id)).not.toContain(scorecardId);

    // đọc trực tiếp bằng id cũng không được
    const direct = await request(app.getHttpServer()).get(`/api/v1/kpis/${kpiSales}`).set(t2Req());
    expect(direct.status).toBe(404);
  });

  it('audit: kpi.create + kpi.approve + scorecard.create đã ghi', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const audits = await owner.auditLog.findMany({
      where: { tenantId: h01.id, action: { in: ['kpi.create', 'kpi.approve', 'scorecard.create'] } },
    });
    expect(audits.filter((a) => a.action === 'kpi.create').length).toBeGreaterThanOrEqual(2);
    expect(audits.filter((a) => a.action === 'kpi.approve').length).toBeGreaterThanOrEqual(1);
    expect(audits.filter((a) => a.action === 'scorecard.create').length).toBeGreaterThanOrEqual(1);
  });
});
