/**
 * Integration Phase 1 lát 3: cascade OKR→KGI→Goal + health roll-up + cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(60_000);

describe('Strategy cascade + Goal health (integration)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let h01: { id: string; token: string; personId: string };
  let t2: { id: string; token: string };

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);

    // [Trục B L0] Trước đây `findFirst` không lọc → rơi vào admin@ (god-account).
    // Nay chỉ đích danh hr@ — vai giữ strategy:write/goal:write.
    async function ctxFor(code: string, emailPrefix = 'hr@') {
      const tenant = await owner.tenant.findUnique({ where: { code } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
      });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token, personId: user!.personId! };
    }
    h01 = await ctxFor('H.01');
    t2 = (await ctxFor('T2.TEST')) as any;

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
  const api = () => request(app.getHttpServer());

  let okrId: string;
  let kgiId: string;
  let parentGoal: string;
  let leaf1: string;
  let leaf2: string;

  it('tạo OKR (gốc) + KGI (con OKR) — ràng buộc cascade đúng', async () => {
    const okr = await api().post('/api/v1/objectives').set(h01Req())
      .send({ kind: 'okr', nameVi: 'Tăng trưởng tuyển sinh 2026', period: '2026' });
    expect(okr.status).toBe(201);
    okrId = okr.body.id;

    const kgi = await api().post('/api/v1/objectives').set(h01Req())
      .send({ kind: 'kgi', nameVi: 'Đạt 5.000 nhập học', period: '2026', parentId: okrId });
    expect(kgi.status).toBe(201);
    kgiId = kgi.body.id;

    // KGI không parent → 422 · OKR có parent → 422 · KGI parent là KGI → 422
    expect((await api().post('/api/v1/objectives').set(h01Req())
      .send({ kind: 'kgi', nameVi: 'x', period: '2026' })).status).toBe(422);
    expect((await api().post('/api/v1/objectives').set(h01Req())
      .send({ kind: 'okr', nameVi: 'x', period: '2026', parentId: okrId })).status).toBe(422);
    expect((await api().post('/api/v1/objectives').set(h01Req())
      .send({ kind: 'kgi', nameVi: 'x', period: '2026', parentId: kgiId })).status).toBe(422);
  });

  it('goal gắn KGI (không gắn thẳng OKR) + goal con', async () => {
    const bad = await api().post('/api/v1/goals').set(h01Req())
      .send({ nameVi: 'x', period: '2026', ownerId: h01.personId, objectiveId: okrId });
    expect(bad.status).toBe(422);

    const p = await api().post('/api/v1/goals').set(h01Req())
      .send({ nameVi: 'Phủ kênh tuyển sinh', period: '2026', ownerId: h01.personId, objectiveId: kgiId });
    expect(p.status).toBe(201);
    parentGoal = p.body.id;

    const l1 = await api().post('/api/v1/goals').set(h01Req())
      .send({ nameVi: 'Kênh online', period: '2026', ownerId: h01.personId, parentGoalId: parentGoal, weight: 60 });
    const l2 = await api().post('/api/v1/goals').set(h01Req())
      .send({ nameVi: 'Kênh trường THPT', period: '2026', ownerId: h01.personId, parentGoalId: parentGoal, weight: 40 });
    expect(l1.status).toBe(201);
    expect(l2.status).toBe(201);
    leaf1 = l1.body.id;
    leaf2 = l2.body.id;
  });

  it('health roll-up: leaf 80/30 (60/40) → cha 60 → at_risk', async () => {
    const r1 = await api().patch(`/api/v1/goals/${leaf1}/progress`).set(h01Req())
      .send({ progressPct: 80 });
    expect(r1.status).toBe(200);
    expect(Number(r1.body.healthScore)).toBe(80);
    expect(r1.body.status).toBe('active');

    const r2 = await api().patch(`/api/v1/goals/${leaf2}/progress`).set(h01Req())
      .send({ progressPct: 30 });
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('off_track');

    // cha: (80*60 + 30*40) / 100 = 60 → at_risk
    const goals = await api().get('/api/v1/goals').set(h01Req());
    const parent = goals.body.find((g: any) => g.id === parentGoal);
    expect(Number(parent.healthScore)).toBe(60);
    expect(parent.status).toBe('at_risk');
  });

  it('[F17] concurrency: 2 leaf cập nhật SONG SONG → cha vẫn đúng trung bình trọng số', async () => {
    const [r1, r2] = await Promise.all([
      api().patch(`/api/v1/goals/${leaf1}/progress`).set(h01Req()).send({ progressPct: 100 }),
      api().patch(`/api/v1/goals/${leaf2}/progress`).set(h01Req()).send({ progressPct: 50 }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // cha: (100*60 + 50*40)/100 = 80 — advisory lock serialize, không lost update
    const parent = await owner.goal.findFirst({ where: { id: parentGoal } });
    expect(Number(parent!.healthScore)).toBe(80);
  });

  it('không cho cập nhật progress trực tiếp trên goal cha (422)', async () => {
    const res = await api().patch(`/api/v1/goals/${parentGoal}/progress`).set(h01Req())
      .send({ progressPct: 99 });
    expect(res.status).toBe(422);
  });

  it('cascade tree: OKR → KGI → goal → 2 goal con', async () => {
    const res = await api().get(`/api/v1/objectives/${okrId}/cascade`).set(h01Req());
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('okr');
    const kgi = res.body.children.find((c: any) => c.id === kgiId);
    expect(kgi).toBeDefined();
    const goal = kgi.goals.find((g: any) => g.id === parentGoal);
    expect(goal.children.map((c: any) => c.id).sort()).toEqual([leaf1, leaf2].sort());
  });

  it('CÔ LẬP: T2 không thấy objective/goal của H.01', async () => {
    const objs = await api().get('/api/v1/objectives').set(t2Req());
    expect(objs.body.map((o: any) => o.id)).not.toContain(okrId);
    const cascade = await api().get(`/api/v1/objectives/${okrId}/cascade`).set(t2Req());
    expect(cascade.status).toBe(404);
    const goals = await api().get('/api/v1/goals').set(t2Req());
    expect(goals.body.map((g: any) => g.id)).not.toContain(parentGoal);
  });
});
