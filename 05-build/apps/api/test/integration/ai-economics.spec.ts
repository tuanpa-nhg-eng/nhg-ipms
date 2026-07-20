/**
 * Integration — [Learning Loop L3] unit economics từ ai_interaction thật:
 * GET /ai/economics (P50/P95, cost thực = 0 trên mock, projection ×0.5/×1/×2)
 * + GET /ai/economics/prices (catalog global) + permission ai:eval.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string }

describe('Learning Loop L3 — unit economics', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let designer: Ctx;
  let emp: Ctx;
  const uniq = Date.now();

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
      });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token, userId: user!.id };
    }
    author = await ctxFor('H.01', 'author@');
    designer = await ctxFor('H.01', 'designer@');
    emp = await ctxFor('H.01', 'emp1@');

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

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  it('bảng giá global: mock=0, Opus 4.8 = 5/25, ≥5 model; emp 403', async () => {
    expect((await api().get('/api/v1/ai/economics/prices').set(as(emp))).status).toBe(403);
    const res = await api().get('/api/v1/ai/economics/prices').set(as(designer));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    const mock = res.body.find((p: any) => p.model === 'mock');
    expect(Number(mock.inputUsdPerMTok)).toBe(0);
    const opus = res.body.find((p: any) => p.model === 'claude-opus-4-8');
    expect(Number(opus.inputUsdPerMTok)).toBe(5);
    expect(Number(opus.outputUsdPerMTok)).toBe(25);
    for (const p of res.body) expect(p.tenantId).toBeNull(); // catalog global, chưa có override
  });

  it('report: interaction inline thật → tokens P50/P95, cost thực = 0, projection Opus dương + sensitivity đúng', async () => {
    // Sinh vài interaction qua inline assist (mock — tokensIn gồm context)
    for (let i = 0; i < 3; i++) {
      const r = await api().post('/api/v1/ai/inline/taskcell.kpi_link').set(as(author))
        .send({ input: { payload: { nameVi: `Econ ${uniq}-${i}`, code: 'TS-G01-C01-T001' } } });
      expect(r.status).toBe(201);
    }

    expect((await api().get('/api/v1/ai/economics').set(as(emp))).status).toBe(403);
    expect((await api().get('/api/v1/ai/economics').set(as(author))).status).toBe(403);

    const res = await api().get('/api/v1/ai/economics').set(as(designer));
    expect(res.status).toBe(200);
    expect(res.body.estimated).toBe(true); // nhãn minh bạch — không mạo nhận số thật
    expect(res.body.totalActualCostUsd).toBe(0); // RED-LINE: mock không chi tiền

    const kpiLink = res.body.agents.find((a: any) => a.agent === 'inline.taskcell.kpi_link');
    expect(kpiLink).toBeTruthy();
    expect(kpiLink.calls).toBeGreaterThanOrEqual(3);
    expect(kpiLink.actualCostUsd).toBe(0);
    expect(kpiLink.models).toEqual(['mock']);
    // Từ điển KPI 41 mục trong context → tokensIn ROW MỚI phải đáng kể (heuristic
    // gồm context; avg lịch sử có thể bị row cũ trước L3 kéo xuống — không assert avg)
    const latest = await owner.aiInteraction.findFirst({
      where: { tenantId: author.id, toolName: 'inline.taskcell.kpi_link' },
      orderBy: { at: 'desc' },
    });
    expect(latest!.tokensIn ?? 0).toBeGreaterThan(500);
    expect(kpiLink.tokens.avgIn).toBeGreaterThan(0);
    expect(kpiLink.tokens.p50In).not.toBeNull();
    expect(kpiLink.tokens.p95In).toBeGreaterThanOrEqual(kpiLink.tokens.p50In);
    expect(kpiLink.latencyMs.p95).toBeGreaterThanOrEqual(kpiLink.latencyMs.p50 ?? 0);

    // Projection: mock bị loại; Opus 4.8 dương; sensitivity ×2 = 2×base (làm tròn cent)
    const models = kpiLink.projections.map((p: any) => p.model);
    expect(models).not.toContain('mock');
    const opus = kpiLink.projections.find((p: any) => p.model === 'claude-opus-4-8');
    expect(opus.estCostPerCallUsd).toBeGreaterThan(0);
    expect(Math.abs(opus.monthlyUsd.double - opus.monthlyUsd.base * 2)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(opus.monthlyUsd.half - opus.monthlyUsd.base * 0.5)).toBeLessThanOrEqual(0.02);
  });

  it('report tất định về cấu trúc: agents sort theo tên, windowDays=30', async () => {
    const res = await api().get('/api/v1/ai/economics').set(as(designer));
    expect(res.body.windowDays).toBe(30);
    const names = res.body.agents.map((a: any) => a.agent);
    expect([...names].sort()).toEqual(names);
  });
});
