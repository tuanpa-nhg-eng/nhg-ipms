/**
 * Integration — [Reviewer đối kháng trục Learning Loop] regression F159–F168:
 * F159 golden approve qua đúng cap createSuite · F160 finalPayload validate shape ·
 * F161 replay không rò qua /ai/suggestions + config_change · F163 economics loại
 * traffic eval · F165 filter expired · F166 SoD fail-closed thiếu actor ·
 * F167 giá tenant thắng global · F168 MCP accept/reject phát learning signal.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string }

describe('Reviewer fixes F159–F168 — trục AI Learning Loop', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let curator: Ctx;
  let designer: Ctx;
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
    curator = await ctxFor('H.01', 'curator@');
    designer = await ctxFor('H.01', 'designer@');

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
  const cell = { nameVi: `Fix regression ${uniq}`, code: 'TS-G01-C01-T001' };

  /** Tạo signal + candidate bằng owner (giả lập trạng thái) — cho các test approve. */
  async function makeCandidate(over: Partial<{
    expected: object; input: object; agent: string; sourceActorUserId: string | null;
  }>) {
    const sig = await owner.aiLearningSignal.create({
      data: {
        id: uuidv7(), tenantId: author.id, suggestionId: uuidv7(),
        agent: over.agent ?? 'inline.taskcell.kpi_link', outcome: 'accepted',
        actorUserId: over.sourceActorUserId === null ? null : author.userId,
      },
    });
    return owner.aiGoldenCandidate.create({
      data: {
        id: uuidv7(), tenantId: author.id, signalId: sig.id, suggestionId: sig.suggestionId,
        agent: over.agent ?? 'inline.taskcell.kpi_link',
        sourceActorUserId: over.sourceActorUserId === null ? null : author.userId,
        input: (over.input ?? { task: 'x', agent: 'inline.taskcell.kpi_link', prompt: 'p', context: {} }) as any,
        expected: (over.expected ?? { kpiRef: 'FIN-EXT-001' }) as any,
        status: 'proposed',
      },
    });
  }

  // ===== F160 — finalPayload phải đúng shape của type =====
  it('[F160] finalPayload rác → 422, KHÔNG vào corpus: draft field lạ · kpiRef ngoài từ điển · dedup enum sai', async () => {
    const mk = async (task: string, input: Record<string, unknown>) => {
      const r = await api().post(`/api/v1/ai/inline/${task}`).set(as(author)).send({ input });
      expect(r.status).toBe(201);
      return r.body.suggestion.id as string;
    };
    // draft: fill key ngoài whitelist A–G
    const s1 = await mk('taskcell.draft', { payload: cell });
    expect((await api().post(`/api/v1/ai/inline/suggestions/${s1}/apply`).set(as(author))
      .send({ edited: true, finalPayload: { fill: { hackField: 'x' } } })).status).toBe(422);
    // kpi_link: kpiRef không nằm trong candidates của gợi ý
    const s2 = await mk('taskcell.kpi_link', { payload: cell });
    expect((await api().post(`/api/v1/ai/inline/suggestions/${s2}/apply`).set(as(author))
      .send({ edited: true, finalPayload: { kpiRef: 'HACK-999' } })).status).toBe(422);
    // key lạ ngoài shape
    expect((await api().post(`/api/v1/ai/inline/suggestions/${s2}/apply`).set(as(author))
      .send({ edited: true, finalPayload: { kpiRef: 'FIN-EXT-001', extra: 1 } })).status).toBe(422);
    // suggestion vẫn pending + KHÔNG có signal nào lọt
    for (const sid of [s1, s2]) {
      const st = await owner.aiSuggestion.findFirst({ where: { id: sid } });
      expect(st!.status).toBe('pending');
      expect(await owner.aiLearningSignal.count({ where: { suggestionId: sid } })).toBe(0);
    }
    // hợp lệ vẫn qua (không siết oan)
    expect((await api().post(`/api/v1/ai/inline/suggestions/${s2}/apply`).set(as(author))
      .send({ edited: true, finalPayload: { kpiRef: 'FIN-EXT-001' } })).status).toBe(201);
  });

  // ===== F159/F160b — approve qua đúng cap createSuite =====
  it('[F160b] candidate expected không sinh assertion → 422 (case 0-assertion bị cấm)', async () => {
    const cand = await makeCandidate({ agent: 'inline.taskcell.draft', expected: {} });
    expect((await api().post(`/api/v1/ai/golden/candidates/${cand.id}/approve`)
      .set(as(curator)).send({})).status).toBe(422);
  });

  it('[F159] case vượt 32KB → 422; suite đầy 100 case → 409', async () => {
    // 32KB: expected khổng lồ (owner giả lập — F160 chặn đường API nhưng cap phải đứng độc lập)
    const big = await makeCandidate({
      agent: 'inline.taskcell.kpi_link',
      input: { task: 'x', agent: 'inline.taskcell.kpi_link', prompt: 'p', context: { pad: 'z'.repeat(16_000) } },
      expected: { kpiRef: `K-${'y'.repeat(17_000)}` },
    });
    expect((await api().post(`/api/v1/ai/golden/candidates/${big.id}/approve`)
      .set(as(curator)).send({})).status).toBe(422);

    // suite đầy: dùng agent inline giả (không đụng suite thật của dev DB)
    const fakeAgent = `inline.test.f159-${uniq}`;
    const suite = await owner.aiEvalSuite.create({
      data: { id: uuidv7(), tenantId: author.id, agent: fakeAgent, name: 'golden-learned' },
    });
    await owner.aiEvalCase.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        id: uuidv7(), tenantId: author.id, suiteId: suite.id, name: `filler-${i}`,
        input: { prompt: 'p' } as any, assertions: [{ type: 'exists', path: 'echo' }] as any,
      })),
    });
    const cand = await makeCandidate({ agent: fakeAgent, expected: { kpiRef: 'FIN-EXT-001' } });
    // fakeAgent không thuộc 4 task inline → goldenAssertions trả []... dùng kpi_link shape:
    // agent lạ → 0 assertion → 422 trước khi chạm suite. Vậy test suite-cap bằng agent thật:
    expect((await api().post(`/api/v1/ai/golden/candidates/${cand.id}/approve`)
      .set(as(curator)).send({})).status).toBe(422); // agent lạ = 0 assertion (fail-closed)

    const candReal = await makeCandidate({ agent: 'inline.curation.dedup', expected: { recommendation: 'merge' } });
    // chuyển suite curation.dedup 'golden-learned' tới trần bằng filler
    let realSuite = await owner.aiEvalSuite.findFirst({
      where: { tenantId: author.id, agent: 'inline.curation.dedup', name: 'golden-learned', deletedAt: null },
    });
    if (!realSuite) {
      realSuite = await owner.aiEvalSuite.create({
        data: { id: uuidv7(), tenantId: author.id, agent: 'inline.curation.dedup', name: 'golden-learned' },
      });
    }
    const existing = await owner.aiEvalCase.count({ where: { suiteId: realSuite.id, deletedAt: null } });
    const fillerIds: string[] = [];
    if (existing < 100) {
      const fillers = Array.from({ length: 100 - existing }, (_, i) => ({
        id: uuidv7(), tenantId: author.id, suiteId: realSuite!.id, name: `f159-filler-${uniq}-${i}`,
        input: { prompt: 'p' } as any, assertions: [{ type: 'exists', path: 'echo' }] as any,
      }));
      fillerIds.push(...fillers.map((f) => f.id));
      await owner.aiEvalCase.createMany({ data: fillers });
    }
    expect((await api().post(`/api/v1/ai/golden/candidates/${candReal.id}/approve`)
      .set(as(curator)).send({})).status).toBe(409);
    // dọn filler để không phá suite thật của dev DB
    if (fillerIds.length) await owner.aiEvalCase.deleteMany({ where: { id: { in: fillerIds } } });
  });

  // ===== F166 — SoD fail-closed khi thiếu actor =====
  it('[F166] candidate không có sourceActorUserId → 422 (không kiểm được SoD)', async () => {
    const cand = await makeCandidate({ sourceActorUserId: null, expected: { kpiRef: 'FIN-EXT-001' } });
    expect((await api().post(`/api/v1/ai/golden/candidates/${cand.id}/approve`)
      .set(as(curator)).send({})).status).toBe(422);
  });

  // ===== F161 — replay không rò =====
  it('[F161] GET /ai/suggestions không trả replay; accept chỉ materialize proposal', async () => {
    const r = await api().post('/api/v1/ai/inline/taskcell.kpi_link').set(as(author))
      .send({ input: { payload: cell } });
    const sid = r.body.suggestion.id;
    // suggestion trong DB CÓ replay (phục vụ harvest)…
    const raw = await owner.aiSuggestion.findFirst({ where: { id: sid } });
    expect((raw!.payload as any).replay).toBeTruthy();
    // …nhưng API config:read KHÔNG thấy replay
    const list = await api().get('/api/v1/ai/suggestions?status=pending').set(as(designer));
    expect(list.status).toBe(200);
    const mine = list.body.find((s: any) => s.id === sid);
    expect(mine).toBeTruthy();
    expect(mine.payload.replay).toBeUndefined();
    expect(mine.payload.proposal).toBeTruthy(); // vẫn đủ cho UI duyệt

    // accept derivation_rule inline → config_change KHÔNG chứa replay
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `f161 ${uniq}` });
    const rule = await api().post('/api/v1/ai/inline/derivation.rule').set(as(designer))
      .send({ input: { description: 'rule f161' }, configVersionId: cv.body.id });
    const accept = await api().post(`/api/v1/ai/suggestions/${rule.body.suggestion.id}/accept`)
      .set(as(designer)).send({});
    expect(accept.status).toBe(201);
    const change = await owner.configChange.findFirst({
      where: { tenantId: designer.id, configVersionId: cv.body.id, entityType: 'ai_suggestion:derivation_rule' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(change!.after)).not.toContain('"replay"');
    expect((change!.after as any).payload.rule).toBeTruthy(); // proposal vẫn đủ
  });

  // ===== F168 — MCP accept/reject phát learning signal =====
  it('[F168] designer accept/reject qua vòng MCP → có tín hiệu học với actor = decider', async () => {
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `f168 ${uniq}` });
    const r1 = await api().post('/api/v1/ai/inline/derivation.rule').set(as(designer))
      .send({ input: { description: 'rule f168 a' }, configVersionId: cv.body.id });
    await api().post(`/api/v1/ai/suggestions/${r1.body.suggestion.id}/accept`).set(as(designer)).send({});
    const sig1 = await owner.aiLearningSignal.findFirst({
      where: { suggestionId: r1.body.suggestion.id },
    });
    expect(sig1).not.toBeNull();
    expect(sig1!.outcome).toBe('accepted');
    expect(sig1!.actorUserId).toBe(designer.userId);

    const r2 = await api().post('/api/v1/ai/inline/derivation.rule').set(as(designer))
      .send({ input: { description: 'rule f168 b' }, configVersionId: cv.body.id });
    await api().post(`/api/v1/ai/suggestions/${r2.body.suggestion.id}/reject`).set(as(designer))
      .send({ note: 'không dùng' });
    const sig2 = await owner.aiLearningSignal.findFirst({
      where: { suggestionId: r2.body.suggestion.id },
    });
    expect(sig2!.outcome).toBe('rejected');
  });

  // ===== F165 — filter expired =====
  it('[F165] GET /ai/suggestions?status=expired → 200 (không còn 422)', async () => {
    expect((await api().get('/api/v1/ai/suggestions?status=expired').set(as(designer))).status).toBe(200);
  });

  // ===== F163 — economics loại traffic eval =====
  it('[F163] interaction toolName eval:* KHÔNG được đếm vào unit economics', async () => {
    const before = await api().get('/api/v1/ai/economics').set(as(designer));
    const agentBefore = before.body.agents.find((a: any) => a.agent === 'inline.taskcell.kpi_link');
    const callsBefore = agentBefore?.calls ?? 0;
    // bơm 5 interaction eval replay (owner — giả lập CI chạy suite)
    await owner.aiInteraction.createMany({
      data: Array.from({ length: 5 }, () => ({
        tenantId: designer.id, agent: 'inline.taskcell.kpi_link', toolName: 'eval:golden-fin-baseline',
        model: 'mock', tokensIn: 99_999, tokensOut: 99_999, costUsd: 0, latencyMs: 1, status: 'ok',
      })),
    });
    const after = await api().get('/api/v1/ai/economics').set(as(designer));
    const agentAfter = after.body.agents.find((a: any) => a.agent === 'inline.taskcell.kpi_link');
    expect(agentAfter.calls).toBe(callsBefore); // không nhích — eval bị loại
    expect(after.body.basis).toContain('eval');
  });

  // ===== F167 — giá tenant thắng global =====
  it('[F167] override giá per-tenant → prices/projections chỉ 1 dòng per model, tenant thắng', async () => {
    const row = await owner.aiModelPrice.create({
      data: {
        id: uuidv7(), tenantId: designer.id, model: 'claude-haiku-4-5',
        inputUsdPerMTok: 0.5, outputUsdPerMTok: 2.5, note: `test f167 ${uniq}`,
      },
    });
    try {
      const res = await api().get('/api/v1/ai/economics/prices').set(as(designer));
      const haiku = res.body.filter((p: any) => p.model === 'claude-haiku-4-5');
      expect(haiku).toHaveLength(1);
      expect(Number(haiku[0].inputUsdPerMTok)).toBe(0.5); // tenant override thắng global
    } finally {
      await owner.aiModelPrice.delete({ where: { id: row.id } }); // không phá catalog dev DB
    }
  });
});
