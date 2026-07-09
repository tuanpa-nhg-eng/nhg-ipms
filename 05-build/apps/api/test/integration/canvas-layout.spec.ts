/**
 * Integration Phase 3 lát 4d — canvas_layout (Org/Process Designer FE) + task-cells read API:
 * permission per-kind fail-closed, upsert idempotent, validate {x,y} + cap bytes,
 * ref check (process tồn tại / org ref = tenant), cô lập tenant.
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

describe('Phase 3 lát 4d — canvas layout + task-cells API', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let designer: Ctx;
  let emp: Ctx;
  let t2designer: Ctx;
  const uniq = Date.now();

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
      });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token, userId: user!.id };
    }
    designer = await ctxFor('H.01', 'designer@');
    emp = await ctxFor('H.01', 'emp1@');
    t2designer = await ctxFor('T2.TEST', 'designer@');

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

  let versionId: string;
  let processId: string;
  let stepId: string;

  it('setup: draft version + process + step task (đường API chuẩn)', async () => {
    const v = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `canvas-${uniq}` });
    expect(v.status).toBe(201);
    versionId = v.body.id;

    const p = await api().post('/api/v1/processes').set(as(designer))
      .send({ configVersionId: versionId, code: `CV${uniq % 100000}`, nameVi: 'Quy trình canvas' });
    expect(p.status).toBe(201);
    processId = p.body.id;

    const s = await api().post(`/api/v1/processes/${processId}/steps`).set(as(designer))
      .send({ steps: [{ seq: 1, type: 'task', nameVi: 'Bước test', responsibleRole: 'tester' }] });
    expect(s.status).toBe(201);
    stepId = (s.body.steps ?? s.body)[0]?.id
      ?? (await owner.processStep.findFirst({ where: { processId } }))!.id;
  });

  it('GET chưa có layout → default rỗng; thiếu kind/refId → 422', async () => {
    const r = await api().get(`/api/v1/canvas-layout?kind=process&refId=${processId}`).set(as(designer));
    expect(r.status).toBe(200);
    expect(r.body.nodes).toEqual({});

    expect((await api().get('/api/v1/canvas-layout?kind=weird&refId=x').set(as(designer))).status).toBe(422);
  });

  it('PUT process layout: emp 403 (fail-closed) · process lạ 404 · pos không phải số 422 · upsert version++', async () => {
    const nodes = { [stepId]: { x: 120, y: 80 } };

    expect((await api().put('/api/v1/canvas-layout/process').set(as(emp))
      .send({ refId: processId, nodes })).status).toBe(403);

    expect((await api().put('/api/v1/canvas-layout/process').set(as(designer))
      .send({ refId: '018f0000-0000-7000-8000-00000000dead', nodes })).status).toBe(404);

    expect((await api().put('/api/v1/canvas-layout/process').set(as(designer))
      .send({ refId: processId, nodes: { a: { x: 'NaN', y: 1 } } })).status).toBe(422);

    const r1 = await api().put('/api/v1/canvas-layout/process').set(as(designer))
      .send({ refId: processId, nodes });
    expect(r1.status).toBe(200);
    expect(r1.body.version).toBe(1);

    const r2 = await api().put('/api/v1/canvas-layout/process').set(as(designer))
      .send({ refId: processId, nodes: { [stepId]: { x: 300, y: 200 } } });
    expect(r2.body.version).toBe(2);
    expect(r2.body.id).toBe(r1.body.id); // upsert cùng row

    const got = await api().get(`/api/v1/canvas-layout?kind=process&refId=${processId}`).set(as(designer));
    expect(got.body.nodes[stepId]).toEqual({ x: 300, y: 200 });
  });

  it('[F73] round-trip GET→PUT nguyên body (edges mảng) không bị 400; [F74] refId rác → 422', async () => {
    const got = await api().get(`/api/v1/canvas-layout?kind=process&refId=${processId}`).set(as(designer));
    const rt = await api().put('/api/v1/canvas-layout/process').set(as(designer))
      .send({ refId: processId, nodes: got.body.nodes, edges: got.body.edges });
    expect(rt.status).toBe(200);

    expect((await api().get('/api/v1/canvas-layout?kind=process&refId=khong-phai-uuid')
      .set(as(designer))).status).toBe(422);
    expect((await api().get('/api/v1/task-cells?configVersionId=khong-phai-uuid')
      .set(as(designer))).status).toBe(422);
  });

  it('PUT org layout: refId phải là tenant hiện tại (422 nếu khác); cap 64KB → 422', async () => {
    expect((await api().put('/api/v1/canvas-layout/org').set(as(designer))
      .send({ refId: processId, nodes: {} })).status).toBe(422);

    const ok = await api().put('/api/v1/canvas-layout/org').set(as(designer))
      .send({ refId: designer.id, nodes: { [designer.id]: { x: 10, y: 10 } } });
    expect(ok.status).toBe(200);

    // giữa cap 64KB và trần body-parser 100KB — để đi tới validate của controller
    const big: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < 1200; i++) big[`0000node-key-that-is-long-${i}`] = { x: 1234.5678, y: 9876.5432 };
    expect((await api().put('/api/v1/canvas-layout/org').set(as(designer))
      .send({ refId: designer.id, nodes: big })).status).toBe(422);
  });

  it('CÔ LẬP: T2 không đọc được layout H.01 (RLS → default rỗng)', async () => {
    const r = await api().get(`/api/v1/canvas-layout?kind=process&refId=${processId}`).set(as(t2designer));
    expect(r.status).toBe(200);
    expect(r.body.nodes).toEqual({});
  });

  it('task-cells: generate → GET list theo version + GET :code; emp 403; thiếu filter 422', async () => {
    const gen = await api().post(`/api/v1/processes/${processId}/generate-cells`).set(as(designer));
    expect(gen.status).toBe(201);

    const list = await api().get(`/api/v1/task-cells?configVersionId=${versionId}`).set(as(designer));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const code = list.body[0].code;

    const one = await api().get(`/api/v1/task-cells/${code}?configVersionId=${versionId}`).set(as(designer));
    expect(one.status).toBe(200);
    expect(one.body.code).toBe(code);

    expect((await api().get('/api/v1/task-cells').set(as(designer))).status).toBe(422);
    expect((await api().get(`/api/v1/task-cells?configVersionId=${versionId}`).set(as(emp))).status).toBe(403);
  });
});
