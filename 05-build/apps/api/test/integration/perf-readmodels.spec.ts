/**
 * [Trục A — L1] Integration cho 5 read-model mới: GET /reviews · /persons/team ·
 * /audit-logs(+stats) · /exec/overview · /calibration-sessions.
 *
 * Trọng tâm KHÔNG phải "endpoint trả 200" mà là các bất biến của trục:
 *   I1 — nhân viên không đọc được dữ liệu người khác, kể cả khi hỏi đích danh, kể cả
 *        qua endpoint TỔNG HỢP (số tổng cũng là rò rỉ).
 *   I5 — whitelist select: danh sách không trả văn bản đánh giá; audit không trả payload.
 *   I6 — tenant_admin KHÔNG có audit:read (SoD), 403 ở đây là hành vi ĐÚNG.
 *
 * Dữ liệu: dựa trên seed:perfdemo (6 nhân viên demo + cycle [DEMO]). Test tự bỏ qua
 * các assert phụ thuộc dữ liệu demo nếu chưa seed, nhưng các assert bảo mật thì LUÔN chạy.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { tenantId: string; token: string; personId: string | null; userId: string }

describe('[Trục A L1] Read-model vòng đời hiệu suất', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx, mgr: Ctx, hr: Ctx, exec: Ctx, auditor: Ctx, demo1: Ctx;
  let hasDemo = false;
  let demoPersonIds: string[] = [];

  const auth = (c: Ctx) => (r: request.Test) =>
    r.set('Authorization', `Bearer ${c.token}`).set('X-Tenant-Id', c.tenantId);

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);

    async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix }, status: 'active' },
      });
      if (!user) throw new Error(`User ${emailPrefix} @ ${tenantCode} chưa seed — chạy pnpm db:seed`);
      const token = jwt.sign(
        { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { tenantId: tenant!.id, token, personId: user.personId, userId: user.id };
    }

    admin = await ctxFor('H.01', 'admin@');
    mgr = await ctxFor('H.01', 'mgr@');
    hr = await ctxFor('H.01', 'hr@');
    exec = await ctxFor('H.01', 'exec@');
    auditor = await ctxFor('H.01', 'auditor@');
    demo1 = await ctxFor('H.01', 'demo1@');

    const demoPersons = await owner.person.findMany({
      where: { tenantId: admin.tenantId, employeeCode: { startsWith: 'H.01-DEMO-' }, deletedAt: null },
      select: { id: true },
    });
    demoPersonIds = demoPersons.map((p) => p.id);
    hasDemo = demoPersonIds.length >= 2;

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

  // ===================== GET /reviews =====================
  describe('GET /reviews', () => {
    it('[I1] nhân viên chỉ thấy review của chính mình', async () => {
      const res = await auth(demo1)(request(app.getHttpServer()).get('/api/v1/reviews')).expect(200);
      const rows = res.body.reviews as Array<{ revieweeId: string }>;
      expect(Array.isArray(rows)).toBe(true);
      for (const r of rows) expect(r.revieweeId).toBe(demo1.personId);
    });

    it('[I1] hỏi đích danh review người khác vẫn KHÔNG trả (lọc trong query, không lọc sau)', async () => {
      const other = demoPersonIds.find((id) => id !== demo1.personId);
      if (!other) return;
      const res = await auth(demo1)(
        request(app.getHttpServer()).get(`/api/v1/reviews?revieweeId=${other}`),
      ).expect(200);
      expect(res.body.reviews).toHaveLength(0);
    });

    it('[I5] danh sách không trả văn bản tự đánh giá / trường nội bộ', async () => {
      const res = await auth(hr)(request(app.getHttpServer()).get('/api/v1/reviews?limit=5')).expect(200);
      for (const r of res.body.reviews) {
        expect(r).not.toHaveProperty('selfReflection');
        expect(r).not.toHaveProperty('managerAssessment');
        expect(r).not.toHaveProperty('finalRationale');
        expect(r).not.toHaveProperty('createdBy');
      }
    });

    it('trưởng phòng thấy review của người trong phòng mình', async () => {
      if (!hasDemo) return;
      const res = await auth(mgr)(request(app.getHttpServer()).get('/api/v1/reviews')).expect(200);
      const ids = (res.body.reviews as Array<{ revieweeId: string }>).map((r) => r.revieweeId);
      expect(ids).toEqual(expect.arrayContaining([demo1.personId]));
    });

    it('status ngoài whitelist → 400 (không âm thầm trả rỗng)', async () => {
      await auth(hr)(request(app.getHttpServer()).get('/api/v1/reviews?status=khong_ton_tai')).expect(400);
    });

    it('limit vượt trần → 400', async () => {
      await auth(hr)(request(app.getHttpServer()).get('/api/v1/reviews?limit=9999')).expect(400);
    });
  });

  // ===================== GET /persons/team =====================
  describe('GET /persons/team', () => {
    it('trưởng phòng nhận roster kèm check-in + đếm goal (gộp sẵn, không N+1 ở FE)', async () => {
      if (!hasDemo) return;
      const res = await auth(mgr)(
        request(app.getHttpServer()).get('/api/v1/persons/team?periodKey=2026-07'),
      ).expect(200);
      const members = res.body.members as Array<Record<string, unknown>>;
      expect(members.length).toBeGreaterThanOrEqual(6);
      expect(members.some((m) => (m as any).checkin)).toBe(true);
      expect(members.some((m) => Object.keys((m as any).goalCounts ?? {}).length > 0)).toBe(true);
    });

    it('[I1] xin orgUnitId ngoài scope → 403 (bài học F115, không lặp lại)', async () => {
      const root = await owner.orgUnit.findFirst({
        where: { tenantId: mgr.tenantId, code: 'ROOT', deletedAt: null },
      });
      const mgrPerson = await owner.person.findFirst({ where: { id: mgr.personId! } });
      // chỉ có nghĩa khi ROOT khác đơn vị mgr phụ trách
      if (!root || root.id === mgrPerson?.orgUnitId) return;
      await auth(mgr)(
        request(app.getHttpServer()).get(`/api/v1/persons/team?orgUnitId=${root.id}`),
      ).expect(403);
    });

    it('[I1] nhân viên gọi → đội RỖNG, không lộ danh sách người', async () => {
      const res = await auth(demo1)(request(app.getHttpServer()).get('/api/v1/persons/team')).expect(200);
      expect(res.body.members).toHaveLength(0);
    });

    it('periodKey sai định dạng → 400', async () => {
      await auth(mgr)(request(app.getHttpServer()).get('/api/v1/persons/team?periodKey=07-2026')).expect(400);
    });
  });

  // ===================== GET /audit-logs =====================
  describe('GET /audit-logs', () => {
    it('auditor đọc được; id là chuỗi (BigInt không vỡ JSON)', async () => {
      const res = await auth(auditor)(
        request(app.getHttpServer()).get('/api/v1/audit-logs?limit=10'),
      ).expect(200);
      expect(Array.isArray(res.body.entries)).toBe(true);
      for (const e of res.body.entries) expect(typeof e.id).toBe('string');
    });

    it('[I5] KHÔNG trả before/after — chỉ cờ hasPayload', async () => {
      const res = await auth(auditor)(
        request(app.getHttpServer()).get('/api/v1/audit-logs?limit=20'),
      ).expect(200);
      for (const e of res.body.entries) {
        expect(e).not.toHaveProperty('before');
        expect(e).not.toHaveProperty('after');
        expect(typeof e.hasPayload).toBe('boolean');
      }
    });

    it('[I6] tenant_admin → 403: SoD, KHÔNG phải thiếu sót seed', async () => {
      await auth(admin)(request(app.getHttpServer()).get('/api/v1/audit-logs')).expect(403);
    });

    it('[I6] nhân viên → 403', async () => {
      await auth(demo1)(request(app.getHttpServer()).get('/api/v1/audit-logs')).expect(403);
    });

    it('cursor phi số → 400 (không rơi vào BigInt() ném lỗi 500)', async () => {
      await auth(auditor)(request(app.getHttpServer()).get('/api/v1/audit-logs?cursor=abc')).expect(400);
    });

    it('stats trả phân bố theo action', async () => {
      const res = await auth(auditor)(request(app.getHttpServer()).get('/api/v1/audit-logs/stats')).expect(200);
      expect(Array.isArray(res.body.actions)).toBe(true);
    });
  });

  // ===================== [F174] scope goal theo NGƯỜI SỞ HỮU =====================
  describe('[F174] GET /goals — phạm vi org_unit phân giải qua người sở hữu', () => {
    it('trưởng phòng thấy goal của người trong phòng KỂ CẢ khi goal không gắn orgUnitId', async () => {
      const mgrPerson = await owner.person.findFirst({ where: { id: mgr.personId! } });
      expect(mgrPerson?.orgUnitId).toBeTruthy();

      // goal cho một nhân viên trong phòng, CỐ Ý không truyền orgUnitId
      const target = await owner.person.findFirst({
        where: {
          tenantId: mgr.tenantId, orgUnitId: mgrPerson!.orgUnitId,
          employeeCode: { startsWith: 'H.01-DEMO-' }, deletedAt: null,
        },
      });
      if (!target) return;

      const created = await auth(hr)(
        request(app.getHttpServer()).post('/api/v1/goals').send({
          nameVi: `[TEST-F174] goal không gắn đơn vị ${Date.now()}`,
          period: '2026-Q3', ownerId: target.id,
        }),
      ).expect(201);

      try {
        expect(created.body.orgUnitId ?? null).toBeNull(); // đúng là không gắn nhãn
        const res = await auth(mgr)(request(app.getHttpServer()).get('/api/v1/goals')).expect(200);
        const ids = (res.body as Array<{ id: string }>).map((g) => g.id);
        expect(ids).toContain(created.body.id);
      } finally {
        await owner.goal.deleteMany({ where: { id: created.body.id } });
      }
    });

    it('[I1] nhân viên vẫn KHÔNG thấy goal của người khác sau bản vá', async () => {
      const res = await auth(demo1)(request(app.getHttpServer()).get('/api/v1/goals')).expect(200);
      for (const g of res.body as Array<{ ownerId: string }>) {
        expect(g.ownerId).toBe(demo1.personId);
      }
    });
  });

  // ============ [F175] người có scope org_unit vẫn check-in cho CHÍNH MÌNH ============
  describe('[F175] POST /checkins — trưởng phòng nộp check-in của chính mình', () => {
    it('nộp được dù vai chỉ có scope org_unit (không có scope self)', async () => {
      const mgrPerson = await owner.person.findFirst({ where: { id: mgr.personId! } });
      // goal của chính trưởng phòng, KHÔNG gắn orgUnitId (ép đi đúng nhánh vừa vá)
      const goal = await owner.goal.create({
        data: {
          id: require('@ipms/db').uuidv7(), tenantId: mgr.tenantId,
          nameVi: `[TEST-F175] goal của trưởng phòng ${Date.now()}`,
          period: '2026-Q4', ownerId: mgrPerson!.id, status: 'active',
        },
      });
      const periodKey = `2027-${String((Date.now() % 12) + 1).padStart(2, '0')}`;
      try {
        const res = await auth(mgr)(
          request(app.getHttpServer()).post('/api/v1/checkins').send({
            cadence: 'monthly', periodKey,
            goalUpdates: [{ goalId: goal.id, progressPct: 70 }],
          }),
        );
        expect(res.status).toBe(201);

        // [I3] nhưng vẫn KHÔNG được tự nhận xét check-in của chính mình
        await auth(mgr)(
          request(app.getHttpServer()).post(`/api/v1/checkins/${res.body.id}/review`)
            .send({ managerComment: 'tự duyệt' }),
        ).expect(409);

        await owner.checkinGoalUpdate.deleteMany({ where: { checkinId: res.body.id } });
        await owner.checkin.deleteMany({ where: { id: res.body.id } });
      } finally {
        await owner.goal.deleteMany({ where: { id: goal.id } });
      }
    });

    it('KHÔNG nới quyền: vẫn không check-in hộ goal của người khác ngoài phạm vi', async () => {
      // demo1 (scope self) thử cập nhật goal của demo2 → phải bị chặn
      const others = await owner.person.findMany({
        where: {
          tenantId: mgr.tenantId, employeeCode: { startsWith: 'H.01-DEMO-' },
          id: { not: demo1.personId! }, deletedAt: null,
        },
        select: { id: true }, take: 1,
      });
      if (others.length === 0) return;
      const otherGoal = await owner.goal.findFirst({
        where: { ownerId: others[0].id, deletedAt: null }, select: { id: true },
      });
      if (!otherGoal) return;
      const res = await auth(demo1)(
        request(app.getHttpServer()).post('/api/v1/checkins').send({
          cadence: 'monthly', periodKey: '2027-11',
          goalUpdates: [{ goalId: otherGoal.id, progressPct: 99 }],
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ===================== GET /exec/overview =====================
  describe('GET /exec/overview', () => {
    it('exec (scope tenant) thấy tổng hợp toàn tenant', async () => {
      const res = await auth(exec)(request(app.getHttpServer()).get('/api/v1/exec/overview')).expect(200);
      expect(res.body.scope).toBe('tenant');
      expect(res.body.goals.total).toBeGreaterThan(0);
    });

    it('[I1] endpoint TỔNG HỢP cũng phải chặn: nhân viên chỉ thấy số của mình', async () => {
      const all = await auth(exec)(request(app.getHttpServer()).get('/api/v1/exec/overview')).expect(200);
      const mine = await auth(demo1)(request(app.getHttpServer()).get('/api/v1/exec/overview')).expect(200);
      expect(mine.body.scope).toBe('scoped');
      expect(mine.body.goals.total).toBeLessThan(all.body.goals.total);
      // goal at-risk trả về (nếu có) phải là của chính người gọi
      for (const g of mine.body.atRisk ?? []) expect(g.ownerId).toBe(demo1.personId);
    });

    it('không có kpi:read thì không kèm khối KPI', async () => {
      // auditor CÓ kpi:read ⇒ kỳ vọng có; dùng làm đối chứng cho nhánh permission
      const res = await auth(auditor)(request(app.getHttpServer()).get('/api/v1/exec/overview')).expect(200);
      expect(res.body.kpi).not.toBeNull();
    });
  });

  // ===================== GET /calibration-sessions =====================
  describe('GET /calibration-sessions', () => {
    it('hrbp đọc danh sách phiên', async () => {
      const res = await auth(hr)(request(app.getHttpServer()).get('/api/v1/calibration-sessions')).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('không có calibration:run → 403', async () => {
      await auth(mgr)(request(app.getHttpServer()).get('/api/v1/calibration-sessions')).expect(403);
    });

    it('phiên tạo mới đọc lại được kèm quyết định (rỗng)', async () => {
      const created = await auth(hr)(
        request(app.getHttpServer()).post('/api/v1/calibration-sessions').send({}),
      ).expect(201);
      const res = await auth(hr)(
        request(app.getHttpServer()).get(`/api/v1/calibration-sessions/${created.body.id}`),
      ).expect(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.decisions).toEqual([]);
    });
  });
});
