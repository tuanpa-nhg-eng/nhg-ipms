/**
 * Integration — [Last-mile Lát 4] Model-Qualification Gate (cấm silent-swap):
 * qualify() chứng nhận model qua golden suite thật · setServingModel() CHỈ chấp nhận
 * model đã qualify (chưa hết hạn, đạt bar) · readiness().liveQualified re-check bar
 * HIỆN TẠI mỗi lần đọc (bar bị siết sau khi qualify ⇒ tự vô hiệu, không đọc số cũ).
 *
 * Phần A (H.01, mock-only — an toàn, không đụng chi phí thật): chứng minh cổng chặn.
 * Phần B (T2.TEST, AnthropicLlmClient override fake transport — không mạng): chứng
 * minh đường ĐI QUA được khi có bằng chứng thật, và tự vô hiệu khi bar bị siết.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { AnthropicLlmClient, AnthropicStreamEvent } from '../../src/modules/ai/llm/anthropic-llm-client';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string }

function fakeTransport(events: AnthropicStreamEvent[]) {
  return {
    messages: {
      async *stream() {
        for (const e of events) yield e;
      },
    },
  };
}

describe('[Last-mile Lát 4] Phần A — cổng chặn trên mock (H.01)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let designer: Ctx;
  let emp: Ctx;
  const uniq = Date.now();
  const AGENT = `inline.test.qualify.${uniq}`;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
      const user = await owner.appUser.findFirst({ where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } } });
      const token = jwt.sign({ sub: user!.id, tid: tenant!.id, email: user!.email }, getJwtSecret(), { expiresIn: '1h' });
      return { id: tenant!.id, token };
    }
    designer = await ctxFor('designer@');
    emp = await ctxFor('emp1@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); await owner?.$disconnect(); });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  it('setup: launch bar + suite 3 case pass chắc chắn trên mock', async () => {
    expect((await api().put(`/api/v1/ai/eval/launch-bars/${AGENT}`).set(as(designer))
      .send({ minPassRate: 0.8, minCases: 3 })).status).toBe(200);
    const create = await api().post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: AGENT, name: `qualify-${uniq}`,
      cases: Array.from({ length: 3 }, (_, i) => ({
        name: `c${i}`, input: { prompt: `case ${i}` }, assertions: [{ type: 'exists', path: 'echo' }],
      })),
    });
    expect(create.status).toBe(201);
  });

  it('permission: emp (không ai:eval) → 403 mọi endpoint mới', async () => {
    expect((await api().post(`/api/v1/ai/eval/qualify/${AGENT}`).set(as(emp)).send({})).status).toBe(403);
    expect((await api().put(`/api/v1/ai/eval/agent-model/${AGENT}`).set(as(emp)).send({ model: 'mock' })).status).toBe(403);
    expect((await api().get('/api/v1/ai/eval/agent-model').set(as(emp))).status).toBe(403);
    expect((await api().get('/api/v1/ai/eval/qualifications').set(as(emp))).status).toBe(403);
  });

  it('qualify() trên mock → tạo qualification model=mock, passRate=1', async () => {
    const res = await api().post(`/api/v1/ai/eval/qualify/${AGENT}`).set(as(designer)).send({ note: `test ${uniq}` });
    expect(res.status).toBe(201);
    expect(res.body.model).toBe('mock');
    expect(Number(res.body.passRate)).toBe(1);
    expect(res.body.casesTotal).toBe(3);
    expect(Array.isArray(res.body.runIds)).toBe(true);
    expect(res.body.runIds.length).toBe(1);
  });

  it('[CẤM SILENT-SWAP] setServingModel sang model THẬT CHƯA qualify → 422, KHÔNG ghi ai_agent_model', async () => {
    const res = await api().put(`/api/v1/ai/eval/agent-model/${AGENT}`).set(as(designer))
      .send({ model: 'claude-sonnet-5' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('qualify');
    const row = await owner.aiAgentModel.findFirst({ where: { agent: AGENT } });
    expect(row).toBeNull(); // tuyệt đối không ghi khi chặn
  });

  it('setServingModel sang mock → luôn được (không cần chứng minh gì)', async () => {
    const res = await api().put(`/api/v1/ai/eval/agent-model/${AGENT}`).set(as(designer)).send({ model: 'mock' });
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('mock');
  });

  it('readiness: servingModel=mock ⇒ liveQualified=false dù ĐÃ có qualification (mock) — mock không tự chứng minh gì', async () => {
    const res = await api().get('/api/v1/ai/eval/readiness').set(as(designer));
    const row = res.body.agents.find((a: any) => a.agent === AGENT);
    expect(row).toBeTruthy();
    expect(row.servingModel).toBe('mock');
    expect(row.liveQualified).toBe(false);
    expect(row.reasons.join(' ')).toContain('MOCK');
  });

  it('không có launch bar cho agent lạ → qualify() 422 tường minh', async () => {
    const res = await api().post(`/api/v1/ai/eval/qualify/no-such-agent-${uniq}`).set(as(designer)).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('launch bar');
  });
});

describe('[Last-mile Lát 4] Phần B — qualify model THẬT (transport giả, T2.TEST) + tự vô hiệu khi siết bar', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let designer: Ctx;
  let tenantId: string;
  const uniq = Date.now() + 1; // lệch mốc thời gian với Phần A
  const AGENT = `inline.test.qualifyB.${uniq}`;
  let flagId: string | undefined;
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const tenant = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });
    tenantId = tenant!.id;
    const user = await owner.appUser.findFirst({ where: { tenantId, email: { startsWith: 'designer@' } } });
    const token = jwt.sign({ sub: user!.id, tid: tenantId, email: user!.email }, getJwtSecret(), { expiresIn: '1h' });
    designer = { id: tenantId, token };

    const flag = await owner.featureFlag.create({ data: { id: uuidv7(), tenantId, key: 'ai_gateway_live', enabled: true } });
    flagId = flag.id;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-not-real';

    // 4 case pass chắc chắn (text luôn tồn tại 'echo'? — dùng exists path 'text' cấp
    // qua parser? Đơn giản: gateway.complete trả res.json từ JSON.parse(text) — case
    // dùng assertion exists trên field CÓ THẬT trong output của fake transport.
    const transport = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"ok":true}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnthropicLlmClient).useValue(AnthropicLlmClient.withTransport(transport))
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // launch bar + suite 4 case, assertion khớp {"ok":true}
    await request(app.getHttpServer()).put(`/api/v1/ai/eval/launch-bars/${AGENT}`)
      .set(as(designer)).send({ minPassRate: 0.75, minCases: 4 });
    await request(app.getHttpServer()).post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: AGENT, name: `qualifyB-${uniq}`,
      cases: Array.from({ length: 4 }, (_, i) => ({
        name: `c${i}`, input: { prompt: `case ${i}` }, assertions: [{ type: 'equals', path: 'ok', value: true }],
      })),
    });
  });

  afterAll(async () => {
    if (flagId) await owner.featureFlag.deleteMany({ where: { id: flagId } });
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });

  it('qualify() live thật (transport giả) → model=claude-opus-4-8, đạt bar → setServingModel → liveQualified=true', async () => {
    const api = () => request(app.getHttpServer());
    const qual = await api().post(`/api/v1/ai/eval/qualify/${AGENT}`).set(as(designer)).send({});
    expect(qual.status).toBe(201);
    expect(qual.body.model).toBe('claude-opus-4-8');
    expect(Number(qual.body.passRate)).toBe(1);

    const setModel = await api().put(`/api/v1/ai/eval/agent-model/${AGENT}`).set(as(designer))
      .send({ model: 'claude-opus-4-8' });
    expect(setModel.status).toBe(200);

    const rdy1 = await api().get('/api/v1/ai/eval/readiness').set(as(designer));
    const row1 = rdy1.body.agents.find((a: any) => a.agent === AGENT);
    expect(row1.servingModel).toBe('claude-opus-4-8');
    expect(row1.ready).toBe(true);
    expect(row1.liveQualified).toBe(true); // ĐÃ qualify đúng model đang phục vụ

    // [Chống trì trệ] Siết bar lên 0.99 (qualification cũ passRate=1 vẫn ≥0.99 — case
    // biên: KHÔNG bị vô hiệu vì thực sự vẫn đạt) — đổi hướng khác: siết minCases lên 100
    // (qualification chỉ có 4 case < 100) → PHẢI vô hiệu ngay, không đọc số cũ.
    const raise = await api().put(`/api/v1/ai/eval/launch-bars/${AGENT}`).set(as(designer))
      .send({ minPassRate: 0.75, minCases: 100 });
    expect(raise.status).toBe(200);

    const rdy2 = await api().get('/api/v1/ai/eval/readiness').set(as(designer));
    const row2 = rdy2.body.agents.find((a: any) => a.agent === AGENT);
    // ready cũng false vì bản thân agent chưa đủ 100 case CHẠY (không chỉ qualification)
    expect(row2.ready).toBe(false);
    expect(row2.liveQualified).toBe(false);
  });

  it('[CẤM SILENT-SWAP] đổi servingModel sang model KHÁC (claude-haiku-4-5) chưa qualify riêng → 422', async () => {
    const res = await request(app.getHttpServer()).put(`/api/v1/ai/eval/agent-model/${AGENT}`).set(as(designer))
      .send({ model: 'claude-haiku-4-5' });
    // bar hiện tại minCases=100 (đã siết ở test trước) — dù có qualify claude-opus-4-8
    // cũ đi nữa, model MỚI 'claude-haiku-4-5' CHƯA TỪNG qualify → luôn 422
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('claude-haiku-4-5');
  });
});
