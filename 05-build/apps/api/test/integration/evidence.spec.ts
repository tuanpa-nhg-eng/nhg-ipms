/**
 * Integration Phase 1 lát 4: Evidence Hub — manual create, verify human-in-the-loop,
 * bulk connector idempotent theo (source, external_id), cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(60_000);

describe('Evidence Hub (integration)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let h01: { id: string; token: string };
  let t2: { id: string; token: string };
  const uniq = Date.now();
  const SRC = `csv-test-${uniq}`;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(code: string) {
      const tenant = await owner.tenant.findUnique({ where: { code } });
      const user = await owner.appUser.findFirst({ where: { tenantId: tenant!.id } });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token };
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
  const api = () => request(app.getHttpServer());

  let evidenceId: string;

  it('tạo evidence manual → pending', async () => {
    const res = await api().post('/api/v1/evidence').set(h01Req())
      .send({ type: 'document', uri: 'https://example.local/report.pdf', payload: { note: 'BC tháng 6' } });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.sourceSystem).toBe('manual');
    evidenceId = res.body.id;
  });

  it('verify human-in-the-loop: pending → verified, chống verify lặp (409)', async () => {
    const ok = await api().post(`/api/v1/evidence/${evidenceId}/verify`).set(h01Req())
      .send({ decision: 'verified' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('verified');
    expect(ok.body.reviewerId).toBeTruthy();

    const again = await api().post(`/api/v1/evidence/${evidenceId}/verify`).set(h01Req())
      .send({ decision: 'rejected' });
    expect(again.status).toBe(409);
  });

  it('bulk sync idempotent: chạy 2 lần cùng external_id → lần 1 created, lần 2 updated (không nhân bản)', async () => {
    const payload = {
      sourceSystem: SRC,
      records: [
        { externalId: 'ROW-1', type: 'metric', payload: { value: 120 } },
        { externalId: 'ROW-2', type: 'task', payload: { done: true } },
      ],
    };
    const first = await api().post('/api/v1/evidence/bulk').set(h01Req()).send(payload);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(2);
    expect(first.body.updated).toBe(0);

    const second = await api().post('/api/v1/evidence/bulk').set(h01Req()).send({
      ...payload,
      records: payload.records.map((r) => ({ ...r, payload: { ...r.payload, rerun: true } })),
    });
    expect(second.body.created).toBe(0);
    expect(second.body.updated).toBe(2);

    const rows = await owner.evidence.findMany({ where: { tenantId: h01.id, sourceSystem: SRC } });
    expect(rows).toHaveLength(2); // không nhân bản
    expect((rows[0].payload as any).rerun).toBe(true); // đã cập nhật
  });

  it('bulk: KPI code không tồn tại → vào failed[], không chặn record khác', async () => {
    const res = await api().post('/api/v1/evidence/bulk').set(h01Req()).send({
      sourceSystem: SRC,
      records: [
        { externalId: 'ROW-3', type: 'metric', relatedKpiCode: 'KHONG-TON-TAI' },
        { externalId: 'ROW-4', type: 'metric' },
      ],
    });
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toHaveLength(1);
    expect(res.body.failed[0].externalId).toBe('ROW-3');
  });

  it('CÔ LẬP: T2 không thấy evidence H.01; cùng external_id ở T2 tạo dòng riêng', async () => {
    const list = await api().get('/api/v1/evidence').set(t2Req());
    expect(list.body.map((e: any) => e.id)).not.toContain(evidenceId);

    // T2 dùng cùng (source, external_id) → không đụng dữ liệu H.01 (unique có tenant_id)
    const res = await api().post('/api/v1/evidence/bulk').set(t2Req()).send({
      sourceSystem: SRC,
      records: [{ externalId: 'ROW-1', type: 'metric' }],
    });
    expect(res.body.created).toBe(1);

    const h01Rows = await owner.evidence.count({ where: { tenantId: h01.id, sourceSystem: SRC, externalId: 'ROW-1' } });
    const t2Rows = await owner.evidence.count({ where: { tenantId: t2.id, sourceSystem: SRC, externalId: 'ROW-1' } });
    expect(h01Rows).toBe(1);
    expect(t2Rows).toBe(1);
  });
});
