/**
 * Integration Phase 3 — Configuration Studio E2E:
 * Config-as-Data (draft→diff→publish SoD→rollback) · Brand Kit + theming resolver ·
 * Org Function · Auto-Derivation Engine (rule→preview explainable→apply→manual_override)
 * + cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; personId: string; userId: string }

describe('Phase 3 — Configuration Studio E2E', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;      // tenant_admin (giữ cả write + publish — dùng test SoD block)
  let designer: Ctx;   // config_designer (write, KHÔNG publish)
  let approver: Ctx;   // config_approver (publish, KHÔNG write)
  let t2admin: Ctx;
  const uniq = Date.now();

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
      });
      if (!user) throw new Error(`User ${emailPrefix} @ ${tenantCode} chưa seed — chạy pnpm db:seed`);
      const token = jwt.sign(
        { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token, personId: user.personId!, userId: user.id };
    }
    admin = await ctxFor('H.01', 'admin@');
    designer = await ctxFor('H.01', 'designer@');
    approver = await ctxFor('H.01', 'approver@');
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
  let fnAdmissionsId: string;
  let runId: string;

  it('① tạo config version draft (designer) — employee/approver không tạo được', async () => {
    const denied = await api().post('/api/v1/config-versions').set(as(approver))
      .send({ label: `x-${uniq}` });
    expect(denied.status).toBe(403); // approver không có config:write

    const res = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `Cấu hình ${uniq}`, note: 'phiên bản test' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    draftId = res.body.id;
  });

  it('② Brand Kit: designer PUT → config_change ghi lại; resolver chưa có published → default', async () => {
    const res = await api().put('/api/v1/brand-kit').set(as(designer)).send({
      configVersionId: draftId,
      displayName: `Trường Hội nhập ${uniq}`,
      tokens: { color: { primary: '#0055AA' } },
      a11yChecked: true,
    });
    expect(res.status).toBe(200);

    const resolve = await api().get('/api/v1/brand-kit/resolve?tenant=H.01');
    expect(resolve.status).toBe(200);
    // draft CHƯA publish thì resolver không được trả nó (có thể còn bản published từ run trước)
    expect(resolve.body.source).not.toContain(String(uniq));
  });

  it('③ Org Function: tạo catalog + gán cho phòng ban ADMISSIONS', async () => {
    const fn = await api().post('/api/v1/org-functions').set(as(designer))
      .send({ code: `admissions-${uniq}`, nameVi: 'Tuyển sinh' });
    expect(fn.status).toBe(201);
    fnAdmissionsId = fn.body.id;

    const dept = await owner.orgUnit.findFirst({
      where: { tenantId: admin.id, code: 'ADMISSIONS' },
    });
    const set = await api().put(`/api/v1/org-units/${dept!.id}/functions`).set(as(designer))
      .send({ functions: [{ functionId: fnAdmissionsId, weight: 100 }] });
    expect(set.status).toBe(200);
    expect(set.body).toHaveLength(1);
  });

  it('④ Derivation: template + rule → RUN preview có reason explainable', async () => {
    // 2 KPI template (60/40)
    for (const [code, name, w] of [[`DRV-LEAD-${uniq}`, 'Số lead tuyển sinh', 60], [`DRV-CONV-${uniq}`, 'Tỷ lệ chuyển đổi', 40]] as const) {
      const t = await api().post('/api/v1/kpi-templates').set(as(designer)).send({
        code, nameVi: name, frequency: 'monthly',
        formulaExpr: 'min(actual/target,1)*100',
        defaultTier: [{ minPct: 100, score: 100 }, { minPct: 80, score: 80 }, { minPct: 60, score: 60 }],
        taskCellRefs: [`TS-G01-C01-T00${w === 60 ? 1 : 2}`],
      });
      expect(t.status).toBe(201);
    }

    const rule = await api().post('/api/v1/derivation-rules').set(as(designer)).send({
      configVersionId: draftId,
      priority: 100,
      match: { function_codes: [`admissions-${uniq}`] },
      emit: {},
      note: 'rule cha (không emit)',
    });
    expect(rule.status).toBe(201);

    // rule chính: function admissions → kéo theo 2 KPI
    await api().post('/api/v1/derivation-rules').set(as(designer)).send({
      configVersionId: draftId, priority: 200,
      match: { function_codes: [`admissions-${uniq}`] },
      emit: { kpi_template_codes: [`DRV-LEAD-${uniq}`], weight: 60 },
    });
    await api().post('/api/v1/derivation-rules').set(as(designer)).send({
      configVersionId: draftId, priority: 190,
      match: { function_codes: [`admissions-${uniq}`] },
      emit: { kpi_template_codes: [`DRV-CONV-${uniq}`], weight: 40 },
    });

    // cần position gắn role_family trong ADMISSIONS — seed thêm nếu chưa có
    const dept = await owner.orgUnit.findFirst({ where: { tenantId: admin.id, code: 'ADMISSIONS' } });
    let rf = await owner.roleFamily.findFirst({ where: { tenantId: admin.id, code: 'TS-STAFF' } });
    if (!rf) {
      rf = await owner.roleFamily.create({
        data: { id: uuidv7(), tenantId: admin.id, code: 'TS-STAFF', nameVi: 'Chuyên viên tuyển sinh' },
      });
    }
    const pos = await owner.position.findFirst({
      where: { tenantId: admin.id, orgUnitId: dept!.id, roleFamilyId: rf.id },
    });
    if (!pos) {
      await owner.position.create({
        data: {
          id: uuidv7(), tenantId: admin.id, orgUnitId: dept!.id, roleFamilyId: rf.id,
          titleVi: 'Chuyên viên tuyển sinh',
        },
      });
    }

    const run = await api().post('/api/v1/derivation/run').set(as(designer))
      .send({ configVersionId: draftId, trigger: 'manual' });
    expect(run.status).toBe(201);
    runId = run.body.run.id;
    expect(run.body.summary.error).toBe(0);
    expect(run.body.summary.add).toBeGreaterThanOrEqual(1);

    const scAdd = run.body.results.find((r: any) => r.targetType === 'scorecard' && r.action === 'add');
    expect(scAdd).toBeDefined();
    expect(scAdd.payload.weight_sum).toBe(100);
    expect(scAdd.reason).toContain('kéo theo'); // explainable
    const lineage = run.body.results.filter((r: any) => r.targetType === 'cascade_link');
    expect(lineage.length).toBeGreaterThanOrEqual(2);
  });

  it('④ apply → scorecard + item + kpi (draft) + cascade_link ghi vào draft version', async () => {
    const res = await api().post(`/api/v1/derivation/runs/${runId}/apply`).set(as(designer));
    expect(res.status).toBe(201);
    expect(res.body.applied).toBeGreaterThanOrEqual(1);

    const kpi = await owner.kpi.findFirst({
      where: { tenantId: admin.id, code: `DRV-LEAD-${uniq}` },
    });
    expect(kpi).toBeDefined();
    expect(kpi!.status).toBe('draft'); // KPI sinh ra vẫn cần approve HITL

    const links = await owner.cascadeLink.findMany({
      where: { tenantId: admin.id, configVersionId: draftId },
    });
    expect(links.length).toBeGreaterThanOrEqual(2);

    // apply lại → 409 (đã applied)
    const again = await api().post(`/api/v1/derivation/runs/${runId}/apply`).set(as(designer));
    expect(again.status).toBe(409);
  });

  it('④ manual_override được engine tôn trọng (keep, không đè)', async () => {
    // đánh dấu 1 item manual_override
    const item = await owner.scorecardItem.findFirst({
      where: { tenantId: admin.id, configVersionId: draftId },
    });
    await owner.scorecardItem.update({
      where: { id: item!.id },
      data: { manualOverride: true, weight: 70 },
    });

    const rerun = await api().post('/api/v1/derivation/run').set(as(designer))
      .send({ configVersionId: draftId, trigger: 'org_change' });
    expect(rerun.status).toBe(201);
    const kept = rerun.body.results.find(
      (r: any) => r.targetType === 'scorecard' && r.action === 'keep',
    );
    expect(kept).toBeDefined();
    expect(kept.reason).toContain('manual_override');
  });

  it('⑦ SoD: tenant_admin (giữ CẢ write + publish) bị block khi bật sod_rule; approver publish OK', async () => {
    // bật SoD rule cho H.01 (upsert — idempotent khi rerun)
    await owner.sodRule.upsert({
      where: {
        tenantId_permissionA_permissionB: {
          tenantId: admin.id, permissionA: 'config:write', permissionB: 'config:publish',
        },
      },
      update: { deletedAt: null },
      create: {
        id: uuidv7(), tenantId: admin.id,
        permissionA: 'config:write', permissionB: 'config:publish',
      },
    });

    // designer không có config:publish → 403 ở guard
    const cv0 = await owner.configVersion.findFirst({ where: { id: draftId } });
    const noPerm = await api().post(`/api/v1/config-versions/${draftId}/publish`).set(as(designer))
      .send({ version: cv0!.version });
    expect(noPerm.status).toBe(403);

    // tenant_admin có cả 2 → SoD runtime block 409 + audit incident
    const sodBlock = await api().post(`/api/v1/config-versions/${draftId}/publish`).set(as(admin))
      .send({ version: cv0!.version });
    expect(sodBlock.status).toBe(409);
    const incidents = await owner.auditLog.findMany({
      where: { tenantId: admin.id, action: 'sod.violation_blocked', entityId: draftId },
    });
    expect(incidents.length).toBe(1);

    // approver (chỉ publish) → OK
    const ok = await api().post(`/api/v1/config-versions/${draftId}/publish`).set(as(approver))
      .send({ version: cv0!.version });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('published');

    const audits = await owner.auditLog.findMany({
      where: { tenantId: admin.id, action: 'config.publish', entityId: draftId },
    });
    expect(audits.length).toBe(1);
  });

  it('⑦ sau publish: theming resolver trả brand tokens; version published khoá sửa', async () => {
    const resolve = await api().get('/api/v1/brand-kit/resolve?tenant=H.01');
    expect(resolve.body.tokens.color.primary).toBe('#0055AA');
    expect(resolve.body.source).toContain(`${uniq}`);

    // sửa brand trên version đã published → 409
    const locked = await api().put('/api/v1/brand-kit').set(as(designer)).send({
      configVersionId: draftId, tokens: { color: { primary: '#FF0000' } },
    });
    expect(locked.status).toBe(409);
  });

  it('⑦ diff liệt kê config_change + rollback clone → draft mới', async () => {
    const diff = await api().get(`/api/v1/config-versions/${draftId}/diff`).set(as(designer));
    expect(diff.status).toBe(200);
    expect(diff.body.summary.brand).toBeDefined();
    expect(diff.body.summary.derivation_rule.create).toBe(3);

    const rb = await api().post(`/api/v1/config-versions/${draftId}/rollback`).set(as(designer))
      .send({ label: `Rollback ${uniq}` });
    expect(rb.status).toBe(201);
    expect(rb.body.status).toBe('draft');
    expect(rb.body.basedOnId).toBe(draftId);

    // rules đã được copy sang draft mới
    const rules = await api().get(`/api/v1/derivation-rules?configVersionId=${rb.body.id}`).set(as(designer));
    expect(rules.body).toHaveLength(3);
  });

  it('CÔ LẬP: T2 không thấy config version/brand/rules của H.01', async () => {
    const list = await api().get('/api/v1/config-versions').set(as(t2admin));
    expect(list.body.map((v: any) => v.id)).not.toContain(draftId);
    const diff = await api().get(`/api/v1/config-versions/${draftId}/diff`).set(as(t2admin));
    expect(diff.status).toBe(404);
    const resolve = await api().get('/api/v1/brand-kit/resolve?tenant=T2.TEST');
    expect(resolve.body.source).toBe('default'); // T2 không kế thừa brand H.01
  });
});
