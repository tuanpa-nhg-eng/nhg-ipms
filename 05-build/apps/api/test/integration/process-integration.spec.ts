/**
 * Integration Phase 3 lát 3 — ⑤ Process Designer (step→edge→generate-cells idempotent)
 * + ⑥ Integration Hub CSV (data_contract validate, run stats, outbox, idempotent) + cô lập.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string }

describe('Phase 3 lát 3 — Process Designer + Integration Hub CSV', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;
  let designer: Ctx;
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
      return { id: tenant!.id, token };
    }
    admin = await ctxFor('H.01', 'admin@');
    designer = await ctxFor('H.01', 'designer@');
    emp = await ctxFor('H.01', 'emp1@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

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

  let draftId: string;
  let processId: string;
  let stepIds: string[] = [];

  // ===== ⑤ PROCESS DESIGNER =====
  it('tạo draft version + process (designer); employee → 403', async () => {
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `Proc ${uniq}` });
    draftId = cv.body.id;

    expect((await api().post('/api/v1/processes').set(as(emp))
      .send({ configVersionId: draftId, code: 'X', nameVi: 'x' })).status).toBe(403);

    const p = await api().post('/api/v1/processes').set(as(designer))
      .send({ configVersionId: draftId, code: `TS-PROC-${uniq}`, nameVi: 'Quy trình tư vấn tuyển sinh', domain: 'Tuyển sinh' });
    expect(p.status).toBe(201);
    processId = p.body.id;
  });

  it('thêm steps (seq trùng → 409) + edges (step lạ → 422, self-loop → 422)', async () => {
    const res = await api().post(`/api/v1/processes/${processId}/steps`).set(as(designer)).send({
      steps: [
        { seq: 1, type: 'task', nameVi: 'Tiếp nhận lead', responsibleRole: 'TS-STAFF',
          config: { accountable_role: 'TS-LEAD', ai_level: 'assist', kpi_ref: `DRV-LEAD-X`, measures: { sla_hours: 4 } } },
        { seq: 2, type: 'decision', nameVi: 'Đủ điều kiện?' },
        { seq: 3, type: 'task', nameVi: 'Tư vấn chương trình', responsibleRole: 'TS-STAFF',
          config: { inputs: ['hồ sơ lead'], outputs: ['phiếu tư vấn'] } },
      ],
    });
    expect(res.status).toBe(201);
    stepIds = res.body.map((s: any) => s.id);

    const dupSeq = await api().post(`/api/v1/processes/${processId}/steps`).set(as(designer))
      .send({ steps: [{ seq: 1, type: 'task', nameVi: 'trùng' }] });
    expect(dupSeq.status).toBe(409);

    const edges = await api().post(`/api/v1/processes/${processId}/edges`).set(as(designer)).send({
      edges: [
        { fromStepId: stepIds[0], toStepId: stepIds[1] },
        { fromStepId: stepIds[1], toStepId: stepIds[2], condition: 'đủ điều kiện' },
      ],
    });
    expect(edges.status).toBe(201);

    expect((await api().post(`/api/v1/processes/${processId}/edges`).set(as(designer))
      .send({ edges: [{ fromStepId: stepIds[0], toStepId: stepIds[0] }] })).status).toBe(422);
    expect((await api().post(`/api/v1/processes/${processId}/edges`).set(as(designer))
      .send({ edges: [{ fromStepId: stepIds[0], toStepId: '018f0000-0000-7000-8000-00000000dead' }] })).status).toBe(422);
  });

  it('generate-cells: sinh Task Cell từ step type=task; chạy lại IDEMPOTENT (sync, không nhân đôi)', async () => {
    const gen = await api().post(`/api/v1/processes/${processId}/generate-cells`).set(as(designer));
    expect(gen.status).toBe(201);
    expect(gen.body.created).toBe(2); // 2 step type=task (decision không sinh cell)
    expect(gen.body.cells[0].code).toBe(`TS-PROC-${uniq}-S01`);
    expect(gen.body.cells[0].accountableRole).toBe('TS-LEAD');
    expect(gen.body.cells[0].kpiRef).toBe('DRV-LEAD-X');
    expect(gen.body.cells[0].processStepId).toBe(stepIds[0]);

    const rerun = await api().post(`/api/v1/processes/${processId}/generate-cells`).set(as(designer));
    expect(rerun.body.created).toBe(0);
    expect(rerun.body.updated).toBe(2);

    const count = await owner.taskCell.count({
      where: { tenantId: admin.id, configVersionId: draftId, deletedAt: null },
    });
    expect(count).toBe(2); // không nhân đôi
  });

  // ===== ⑥ INTEGRATION HUB CSV =====
  it('data_contract: tạo contract CSV (integration:bind — admin); schema rỗng → 422', async () => {
    expect((await api().post('/api/v1/integrations/contracts').set(as(admin))
      .send({ provider: 'csv', schema: {} })).status).toBe(422);

    const res = await api().post('/api/v1/integrations/contracts').set(as(admin)).send({
      provider: 'csv', direction: 'in',
      schema: { required: ['externalId', 'type', 'ownerEmployeeCode'], fields: { value: { type: 'number' } } },
    });
    expect(res.status).toBe(201);
  });

  it('import CSV: validate contract (row thiếu field → failed, không chặn row khác) + run stats + outbox', async () => {
    const res = await api().post('/api/v1/integrations/import/csv').set(as(admin)).send({
      sourceSystem: `csv-${uniq}`,
      rows: [
        { externalId: 'CSV-1', type: 'metric', ownerEmployeeCode: 'H.01-EMP1', value: 42 },
        { externalId: 'CSV-2', type: 'metric', ownerEmployeeCode: 'H.01-EMP1', value: 'not-a-number' }, // sai type
        { externalId: 'CSV-3', type: 'document' }, // thiếu ownerEmployeeCode
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('partial');
    expect(res.body.stats.created).toBe(1);
    expect(res.body.stats.contract_failed).toBe(2);
    expect(res.body.contractFailed).toHaveLength(2);

    // run ghi lại
    const runs = await api().get('/api/v1/integrations/runs').set(as(admin));
    const run = runs.body.find((r: any) => r.id === res.body.runId);
    expect(run.status).toBe('partial');
    expect(run.stats.rows).toBe(3);

    // outbox event pending
    const events = await owner.outboxEvent.findMany({
      where: { tenantId: admin.id, aggregateId: res.body.runId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('evidence.batch_imported');
    expect(events[0].status).toBe('pending');

    // evidence đã vào hub với payload.value
    const ev = await owner.evidence.findFirst({
      where: { tenantId: admin.id, sourceSystem: `csv-${uniq}`, externalId: 'CSV-1' },
    });
    expect((ev!.payload as any).value).toBe(42);
  });

  it('import CSV chạy lại → idempotent (updated, không nhân bản)', async () => {
    const res = await api().post('/api/v1/integrations/import/csv').set(as(admin)).send({
      sourceSystem: `csv-${uniq}`,
      rows: [{ externalId: 'CSV-1', type: 'metric', ownerEmployeeCode: 'H.01-EMP1', value: 99 }],
    });
    expect(res.body.stats.created).toBe(0);
    expect(res.body.stats.updated).toBe(1);
    const count = await owner.evidence.count({
      where: { tenantId: admin.id, sourceSystem: `csv-${uniq}`, externalId: 'CSV-1' },
    });
    expect(count).toBe(1);
  });

  it('permission: employee không import (403); connection cần integration:connect (admin OK, designer 403)', async () => {
    expect((await api().post('/api/v1/integrations/import/csv').set(as(emp))
      .send({ sourceSystem: 'x', rows: [{ externalId: '1', type: 'metric' }] })).status).toBe(403);

    expect((await api().post('/api/v1/integrations/connections').set(as(designer))
      .send({ provider: 'csv' })).status).toBe(403);
    const conn = await api().post('/api/v1/integrations/connections').set(as(admin))
      .send({ provider: 'csv', displayName: 'CSV nội bộ' });
    expect(conn.status).toBe(201);
    expect(conn.body.authRef).toBeNull(); // không nhận token thô
  });

  it('CÔ LẬP: T2 không thấy process/run/cells của H.01', async () => {
    const procs = await api().get('/api/v1/processes').set(as(t2admin));
    expect(procs.body.map((p: any) => p.id)).not.toContain(processId);
    const runs = await api().get('/api/v1/integrations/runs').set(as(t2admin));
    expect(runs.body.every((r: any) => r.tenantId === t2admin.id)).toBe(true);
  });
});
