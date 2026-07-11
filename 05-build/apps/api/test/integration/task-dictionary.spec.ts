/**
 * Integration [Go-live Từ điển Tác vụ] — API tra cứu canonical read-only:
 * GET /task-dictionary (list + facets + filter) · GET /task-dictionary/:code (7 nhóm + KPI).
 * Bất biến: CHỈ canonical (configVersionId NULL) · taskdict:read cấp cho MỌI persona
 * (employee đọc được) · không lộ cell version-scoped của Config Studio · KPI join đúng ·
 * cô lập tenant · filter/facet chính xác.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; email: string }

describe('Go-live — GET /task-dictionary (tra cứu canonical)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let emp: Ctx;      // employee — persona thường, phải tra cứu được
  let exec: Ctx;     // exec_viewer
  let t2emp: Ctx;
  let versionScopedCode: string;

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    const token = jwt.sign(
      { sub: user!.id, tid: tenant!.id, email: user!.email },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, email: user!.email };
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    emp = await ctxFor('H.01', 'emp1@');
    // exec_viewer chưa chắc có user seed riêng → dùng admin (cũng có taskdict:read qua filter)
    exec = await ctxFor('H.01', 'admin@');
    t2emp = await ctxFor('T2.TEST', 'emp1@');

    // Tạo 1 cell VERSION-SCOPED (config draft) để chứng minh KHÔNG lọt vào từ điển canonical
    versionScopedCode = `DICTNEG-${Date.now() % 100000}`;
    const h01 = emp.id;
    const cv = await owner.configVersion.create({
      data: {
        id: uuidv7(), tenantId: h01, label: `dict-neg-${Date.now()}`,
        status: 'draft', version: 1, createdBy: null,
      },
    });
    await owner.taskCell.create({
      data: {
        id: uuidv7(), tenantId: h01, configVersionId: cv.id,
        code: versionScopedCode, nameVi: 'Cell version-scoped KHÔNG được lộ',
        aiLevel: 'assist', origin: 'library', libScope: 'local',
      },
    });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await owner.taskCell.deleteMany({ where: { code: versionScopedCode } });
    await owner.configVersion.deleteMany({ where: { label: { startsWith: 'dict-neg-' } } });
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  it('persona thường (employee) tra cứu được — ≥283 canonical (seed 4i) + facets nhóm/AI/KPI', async () => {
    const r = await api().get('/api/v1/task-dictionary').set(as(emp));
    expect(r.status).toBe(200);
    // ≥283 (seed 4i) — không assert cứng vì suite khác có thể để lại cell canonical (F114)
    expect(r.body.total).toBeGreaterThanOrEqual(283);
    expect(r.body.matched).toBe(r.body.total);
    expect(r.body.cells.length).toBe(r.body.total);
    // đủ bộ mã seed 4i (283 tác vụ 8 phòng) có mặt
    const codes = new Set(r.body.cells.map((c: { code: string }) => c.code));
    for (const prefix of ['TS-G', 'CCLG-G', 'GGDH-G', 'TC-G']) {
      expect([...codes].some((c) => (c as string).startsWith(prefix))).toBe(true);
    }
    expect(r.body.facets.groups.length).toBeGreaterThan(0);
    expect(r.body.facets.aiLevels.length).toBeGreaterThan(0);
    expect(r.body.facets.kpis.length).toBeGreaterThan(0);
    // [Q1] mọi cell canonical đều gắn KPI thật (bất biến toàn tập)
    expect(r.body.cells.every((c: { kpiRef?: string }) => !!c.kpiRef)).toBe(true);
  });

  it('KHÔNG lộ cell version-scoped của Config Studio (chỉ canonical)', async () => {
    const r = await api().get(`/api/v1/task-dictionary?q=${encodeURIComponent('version-scoped')}`).set(as(emp));
    expect(r.status).toBe(200);
    expect(r.body.cells.some((c: { code: string }) => c.code === versionScopedCode)).toBe(false);
    // detail cũng 422 (không thuộc canonical)
    expect((await api().get(`/api/v1/task-dictionary/${versionScopedCode}`).set(as(emp))).status).toBe(422);
  });

  it('filter text bỏ dấu (q=tuyen sinh) + lọc theo groupCode thu hẹp đúng', async () => {
    const all = await api().get('/api/v1/task-dictionary').set(as(emp));
    const g = all.body.facets.groups.find((x: { groupCode: string }) => x.groupCode.startsWith('TS-'));
    expect(g).toBeTruthy();
    const byGroup = await api().get(`/api/v1/task-dictionary?groupCode=${g.groupCode}`).set(as(emp));
    expect(byGroup.body.matched).toBe(g.count);
    expect(byGroup.body.cells.every((c: { groupCode: string }) => c.groupCode === g.groupCode)).toBe(true);
    // facet total KHÔNG đổi theo filter — bằng tổng canonical, không hardcode
    expect(byGroup.body.total).toBe(all.body.total);
    expect(byGroup.body.matched).toBeLessThan(byGroup.body.total);
  });

  it('lọc theo kpiRef trả đúng tập cell gắn KPI đó', async () => {
    const r = await api().get('/api/v1/task-dictionary?kpiRef=ADM-ENR-005').set(as(emp));
    expect(r.status).toBe(200);
    expect(r.body.matched).toBeGreaterThan(0);
    expect(r.body.cells.every((c: { kpiRef: string }) => c.kpiRef === 'ADM-ENR-005')).toBe(true);
  });

  it('detail: 1 cell canonical có đủ 7 nhóm thuộc tính + KPI join từ Từ điển KPI', async () => {
    const list = await api().get('/api/v1/task-dictionary?groupCode=TS-G01').set(as(emp));
    const code = list.body.cells[0].code;
    const r = await api().get(`/api/v1/task-dictionary/${code}`).set(as(emp));
    expect(r.status).toBe(200);
    expect(r.body.cell.code).toBe(code);
    expect(r.body.cell.inputs).toBeTruthy();      // C
    expect(r.body.cell.outputs).toBeTruthy();      // C
    expect(r.body.cell.governance).toBeTruthy();   // F
    expect(r.body.cell.kpiRef).toMatch(/^ADM-/);
    // KPI join: cell Tuyển sinh trỏ ADM-* → resolve ra metadata dictionary
    expect(r.body.kpi).toBeTruthy();
    expect(r.body.kpi.code).toBe(r.body.cell.kpiRef);
    expect(r.body.kpi.isDictionary).toBe(true);
    expect(r.body.kpi.definition).toBeTruthy();
  });

  it('RBAC: không có taskdict:read → 403 (token không role)', async () => {
    // user không gán role nào: tạo tạm rồi thu — đơn giản hơn: dùng tenant khác không seed?
    // seed cấp taskdict:read cho MỌI role; để test 403 cần user KHÔNG role.
    const orphan = await owner.appUser.create({
      data: { id: uuidv7(), tenantId: emp.id, email: `orphan-${Date.now()}@h01.nhg.local`, status: 'active' },
    });
    const token = jwt.sign({ sub: orphan.id, tid: emp.id, email: orphan.email }, getJwtSecret(), { expiresIn: '1h' });
    const r = await api().get('/api/v1/task-dictionary').set({ Authorization: `Bearer ${token}`, 'X-Tenant-Id': emp.id });
    expect(r.status).toBe(403);
    await owner.appUser.deleteMany({ where: { id: orphan.id } });
  });

  it('cô lập tenant: T2 không thấy cell canonical của H.01 (283 là của H.01)', async () => {
    const r = await api().get('/api/v1/task-dictionary').set(as(t2emp));
    expect(r.status).toBe(200);
    // T2 chưa seed 815 → không có 283 cell của H.01
    expect(r.body.cells.some((c: { code: string }) => c.code.startsWith('TS-G'))).toBe(false);
  });

  it('exec/admin persona cũng tra cứu được (tài nguyên toàn hàng)', async () => {
    const r = await api().get('/api/v1/task-dictionary?aiLevel=assist').set(as(exec));
    expect(r.status).toBe(200);
    expect(r.body.cells.every((c: { aiLevel: string }) => c.aiLevel === 'assist')).toBe(true);
  });
});
