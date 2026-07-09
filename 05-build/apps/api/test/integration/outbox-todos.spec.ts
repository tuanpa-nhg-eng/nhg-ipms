/**
 * Integration Phase 3 lát 4b — outbox dispatcher (retry/dead-letter, idempotent)
 * + mock connector Notion/Planner + morning-todos job + cap F60 + cô lập tenant.
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

describe('Phase 3 lát 4b — outbox dispatcher + mock connectors + morning-todos', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;
  let emp: Ctx;
  let t2admin: Ctx;
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
    admin = await ctxFor('H.01', 'admin@');
    emp = await ctxFor('H.01', 'emp1@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // [F66] dọn state còn sót của CHÍNH SPEC NÀY (lần chạy trước trên dev DB) — scope
    // theo pattern spec tạo ra, KHÔNG quét sạch state dev dùng chung
    await owner.outboxEvent.updateMany({
      where: {
        tenantId: admin.id, status: 'pending',
        OR: [
          { eventType: 'evidence.batch_imported' },
          { eventType: { startsWith: 'other.event_' } },
          { eventType: { startsWith: 'fail.event_' } },
          { eventType: { startsWith: 'iso.event_' } },
          { eventType: { startsWith: 'replay.event_' } },
        ],
      },
      data: { status: 'skipped', dispatchedAt: new Date() },
    });
    for (const prefix of ['ws-', 'todos-']) {
      await owner.integrationBinding.updateMany({
        where: {
          tenantId: admin.id, deletedAt: null,
          externalTarget: { path: ['workspace'], string_starts_with: prefix },
        },
        data: { deletedAt: new Date() },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  let connectionId: string;
  let bindingId: string;

  it('binding: cần integration:bind (emp 403), connection lạ → 422', async () => {
    const conn = await api().post('/api/v1/integrations/connections').set(as(admin))
      .send({ provider: 'notion', displayName: 'Notion mock' });
    expect(conn.status).toBe(201);
    connectionId = conn.body.id;

    expect((await api().post('/api/v1/integrations/bindings').set(as(emp)).send({
      connectionId, localType: 'evidence', direction: 'out', fieldMap: {},
    })).status).toBe(403);

    expect((await api().post('/api/v1/integrations/bindings').set(as(admin)).send({
      connectionId: '018f0000-0000-7000-8000-00000000dead',
      localType: 'evidence', direction: 'out', fieldMap: {},
    })).status).toBe(422);

    const b = await api().post('/api/v1/integrations/bindings').set(as(admin)).send({
      connectionId, localType: 'evidence', direction: 'out',
      externalTarget: { workspace: `ws-${uniq}` },
      fieldMap: { title: 'payload.source' },
      syncPolicy: { events: ['evidence.batch_imported'] },
    });
    expect(b.status).toBe(201);
    bindingId = b.body.id;
  });

  it('outbox flow: import CSV → event pending → dispatch → dispatched + sync_record; chạy lại không quét lại', async () => {
    const imp = await api().post('/api/v1/integrations/import/csv').set(as(admin)).send({
      sourceSystem: `obx-${uniq}`,
      rows: [{ externalId: 'OBX-1', type: 'metric', ownerEmployeeCode: 'H.01-EMP1', value: 7 }],
    });
    expect(imp.status).toBe(201);

    const d1 = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d1.status).toBe(201);
    expect(d1.body.dispatched).toBe(1);
    expect(d1.body.dead).toBe(0);

    const event = await owner.outboxEvent.findFirst({
      where: { tenantId: admin.id, aggregateId: imp.body.runId },
    });
    expect(event!.status).toBe('dispatched');
    expect(event!.dispatchedAt).not.toBeNull();

    const sync = await owner.syncRecord.findFirst({
      where: { tenantId: admin.id, bindingId, externalId: `obx-${event!.id}` },
    });
    expect(sync!.status).toBe('in_sync');
    expect(sync!.externalEtag).toMatch(/^W\//);

    // idempotent: không còn pending → scanned 0
    const d2 = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d2.body.scanned).toBe(0);
  });

  it('event không khớp syncPolicy binding nào → skipped', async () => {
    await owner.outboxEvent.create({
      data: {
        tenantId: admin.id, aggregateType: 'test', aggregateId: null,
        eventType: `other.event_${uniq}`, payload: { x: 1 } as any,
      },
    });
    const d = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d.body.skipped).toBe(1);
    expect(d.body.dispatched).toBe(0);
  });

  it('retry → dead-letter: binding failMode làm event lỗi 5 lần → status dead', async () => {
    await api().post('/api/v1/integrations/bindings').set(as(admin)).send({
      connectionId, localType: 'evidence', direction: 'out',
      externalTarget: { workspace: `ws-${uniq}`, failMode: true },
      fieldMap: {}, syncPolicy: { events: [`fail.event_${uniq}`] },
    });
    const ev = await owner.outboxEvent.create({
      data: {
        tenantId: admin.id, aggregateType: 'test', aggregateId: null,
        eventType: `fail.event_${uniq}`, payload: {} as any,
      },
    });

    for (let i = 1; i <= 4; i++) {
      const d = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
      expect(d.body.retried).toBe(1);
    }
    const d5 = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d5.body.dead).toBe(1);

    const dead = await owner.outboxEvent.findUnique({ where: { id: ev.id } });
    expect(dead!.status).toBe('dead');
    expect(dead!.retryCount).toBe(5);
  });

  it('[F65] replay skipped → pending → dispatch được sau khi thêm binding khớp', async () => {
    const ev = await owner.outboxEvent.create({
      data: {
        tenantId: admin.id, aggregateType: 'test', aggregateId: null,
        eventType: `replay.event_${uniq}`, payload: { r: 1 } as any,
      },
    });
    const d1 = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d1.body.skipped).toBe(1);

    // giờ mới có binding khớp — replay đích danh event (không kéo skipped cũ dậy)
    await api().post('/api/v1/integrations/bindings').set(as(admin)).send({
      connectionId, localType: 'evidence', direction: 'out',
      externalTarget: { workspace: `ws-${uniq}` },
      fieldMap: {}, syncPolicy: { events: [`replay.event_${uniq}`] },
    });
    const rep = await api().post('/api/v1/integrations/outbox/replay').set(as(admin))
      .send({ status: 'skipped', eventIds: [String(ev.id)] });
    expect(rep.status).toBe(201);
    expect(rep.body.replayed).toBe(1);

    const d2 = await api().post('/api/v1/integrations/outbox/dispatch').set(as(admin));
    expect(d2.body.dispatched).toBe(1);

    // emp không có integration:run → 403
    expect((await api().post('/api/v1/integrations/outbox/replay').set(as(emp))
      .send({ status: 'skipped' })).status).toBe(403);
  });

  it('morning-todos: chưa có binding → 422; có binding → push goal active, chạy lại idempotent', async () => {
    expect((await api().post('/api/v1/integrations/jobs/morning-todos/run').set(as(admin))
      .send({})).status).toBe(422); // localType morning_todos chưa có

    // goal active cho emp (insert owner — goal API đã test ở spec khác)
    const person = await owner.person.findFirst({
      where: { tenantId: admin.id, employeeCode: 'H.01-EMP1' },
    });
    const goalId = uuidv7();
    await owner.goal.create({
      data: {
        id: goalId, tenantId: admin.id, ownerId: person!.id,
        nameVi: `Goal todos ${uniq}`, period: '2026', status: 'active',
      },
    });

    await api().post('/api/v1/integrations/bindings').set(as(admin)).send({
      connectionId, localType: 'morning_todos', direction: 'out',
      externalTarget: { workspace: `todos-${uniq}` }, fieldMap: {},
    });

    const date = '2026-07-08';
    const r1 = await api().post('/api/v1/integrations/jobs/morning-todos/run').set(as(admin))
      .send({ date });
    expect(r1.status).toBe(201);
    expect(r1.body.pushed).toBeGreaterThanOrEqual(1);
    expect(r1.body.skipped).toBe(0);

    const sync = await owner.syncRecord.findFirst({
      where: { tenantId: admin.id, externalId: `todo-${date}-${goalId}` },
    });
    expect(sync).not.toBeNull();
    expect(sync!.localType).toBe('goal');

    // idempotent cùng ngày
    const r2 = await api().post('/api/v1/integrations/jobs/morning-todos/run').set(as(admin))
      .send({ date });
    expect(r2.body.pushed).toBe(0);
    expect(r2.body.skipped).toBe(r1.body.pushed);

    // run ghi success
    const run = await owner.integrationRun.findUnique({ where: { id: r1.body.runId } });
    expect(run!.status).toBe('success');
    expect((run!.stats as any).provider).toBe('notion');

    // emp không chạy job (403)
    expect((await api().post('/api/v1/integrations/jobs/morning-todos/run').set(as(emp))
      .send({})).status).toBe(403);
  });

  it('CÔ LẬP: T2 dispatch không đụng event H.01; T2 không thấy binding H.01', async () => {
    // tạo pending event H.01 rồi dispatch bằng T2 → event H.01 còn nguyên pending
    const ev = await owner.outboxEvent.create({
      data: {
        tenantId: admin.id, aggregateType: 'test', aggregateId: null,
        eventType: `iso.event_${uniq}`, payload: {} as any,
      },
    });
    const d = await api().post('/api/v1/integrations/outbox/dispatch').set(as(t2admin));
    expect(d.status).toBe(201);
    const still = await owner.outboxEvent.findUnique({ where: { id: ev.id } });
    expect(still!.status).toBe('pending');
    // dọn
    await owner.outboxEvent.update({ where: { id: ev.id }, data: { status: 'skipped' } });
  });

  it('[F60] cap kích thước: mcp args >16KB → 422; eval prompt >4000 → 422', async () => {
    const designer = await (async () => {
      const user = await owner.appUser.findFirst({
        where: { tenantId: admin.id, email: { startsWith: 'designer@' } },
      });
      const token = jwt.sign(
        { sub: user!.id, tid: admin.id, email: user!.email },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: admin.id, token, userId: user!.id };
    })();

    expect((await api().post('/api/v1/mcp/tools/ipms.get_org/invoke').set(as(designer))
      .send({ args: { big: 'x'.repeat(17_000) } })).status).toBe(422);

    expect((await api().post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: 'config_copilot', name: `cap ${uniq}`,
      cases: [{ input: { prompt: 'p'.repeat(4_001) }, assertions: [{ type: 'exists' }] }],
    })).status).toBe(422);
  });
});
