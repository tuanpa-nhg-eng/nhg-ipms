/**
 * Integration Phase 3 lát 4c — Policy-as-Code (#2 Cedar):
 * CRUD + validate tại cửa · test harness · vòng đời draft→active→disabled với
 * quality gate (tests PASS) + SoD write⟂publish · PolicyGuard enforce runtime
 * (deny + audit explainable, fail-closed khi policy lỗi eval) · policy global
 * (owner/B3) có hiệu lực nhưng tenant không quản trị được · cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { ensureSodMixUser } from '../helpers/sod-mix-user';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('Phase 3 lát 4c — access_policy Cedar + PolicyGuard', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;
  let sodMix: Ctx;   // [Trục B L0] bị cấp NHẦM cả config:write + config:publish
  let designer: Ctx;
  let approver: Ctx;
  let emp: Ctx;
  let t2emp: Ctx;
  const uniq = Date.now();
  const pname = (s: string) => `spec4c-${s}-${uniq}`;

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
      return { id: tenant!.id, token, userId: user!.id, email: user!.email };
    }
    admin = await ctxFor('H.01', 'admin@');
    designer = await ctxFor('H.01', 'designer@');
    approver = await ctxFor('H.01', 'approver@');
    emp = await ctxFor('H.01', 'emp1@');
    t2emp = await ctxFor('T2.TEST', 'emp1@');
    sodMix = (await ensureSodMixUser(owner, admin.id)) as unknown as Ctx;

    // [F66-chuẩn] dọn policy sót của CHÍNH spec này từ lần chạy trước (kể cả active)
    await owner.accessPolicy.deleteMany({ where: { name: { startsWith: 'spec4c-' } } });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    // an toàn dev DB: không để policy active của spec sót lại chặn spec khác
    await owner?.accessPolicy.deleteMany({ where: { name: { startsWith: 'spec4c-' } } });
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  const FORBID_EMP_KPI = (email: string) =>
    `forbid(principal, action, resource) when { context.permission == "kpi:read" && principal.email == "${email}" };`;

  let policyId: string;
  let policyVersion: number;

  it('CRUD + validate tại cửa: cú pháp hỏng/2-policy/template → 422; emp/approver không tạo được', async () => {
    expect((await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('bad'), policyText: 'forbid(principal, action, resource) when { hỏng',
    })).status).toBe(422);

    expect((await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('two'),
      policyText: 'permit(principal, action, resource); forbid(principal, action, resource);',
    })).status).toBe(422);

    expect((await api().post('/api/v1/policies').set(as(emp)).send({
      name: pname('emp'), policyText: 'permit(principal, action, resource);',
    })).status).toBe(403);
    expect((await api().post('/api/v1/policies').set(as(approver)).send({
      name: pname('appr'), policyText: 'permit(principal, action, resource);',
    })).status).toBe(403);

    const r = await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('forbid-emp-kpi'),
      policyText: FORBID_EMP_KPI(emp.email),
      scope: 'kpi',
      note: 'guardrail test lát 4c',
      tests: [
        { name: 'emp bị chặn', action: 'kpi:read', expect: 'deny',
          principal: { attrs: { email: emp.email } } },
        { name: 'người khác không bị', action: 'kpi:read', expect: 'allow',
          principal: { attrs: { email: admin.email } } },
        { name: 'action khác không bị', action: 'kpi:write', expect: 'allow',
          principal: { attrs: { email: emp.email } } },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('draft');
    expect(r.body.tenantId).toBe(admin.id); // không tạo được policy global qua API
    policyId = r.body.id;
    policyVersion = r.body.version;
  });

  it('test harness: bộ test PASS; case ad-hoc kỳ vọng sai → passed=false', async () => {
    const ok = await api().post(`/api/v1/policies/${policyId}/test`).set(as(designer)).send({});
    expect(ok.status).toBe(201);
    expect(ok.body.passed).toBe(true);
    expect(ok.body.results).toHaveLength(3);

    const bad = await api().post(`/api/v1/policies/${policyId}/test`).set(as(designer)).send({
      cases: [{ name: 'sai kỳ vọng', action: 'kpi:read', expect: 'allow',
        principal: { attrs: { email: emp.email } } }],
    });
    expect(bad.body.passed).toBe(false);
  });

  it('draft KHÔNG có hiệu lực: emp vẫn đọc /kpis bình thường', async () => {
    expect((await api().get('/api/v1/kpis').set(as(emp))).status).toBe(200);
  });

  it('activate: quality gate + SoD write⟂publish + conditional version', async () => {
    // thiếu test case → không activate được
    const noTests = await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('no-tests'), policyText: 'permit(principal, action, resource);',
    });
    expect((await api().post(`/api/v1/policies/${noTests.body.id}/activate`).set(as(approver))
      .send({ expectedVersion: noTests.body.version })).status).toBe(422);

    // test FAIL → không activate được
    const failing = await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('failing'), policyText: FORBID_EMP_KPI(emp.email),
      tests: [{ name: 'kỳ vọng sai', action: 'kpi:read', expect: 'allow',
        principal: { attrs: { email: emp.email } } }],
    });
    expect((await api().post(`/api/v1/policies/${failing.body.id}/activate`).set(as(approver))
      .send({ expectedVersion: failing.body.version })).status).toBe(422);

    // designer không có config:publish → 403
    expect((await api().post(`/api/v1/policies/${policyId}/activate`).set(as(designer))
      .send({ expectedVersion: policyVersion })).status).toBe(403);

    // [Trục B L0] người bị cấp NHẦM cả write + publish → SoD chặn 409 + audit incident
    // (trước đây ca này mượn tenant_admin — god-account đã bị hạ ở L0)
    expect((await api().post(`/api/v1/policies/${policyId}/activate`).set(as(sodMix))
      .send({ expectedVersion: policyVersion })).status).toBe(409);
    const incident = await owner.auditLog.findFirst({
      where: {
        tenantId: admin.id, action: 'sod.violation_blocked',
        entityType: 'access_policy', entityId: policyId,
      },
    });
    expect(incident).not.toBeNull();

    // version lệch → 409
    expect((await api().post(`/api/v1/policies/${policyId}/activate`).set(as(approver))
      .send({ expectedVersion: policyVersion + 99 })).status).toBe(409);

    // approver đúng version → active
    const ok = await api().post(`/api/v1/policies/${policyId}/activate`).set(as(approver))
      .send({ expectedVersion: policyVersion });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('active');
    policyVersion = ok.body.version;
  });

  it('PolicyGuard enforce: emp bị 403 kèm audit policy.denied explainable; người khác + T2 không bị', async () => {
    const denied = await api().get('/api/v1/kpis').set(as(emp));
    expect(denied.status).toBe(403);

    expect((await api().get('/api/v1/kpis').set(as(admin))).status).toBe(200);
    expect((await api().get('/api/v1/kpis').set(as(t2emp))).status).toBe(200); // cô lập tenant

    const audit = await owner.auditLog.findFirst({
      where: { tenantId: admin.id, action: 'policy.denied', actorUserId: emp.userId },
      orderBy: { id: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit!.after as any).denied_by).toContain(policyId);
    expect((audit!.after as any).permission).toBe('kpi:read');
  });

  it('policy active không sửa được; disable (SoD) → hết hiệu lực + sửa lại được', async () => {
    expect((await api().patch(`/api/v1/policies/${policyId}`).set(as(designer))
      .send({ note: 'sửa khi đang active' })).status).toBe(409);

    // người giữ cả 2 quyền disable → SoD 409; approver disable → OK
    expect((await api().post(`/api/v1/policies/${policyId}/disable`).set(as(sodMix))
      .send({ expectedVersion: policyVersion })).status).toBe(409);
    const dis = await api().post(`/api/v1/policies/${policyId}/disable`).set(as(approver))
      .send({ expectedVersion: policyVersion });
    expect(dis.status).toBe(201);
    expect(dis.body.status).toBe('disabled');

    expect((await api().get('/api/v1/kpis').set(as(emp))).status).toBe(200);
  });

  it('FAIL-CLOSED: policy active lỗi eval (attr không tồn tại) → deny mọi request trong scope', async () => {
    // đường B3/owner ghi thẳng DB — lách qua quality gate activation (giả lập policy hỏng)
    const brokenId = uuidv7();
    await owner.accessPolicy.create({
      data: {
        id: brokenId, tenantId: admin.id, name: pname('broken'),
        engine: 'cedar', scope: 'strategy',
        policyText: 'forbid(principal, action, resource) when { principal.notThere == "x" };',
        status: 'active', tests: [], updatedAt: new Date(),
      },
    });
    try {
      const r = await api().get('/api/v1/objectives').set(as(admin));
      expect(r.status).toBe(403); // fail-closed — kể cả admin
      expect((await api().get('/api/v1/kpis').set(as(admin))).status).toBe(200); // ngoài scope không bị
    } finally {
      await owner.accessPolicy.delete({ where: { id: brokenId } });
    }
    expect((await api().get('/api/v1/objectives').set(as(admin))).status).toBe(200);
  });

  it('policy GLOBAL (B3): có hiệu lực với tenant, thấy được qua GET, nhưng tenant không quản trị được', async () => {
    const globalId = uuidv7();
    await owner.accessPolicy.create({
      data: {
        id: globalId, tenantId: null, name: pname('global'),
        engine: 'cedar', scope: 'process',
        policyText: `forbid(principal, action, resource) when { context.permission == "process:design" && principal.email == "${designer.email}" };`,
        status: 'active', tests: [], updatedAt: new Date(),
      },
    });
    try {
      // hiệu lực: designer bị chặn process:design
      expect((await api().post('/api/v1/processes').set(as(designer))
        .send({ code: `SPEC4C${uniq}`, nameVi: 'x' })).status).toBe(403);

      // thấy được trong danh sách (RLS SELECT tenant_or_global)
      const list = await api().get('/api/v1/policies').set(as(designer));
      expect(list.body.some((p: any) => p.id === globalId)).toBe(true);

      // nhưng tenant không activate/disable được policy global
      expect((await api().post(`/api/v1/policies/${globalId}/disable`).set(as(approver))
        .send({ expectedVersion: 1 })).status).toBe(409);
    } finally {
      await owner.accessPolicy.delete({ where: { id: globalId } });
    }
  });

  it('[F68] van an toàn: policy tự khoá config:publish vẫn disable được (list/get/disable miễn trừ ABAC)', async () => {
    const lock = await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('lockout'), scope: 'config',
      policyText: 'forbid(principal, action, resource) when { context.permission == "config:publish" };',
      tests: [
        { name: 'chặn publish', action: 'config:publish', expect: 'deny' },
        { name: 'không đụng read', action: 'config:read', expect: 'allow' },
      ],
    });
    const act = await api().post(`/api/v1/policies/${lock.body.id}/activate`).set(as(approver))
      .send({ expectedVersion: lock.body.version });
    expect(act.status).toBe(201);

    // hiệu lực thật: approver bị chặn ở endpoint activate KHÁC (không miễn trừ)
    const victim = await api().post('/api/v1/policies').set(as(designer)).send({
      name: pname('victim'), policyText: 'permit(principal, action, resource);',
    });
    expect((await api().post(`/api/v1/policies/${victim.body.id}/activate`).set(as(approver))
      .send({ expectedVersion: victim.body.version })).status).toBe(403);

    // nhưng list/get/disable là van an toàn — không bị tự khoá
    expect((await api().get('/api/v1/policies').set(as(approver))).status).toBe(200);
    const dis = await api().post(`/api/v1/policies/${lock.body.id}/disable`).set(as(approver))
      .send({ expectedVersion: act.body.version });
    expect(dis.status).toBe(201);
  });

  it('[F69] PATCH policy global (draft) → 409 rõ nghĩa, không 404 nhiễu', async () => {
    const gid = uuidv7();
    await owner.accessPolicy.create({
      data: {
        id: gid, tenantId: null, name: pname('global-draft'),
        engine: 'cedar', policyText: 'permit(principal, action, resource);',
        status: 'draft', tests: [], updatedAt: new Date(),
      },
    });
    try {
      expect((await api().patch(`/api/v1/policies/${gid}`).set(as(designer))
        .send({ note: 'thử sửa global' })).status).toBe(409);
    } finally {
      await owner.accessPolicy.delete({ where: { id: gid } });
    }
  });

  it('CÔ LẬP GHI: T2 không thấy/không đụng được policy H.01', async () => {
    const t2list = await api().get('/api/v1/policies').set(as(t2emp));
    expect(t2list.status).toBe(403); // emp T2 không có config:read

    // qua DB app-role: RLS chặn cross-tenant đã chứng minh ở tenant-isolation.spec;
    // ở đây chứng minh qua API bằng ctx admin T2
    const t2tenant = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });
    const t2admin = await owner.appUser.findFirst({
      where: { tenantId: t2tenant!.id, email: { startsWith: 'admin@' } },
    });
    const t2token = jwt.sign(
      { sub: t2admin!.id, tid: t2tenant!.id, email: t2admin!.email },
      getJwtSecret(), { expiresIn: '1h' },
    );
    const t2 = { Authorization: `Bearer ${t2token}`, 'X-Tenant-Id': t2tenant!.id };
    const r = await api().get('/api/v1/policies').set(t2);
    expect(r.status).toBe(200);
    expect(r.body.some((p: any) => p.tenantId === admin.id)).toBe(false);
  });
});
