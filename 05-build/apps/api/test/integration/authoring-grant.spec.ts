/**
 * Integration Phase 3 lát 4j — Ủy quyền phân cấp (authoring_grant):
 * trưởng phòng cấp quyền soạn cho nhân viên TRONG phòng → nhân viên soạn được
 * contribution (trước đó 403) → thu hồi → mất quyền ngay.
 * Least-privilege trong CODE: allowlist capability (không leo thang), chỉ trong
 * phòng mình, grantee phải cùng phòng, không tự cấp; SoD author⟂approve seeded;
 * audit authoring.grant/revoke; cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('Phase 3 lát 4j — Ủy quyền phân cấp (authoring_grant)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let dept: Ctx;      // trưởng phòng H.01 (dept_head, scope org_unit ADMISSIONS)
  let emp: Ctx;       // nhân viên H.01 (employee, scope self) — người NHẬN grant
  let author: Ctx;    // bu_author (đã có taskcell:author sẵn — không liên quan grant)
  let admin: Ctx;
  let t2dept: Ctx;
  let deptId: string;
  let rootId: string;
  const uniq = Date.now() % 100000;

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    const token = jwt.sign(
      { sub: user!.id, tid: tenant!.id, email: user!.email },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user!.id, email: user!.email };
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    dept = await ctxFor('H.01', 'dept@');
    emp = await ctxFor('H.01', 'emp1@');
    author = await ctxFor('H.01', 'author@');
    admin = await ctxFor('H.01', 'admin@');
    t2dept = await ctxFor('T2.TEST', 'dept@');
    const d = await owner.orgUnit.findFirst({ where: { tenantId: dept.id, code: 'ADMISSIONS' } });
    const r = await owner.orgUnit.findFirst({ where: { tenantId: dept.id, code: 'ROOT' } });
    deptId = d!.id;
    rootId = r!.id;

    // dọn artefact của CHÍNH spec này (chuẩn F66): grant + user_role staff_author của emp1
    const grants = await owner.authoringGrant.findMany({
      where: { tenantId: dept.id, granteeId: emp.userId },
    });
    for (const g of grants) {
      if (g.userRoleId) await owner.userRole.deleteMany({ where: { id: g.userRoleId } });
    }
    await owner.authoringGrant.deleteMany({ where: { tenantId: dept.id, granteeId: emp.userId } });
    const staffRole = await owner.role.findFirst({ where: { code: 'staff_author', tenantId: null } });
    await owner.userRole.deleteMany({
      where: { tenantId: dept.id, appUserId: emp.userId, roleId: staffRole!.id },
    });

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
  const cellPayload = () => ({
    code: `AG4J-T${uniq}`, nameVi: `Tác vụ test grant ${uniq}`,
    responsibleRole: 'staff', accountableRole: 'dept_head',
    inputs: ['x'], outputs: ['y'], measures: [{ name: 'SLA' }], aiLevel: 'assist',
    kpiRef: 'ADM-LEAD-001',
  });

  let grantId: string;

  it('RBAC: emp/author không có taskcell:delegate → 403; dept_head list được', async () => {
    expect((await api().get('/api/v1/authoring/grants').set(as(emp))).status).toBe(403);
    expect((await api().get('/api/v1/authoring/grants').set(as(author))).status).toBe(403);
    expect((await api().get('/api/v1/authoring/grants').set(as(dept))).status).toBe(200);
  });

  it('TRƯỚC grant: emp không soạn được contribution (thiếu taskcell:author/library:submit)', async () => {
    const r = await api().post('/api/v1/library/contributions').set(as(emp)).send({
      type: 'task_cell', orgUnitId: deptId, payload: cellPayload(),
    });
    expect(r.status).toBe(403);
  });

  it('không leo thang: cấp capability ngoài allowlist → 4xx (kể cả library:publish, taskcell:approve)', async () => {
    for (const capability of ['library:publish', 'taskcell:approve', 'taskcell:delegate']) {
      const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
        granteeId: emp.userId, orgUnitId: deptId, capability,
      });
      expect([400, 422]).toContain(r.status); // DTO @IsIn chặn 400; service allowlist 422
    }
  });

  it('không cấp ngoài phòng: dept_head (scope ADMISSIONS) grant vào ROOT → 403', async () => {
    const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
      granteeId: emp.userId, orgUnitId: rootId,
    });
    expect(r.status).toBe(403);
  });

  it('không cấp cho người NGOÀI phòng: grantee person thuộc org_unit khác → 422', async () => {
    // curator@ có person ở ROOT (seedStudioUser) — không thuộc ADMISSIONS
    const curator = await owner.appUser.findFirst({
      where: { tenantId: dept.id, email: { startsWith: 'curator@' } },
    });
    const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
      granteeId: curator!.id, orgUnitId: deptId,
    });
    expect(r.status).toBe(422);
  });

  it('không tự cấp cho chính mình → 409 CHÍNH XÁC (self-check chạy TRƯỚC mọi check khác) + audit denied', async () => {
    // [F120] deterministic 409 — self-check đứng trước check person-org
    const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
      granteeId: dept.userId, orgUnitId: deptId,
    });
    expect(r.status).toBe(409);
    // [F117] vi phạm bị chặn vẫn để lại vết audit (ghi ngoài tx)
    const denied = await owner.auditLog.findFirst({
      where: { tenantId: dept.id, action: 'authoring.grant_denied', actorUserId: dept.userId },
      orderBy: { at: 'desc' },
    });
    expect(denied).toBeTruthy();
  });

  it('[F115] list scope: dept_head truyền orgUnitId phòng KHÁC tường minh → 403 (không soi phòng khác)', async () => {
    const r = await api().get(`/api/v1/authoring/grants?orgUnitId=${rootId}`).set(as(dept));
    expect(r.status).toBe(403);
    // uuid rác tại cửa → 400, không 500 (F118/F74)
    expect((await api().get('/api/v1/authoring/grants?orgUnitId=abc').set(as(dept))).status).toBe(400);
  });

  it('[F116] SoD tại nguồn: không cấp taskcell:author cho người đang giữ taskcell:approve → 409', async () => {
    // admin (tenant scope) cấp cho dept@ (person ở ROOT, đang giữ taskcell:approve qua role dept_head)
    const r = await api().post('/api/v1/authoring/grants').set(as(admin)).send({
      granteeId: dept.userId, orgUnitId: rootId,
    });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain('taskcell:approve');
  });

  it('GRANT hợp lệ: dept_head cấp cho emp1 (cùng phòng ADMISSIONS) → 201 + audit + user_role materialize', async () => {
    const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
      granteeId: emp.userId, orgUnitId: deptId,
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('active');
    expect(r.body.capability).toBe('taskcell:author');
    expect(r.body.userRoleId).toBeTruthy();
    grantId = r.body.id;

    const ur = await owner.userRole.findFirst({ where: { id: r.body.userRoleId } });
    expect(ur!.scopeType).toBe('org_unit');
    expect(ur!.scopeId).toBe(deptId);

    const audit = await owner.auditLog.findFirst({
      where: { tenantId: dept.id, action: 'authoring.grant', entityId: grantId },
    });
    expect(audit).toBeTruthy();
  });

  it('SAU grant: emp soạn + submit được contribution trong phòng (scope org_unit hoạt động)', async () => {
    // sai phòng vẫn bị chặn (scope org_unit fail-closed)
    expect((await api().post('/api/v1/library/contributions').set(as(emp)).send({
      type: 'task_cell', orgUnitId: rootId, payload: cellPayload(),
    })).status).toBe(403);

    const r = await api().post('/api/v1/library/contributions').set(as(emp)).send({
      type: 'task_cell', orgUnitId: deptId, payload: cellPayload(),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('draft');
    const sub = await api().post(`/api/v1/library/contributions/${r.body.id}/submit`).set(as(emp));
    expect(sub.status).toBe(201);
  });

  it('double-grant khi đang active → 409', async () => {
    const r = await api().post('/api/v1/authoring/grants').set(as(dept)).send({
      granteeId: emp.userId, orgUnitId: deptId,
    });
    expect(r.status).toBe(409);
  });

  it('cô lập tenant: dept_head T2 không thấy/không revoke được grant H.01', async () => {
    const list = await api().get('/api/v1/authoring/grants').set(as(t2dept));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: string }>).some((g) => g.id === grantId)).toBe(false);
    expect((await api().delete(`/api/v1/authoring/grants/${grantId}`).set(as(t2dept))).status).toBe(404);
  });

  it('REVOKE: thu hồi → grant revoked + user_role soft-delete + emp mất quyền NGAY + audit', async () => {
    const r = await api().delete(`/api/v1/authoring/grants/${grantId}`).set(as(dept));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('revoked');
    expect(r.body.revokedBy).toBe(dept.userId);

    const grant = await owner.authoringGrant.findFirst({ where: { id: grantId } });
    const ur = await owner.userRole.findFirst({ where: { id: grant!.userRoleId! } });
    expect(ur!.deletedAt).toBeTruthy();

    // hiệu lực ngay — PermissionGuard lọc role soft-deleted (F4)
    expect((await api().post('/api/v1/library/contributions').set(as(emp)).send({
      type: 'task_cell', orgUnitId: deptId, payload: cellPayload(),
    })).status).toBe(403);

    // revoke lần 2 → 409
    expect((await api().delete(`/api/v1/authoring/grants/${grantId}`).set(as(dept))).status).toBe(409);

    const audit = await owner.auditLog.findFirst({
      where: { tenantId: dept.id, action: 'authoring.revoke', entityId: grantId },
    });
    expect(audit).toBeTruthy();
  });

  it('SoD seeded: sod_rule taskcell:author ⟂ taskcell:approve tồn tại mỗi tenant (nền lát 4k)', async () => {
    for (const tid of [dept.id, t2dept.id]) {
      const rule = await owner.sodRule.findFirst({
        where: { tenantId: tid, permissionA: 'taskcell:author', permissionB: 'taskcell:approve', deletedAt: null },
      });
      expect(rule).toBeTruthy();
    }
  });
});
