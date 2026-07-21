/**
 * Integration — [Learning Loop L2] eval replay inline + launch bar + readiness:
 * chạy golden-fin-baseline qua runner (parse fail-closed) tất định · GET readiness
 * fail-closed + liveQualified=false trên mock · PUT launch-bar validate + audit.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { seedGoldenFin, BASELINE_SUITE_NAME } from '../../src/scripts/seed-golden-fin';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string }

describe('Learning Loop L2 — eval replay + launch bar + readiness', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let designer: Ctx;
  let curator: Ctx;
  let emp: Ctx;
  const uniq = Date.now();
  const FAKE_AGENT = 'inline.test.readiness'; // startsWith 'inline.' → readiness quét được

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
    designer = await ctxFor('H.01', 'designer@');
    curator = await ctxFor('H.01', 'curator@');
    emp = await ctxFor('H.01', 'emp1@');

    await seedGoldenFin(owner, 'H.01'); // baseline sẵn sàng (idempotent)

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

  async function baselineSuite(agent: string) {
    const s = await owner.aiEvalSuite.findFirst({
      where: { tenantId: designer.id, agent, name: BASELINE_SUITE_NAME, deletedAt: null },
    });
    expect(s).not.toBeNull();
    return s!;
  }

  // ===== Runner replay inline =====
  it('chạy golden-fin-baseline kpi_link: output được PARSE trước khi chấm (proposal shape, kpiRef ∈ từ điển)', async () => {
    const suite = await baselineSuite('inline.taskcell.kpi_link');
    const res = await api().post(`/api/v1/ai/eval/suites/${suite.id}/run`).set(as(designer)).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('done');
    expect(res.body.results.length).toBe(3);
    const dict = new Set((await owner.kpiTemplate.findMany({
      where: { tenantId: designer.id, isDictionary: true, deletedAt: null }, select: { code: true },
    })).map((k) => k.code));
    for (const r of res.body.results) {
      const out = r.judgeOutput.output;
      expect(typeof out).toBe('object');
      expect(out.suggestion_type).toBeUndefined(); // raw đã qua parser — không chấm raw
      expect(dict.has(out.kpiRef)).toBe(true); // parser chặn kpiRef ngoài từ điển
      expect(typeof r.passed).toBe('boolean'); // pass/fail = mock vs đáp án curated (trung thực)
    }
  });

  it('TẤT ĐỊNH: chạy 2 lần cùng suite → summary y hệt (CI-able)', async () => {
    const suite = await baselineSuite('inline.taskcell.draft');
    const r1 = await api().post(`/api/v1/ai/eval/suites/${suite.id}/run`).set(as(designer)).send({});
    const r2 = await api().post(`/api/v1/ai/eval/suites/${suite.id}/run`).set(as(designer)).send({});
    expect(r1.body.summary).toEqual(r2.body.summary);
    expect(r1.body.summary.deterministic).toBe(true);
    // draft baseline: output có fill đã parse
    for (const r of r1.body.results) expect(r.judgeOutput.output.fill).toBeTruthy();
  });

  it('chạy nốt derivation + dedup baseline — run done, có kết quả', async () => {
    for (const agent of ['inline.derivation.rule', 'inline.curation.dedup']) {
      const suite = await baselineSuite(agent);
      const res = await api().post(`/api/v1/ai/eval/suites/${suite.id}/run`).set(as(designer)).send({});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('done');
      expect(res.body.results.length).toBe(2);
    }
  });

  // ===== Launch bar =====
  it('launch bar seed mặc định 4 agent inline (0.85 / 5 case); PUT upsert validate tại cửa; permission', async () => {
    const bars = await api().get('/api/v1/ai/eval/launch-bars').set(as(designer));
    expect(bars.status).toBe(200);
    const agents = bars.body.map((b: any) => b.agent);
    for (const a of ['inline.taskcell.draft', 'inline.taskcell.kpi_link', 'inline.derivation.rule', 'inline.curation.dedup']) {
      expect(agents).toContain(a);
    }
    const bar = bars.body.find((b: any) => b.agent === 'inline.taskcell.kpi_link');
    expect(Number(bar.minPassRate)).toBe(0.85);
    expect(bar.minCases).toBe(5);

    // validate: minPassRate > 1 → 400/422
    expect((await api().put(`/api/v1/ai/eval/launch-bars/${FAKE_AGENT}`).set(as(designer))
      .send({ minPassRate: 2, minCases: 5 })).status).toBeGreaterThanOrEqual(400);
    // permission: emp + curator (không ai:eval) → 403
    expect((await api().put(`/api/v1/ai/eval/launch-bars/${FAKE_AGENT}`).set(as(emp))
      .send({ minPassRate: 0.8, minCases: 5 })).status).toBe(403);
    expect((await api().get('/api/v1/ai/eval/readiness').set(as(curator))).status).toBe(403);

    // upsert hợp lệ + audit
    const up = await api().put(`/api/v1/ai/eval/launch-bars/${FAKE_AGENT}`).set(as(designer))
      .send({ minPassRate: 0.8, minCases: 5, note: `test readiness ${uniq}` });
    expect(up.status).toBe(200);
    const audit = await owner.auditLog.findFirst({
      where: { tenantId: designer.id, action: 'ai_launch_bar.upsert' }, orderBy: { at: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  // ===== Readiness =====
  it('readiness: agent đủ bar trên mock → ready=true nhưng liveQualified=false (mock không chứng minh model thật)', async () => {
    // suite tươi cho FAKE_AGENT: 5 case pass chắc chắn trên mock (echo tồn tại)
    const create = await api().post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: FAKE_AGENT, name: `rdy-${uniq}`,
      cases: Array.from({ length: 5 }, (_, i) => ({
        name: `c${i}`, input: { prompt: `case ${i}` },
        assertions: [{ type: 'exists', path: 'echo' }],
      })),
    });
    expect(create.status).toBe(201);
    // run MỌI suite của FAKE_AGENT (kể cả suite tích tụ từ các lần chạy test trước —
    // readiness fail-closed với suite chưa chạy)
    const fakeSuites = await owner.aiEvalSuite.findMany({
      where: { tenantId: designer.id, agent: FAKE_AGENT, deletedAt: null },
    });
    for (const s of fakeSuites) {
      const cases = await owner.aiEvalCase.count({ where: { suiteId: s.id, deletedAt: null } });
      if (cases > 0) {
        expect((await api().post(`/api/v1/ai/eval/suites/${s.id}/run`).set(as(designer)).send({})).status).toBe(201);
      }
    }

    const res = await api().get('/api/v1/ai/eval/readiness').set(as(designer));
    expect(res.status).toBe(200);
    const fake = res.body.agents.find((a: any) => a.agent === FAKE_AGENT);
    expect(fake).toBeTruthy();
    expect(fake.cases).toBeGreaterThanOrEqual(5);
    expect(fake.passRate).toBe(1);
    expect(fake.ready).toBe(true);
    // [Last-mile Lát 4] liveQualified giờ đòi model ĐANG PHỤC VỤ (servingModel, mặc định
    // DEFAULT_MODEL khi chưa pin) có qualification hợp lệ — chưa qualify ai cả ⇒ false,
    // lý do nêu ĐÚNG tên model cần qualify (chính xác hơn "MOCK" chung chung của lát trước).
    expect(fake.liveQualified).toBe(false);
    expect(fake.servingModel).toBe('claude-opus-4-8');
    expect(fake.reasons.join(' ')).toContain('claude-opus-4-8');
    expect(fake.reasons.join(' ')).toContain('qualify');
    expect(fake.models).toEqual(['mock']); // run THẬT vẫn chỉ chạy trên mock (flag OFF)
  });

  it('readiness fail-closed: 4 agent inline thật đều CÓ mặt, bar đầy đủ; mọi agent liveQualified=false trên mock', async () => {
    const res = await api().get('/api/v1/ai/eval/readiness').set(as(designer));
    for (const agent of ['inline.taskcell.draft', 'inline.taskcell.kpi_link', 'inline.derivation.rule', 'inline.curation.dedup']) {
      const row = res.body.agents.find((a: any) => a.agent === agent);
      expect(row).toBeTruthy();
      expect(row.bar).not.toBeNull();
      expect(row.liveQualified).toBe(false);
      // bất biến fail-closed: chưa ready thì PHẢI có lý do explainable
      if (!row.ready) expect(row.reasons.length).toBeGreaterThan(0);
      // suite nào chưa chạy → không thể ready
      const uncovered = row.suites.filter((s: any) => s.latestRun === null).length;
      if (uncovered > 0) expect(row.ready).toBe(false);
    }
    expect((await api().get('/api/v1/ai/eval/readiness').set(as(emp))).status).toBe(403);
  });
});
