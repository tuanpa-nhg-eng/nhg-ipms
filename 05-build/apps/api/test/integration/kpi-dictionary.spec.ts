/**
 * Integration Phase 3 lát 4h — Từ điển KPI chuẩn + hard-block gắn KPI (Q1 CHẶN CỨNG):
 * GET /kpi-dictionary (20 metric, lọc domain) · canonical publish/import as_canonical
 * BẮT BUỘC kpiRef trỏ KPI thật; thiếu/treo → 422; link dictionary hợp lệ → OK.
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

const cell = (code: string, over: Record<string, unknown> = {}) => ({
  code, nameVi: `Tác vụ ${code}`,
  responsibleRole: 'r', accountableRole: 'a',
  inputs: ['i'], outputs: ['o'], measures: [{ name: 'm' }], aiLevel: 'assist',
  ...over,
});

describe('Phase 3 lát 4h — KPI dictionary + hard-block', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let curator: Ctx;
  let emp: Ctx;
  let deptId: string;
  const uniq = Date.now();
  const code = (s: string) => `BU4H-${s}-${uniq % 100000}`;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(tc: string, pre: string): Promise<Ctx> {
      const t = await owner.tenant.findUnique({ where: { code: tc } });
      const u = await owner.appUser.findFirst({ where: { tenantId: t!.id, email: { startsWith: pre } } });
      const token = jwt.sign({ sub: u!.id, tid: t!.id, email: u!.email }, getJwtSecret(), { expiresIn: '1h' });
      return { id: t!.id, token, userId: u!.id };
    }
    author = await ctxFor('H.01', 'author@');
    curator = await ctxFor('H.01', 'curator@');
    emp = await ctxFor('H.01', 'emp1@');
    deptId = (await owner.orgUnit.findFirst({ where: { tenantId: author.id, code: 'ADMISSIONS' } }))!.id;
    await owner.taskCell.deleteMany({ where: { code: { startsWith: 'BU4H-' } } });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await owner?.taskCell.deleteMany({ where: { code: { startsWith: 'BU4H-' } } });
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  it('GET /kpi-dictionary: 20 metric chuẩn; lọc domain; nhân viên (kpi:read) cũng đọc được', async () => {
    const r = await api().get('/api/v1/kpi-dictionary').set(as(author));
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(20);
    expect(r.body.every((k: any) => k.isDictionary)).toBe(true);
    const adm = r.body.find((k: any) => k.code === 'ADM-LEAD-001');
    expect(adm.definition).toBeTruthy();
    expect(adm.grain).toBe('1 lead');

    const ts = await api().get('/api/v1/kpi-dictionary?domain=Giờ giảng').set(as(author));
    expect(ts.body.length).toBeGreaterThan(0);
    expect(ts.body.every((k: any) => k.code.startsWith('TCH'))).toBe(true);

    // employee cũng có kpi:read → đọc được từ điển (mọi vai trò tra được KPI)
    expect((await api().get('/api/v1/kpi-dictionary').set(as(emp))).status).toBe(200);
  });

  const publishFlow = async (payload: Record<string, unknown>) => {
    const c = await api().post('/api/v1/library/contributions').set(as(author))
      .send({ type: 'task_cell', orgUnitId: deptId, payload });
    if (c.status !== 201) return c;
    await api().post(`/api/v1/library/contributions/${c.body.id}/submit`).set(as(author));
    await api().post(`/api/v1/library/contributions/${c.body.id}/review`).set(as(curator))
      .send({ action: 'approve' });
    return api().post(`/api/v1/library/contributions/${c.body.id}/publish`).set(as(curator));
  };

  it('[Q1] publish cell KHÔNG gắn KPI → 422 (chặn cứng)', async () => {
    const r = await publishFlow(cell(code('NOKPI')));
    expect(r.status).toBe(422);
    expect(r.body.error.message).toContain('KPI');
  });

  it('[Q1] publish cell gắn KPI TREO (không tồn tại) → 422', async () => {
    const r = await publishFlow(cell(code('BADKPI'), { kpiRef: 'ZZZ-NOPE-999' }));
    expect(r.status).toBe(422);
    expect(r.body.error.message).toContain('không tồn tại');
  });

  it('[Q1] publish cell gắn KPI dictionary hợp lệ → 201 + cell.kpiRef set', async () => {
    const r = await publishFlow(cell(code('OKKPI'), { kpiRef: 'FIN-REV-005' }));
    expect(r.status).toBe(201);
    const saved = await owner.taskCell.findFirst({
      where: { tenantId: author.id, code: code('OKKPI'), configVersionId: null },
    });
    expect(saved!.kpiRef).toBe('FIN-REV-005');
  });

  it('[Q1] import as_canonical: row thiếu KPI → 422 (không ghi cell nào)', async () => {
    const prev = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_canonical', rows: [cell(code('IMP1'), { kpiRef: 'ADM-ENR-005' }), cell(code('IMP2'))],
    });
    expect(prev.status).toBe(201);
    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(applied.status).toBe(422);
    // tx rollback — kể cả row hợp lệ IMP1 cũng không ghi
    expect(await owner.taskCell.findFirst({
      where: { tenantId: curator.id, code: code('IMP1'), configVersionId: null },
    })).toBeNull();
  });

  it('[Q1] import as_canonical: mọi row gắn KPI thật → applied', async () => {
    const prev = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_canonical', rows: [
        cell(code('IMP3'), { kpiRef: 'TCH-ACT-001' }),
        cell(code('IMP4'), { kpiRef: 'FIN-COLR-006' }),
      ],
    });
    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(applied.status).toBe(201);
    expect(applied.body.stats.imported).toBe(2);
  });

  it('as_local KHÔNG bắt buộc KPI (bản nháp version — active sau khi bổ sung KPI)', async () => {
    const v = await (async () => {
      const designer = await owner.appUser.findFirst({
        where: { tenantId: author.id, email: { startsWith: 'designer@' } },
      });
      const token = jwt.sign({ sub: designer!.id, tid: author.id, email: designer!.email }, getJwtSecret(), { expiresIn: '1h' });
      const r = await api().post('/api/v1/config-versions')
        .set({ Authorization: `Bearer ${token}`, 'X-Tenant-Id': author.id })
        .send({ label: `lib4h-local-${uniq}` });
      return r.body.id as string;
    })();
    const prev = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_local', configVersionId: v, rows: [cell(code('LOC1'))], // KHÔNG có KPI
    });
    expect(prev.status).toBe(201);
    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(applied.status).toBe(201); // as_local qua được — chưa canonical
  });
});
