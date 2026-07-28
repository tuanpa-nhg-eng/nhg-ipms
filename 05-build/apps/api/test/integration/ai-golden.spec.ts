/**
 * Integration — [Learning Loop L1] Golden Set có SoD:
 * harvest tín hiệu → candidate (idempotent) → curator duyệt → ai_eval_case
 * (suite 'golden-learned') · SoD người-duyệt≠người-tạo-tín-hiệu (chặn CẢ ADMIN,
 * incident audit) · permission ai:eval:curate · seed golden-fin-baseline idempotent.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { ensureMultiRoleUser } from '../helpers/sod-mix-user';
import { seedGoldenFin, BASELINE_SUITE_NAME } from '../../src/scripts/seed-golden-fin';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string }

describe('Learning Loop L1 — Golden Set có SoD', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let curator: Ctx;
  let admin: Ctx;
  // [Trục B L0] ai:assist + ai:eval:curate không còn cùng nằm ở tenant_admin —
  // dựng đúng người bị cấp nhầm cả hai để giữ nguyên ý nghĩa ca SoD trên THƯỚC ĐO.
  let assistCurator: Ctx;
  let designer: Ctx;
  let emp: Ctx;
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
    author = await ctxFor('H.01', 'author@');
    curator = await ctxFor('H.01', 'curator@');
    admin = await ctxFor('H.01', 'admin@');
    assistCurator = (await ensureMultiRoleUser(
      owner, admin.id, ['bu_author', 'library_curator'], 'assistcur',
    )) as unknown as Ctx;
    designer = await ctxFor('H.01', 'designer@');
    emp = await ctxFor('H.01', 'emp1@');

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

  const partialCell = { nameVi: `Golden loop ${uniq}`, code: 'TS-G01-C01-T001' };

  let authorSignalSuggestionId: string;
  let editedKpi: string;

  // ===== Harvest =====
  it('tín hiệu accepted_with_edits → harvest tạo candidate: expected = BẢN NGƯỜI DÙNG SỬA, có replay input', async () => {
    // author tạo + sửa-rồi-chấp-nhận một gợi ý kpi_link
    const res = await api().post('/api/v1/ai/inline/taskcell.kpi_link').set(as(author))
      .send({ input: { payload: partialCell } });
    expect(res.status).toBe(201);
    authorSignalSuggestionId = res.body.suggestion.id;
    const aiKpi = res.body.proposal.kpiRef as string;
    const other = await owner.kpiTemplate.findFirst({
      where: { tenantId: author.id, isDictionary: true, deletedAt: null, code: { not: aiKpi } },
    });
    editedKpi = other!.code;
    await api().post(`/api/v1/ai/inline/suggestions/${authorSignalSuggestionId}/apply`)
      .set(as(author)).send({ edited: true, finalPayload: { kpiRef: editedKpi } });

    // permission: emp/author/designer KHÔNG có ai:eval:curate
    expect((await api().post('/api/v1/ai/golden/harvest').set(as(emp)).send({})).status).toBe(403);
    expect((await api().post('/api/v1/ai/golden/harvest').set(as(author)).send({})).status).toBe(403);
    expect((await api().post('/api/v1/ai/golden/harvest').set(as(designer)).send({})).status).toBe(403);

    const h = await api().post('/api/v1/ai/golden/harvest').set(as(curator)).send({});
    expect(h.status).toBe(201);
    expect(h.body.created).toBeGreaterThanOrEqual(1);

    const cand = await owner.aiGoldenCandidate.findFirst({
      where: { tenantId: author.id, suggestionId: authorSignalSuggestionId },
    });
    expect(cand).not.toBeNull();
    expect(cand!.status).toBe('proposed');
    expect(cand!.agent).toBe('inline.taskcell.kpi_link');
    expect(cand!.sourceActorUserId).toBe(author.userId);
    expect((cand!.expected as any).kpiRef).toBe(editedKpi); // chuẩn vàng = cái người dùng DÙNG
    const input = cand!.input as any;
    expect(input.task).toBe('taskcell.kpi_link');
    expect(typeof input.prompt).toBe('string');
    expect(Array.isArray(input.context?.candidates)).toBe(true); // replay tự chứa
  });

  it('harvest idempotent: chạy lại KHÔNG nhân đôi candidate (unique signal)', async () => {
    await api().post('/api/v1/ai/golden/harvest').set(as(curator)).send({});
    expect(await owner.aiGoldenCandidate.count({
      where: { tenantId: author.id, suggestionId: authorSignalSuggestionId },
    })).toBe(1);
  });

  // ===== Approve + SoD =====
  it('curator duyệt candidate nguồn author → ai_eval_case trong suite golden-learned + assertions equals', async () => {
    const cand = await owner.aiGoldenCandidate.findFirst({
      where: { tenantId: author.id, suggestionId: authorSignalSuggestionId },
    });
    const res = await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/approve`)
      .set(as(curator)).send({ note: 'đúng nghiệp vụ FIN' });
    expect(res.status).toBe(201);
    expect(res.body.candidate.status).toBe('approved');
    expect(res.body.caseId).toBeTruthy();

    const evalCase = await owner.aiEvalCase.findFirst({ where: { id: res.body.caseId } });
    expect(evalCase).not.toBeNull();
    expect(evalCase!.assertions).toEqual([{ type: 'equals', path: 'kpiRef', value: editedKpi }]);
    const suite = await owner.aiEvalSuite.findFirst({ where: { id: evalCase!.suiteId } });
    expect(suite!.name).toBe('golden-learned');
    expect(suite!.agent).toBe('inline.taskcell.kpi_link');

    // double-approve → 409
    expect((await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/approve`)
      .set(as(curator)).send({})).status).toBe(409);
  });

  it('SoD trên thước đo: người tạo tín hiệu KHÔNG tự duyệt candidate của mình (kể cả khi giữ quyền curate) + incident audit', async () => {
    // người giữ CẢ ai:assist lẫn ai:eval:curate tự tạo tín hiệu rồi tự duyệt → phải 409
    const s = await api().post('/api/v1/ai/inline/taskcell.draft').set(as(assistCurator))
      .send({ input: { payload: { nameVi: `SoD golden ${uniq}`, code: 'TS-G01-C01-T002' } } });
    expect(s.status).toBe(201);
    await api().post(`/api/v1/ai/inline/suggestions/${s.body.suggestion.id}/apply`)
      .set(as(assistCurator)).send({ edited: false });
    await api().post('/api/v1/ai/golden/harvest').set(as(curator)).send({});
    const cand = await owner.aiGoldenCandidate.findFirst({
      where: { tenantId: admin.id, suggestionId: s.body.suggestion.id },
    });
    expect(cand).not.toBeNull();

    const denied = await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/approve`)
      .set(as(assistCurator)).send({});
    expect(denied.status).toBe(409);
    const incident = await owner.auditLog.findFirst({
      where: { tenantId: admin.id, action: 'ai_golden.sod_denied', entityId: cand!.id },
    });
    expect(incident).not.toBeNull(); // vết incident sống độc lập tx

    // curator (khác người tạo) duyệt được
    const ok = await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/approve`)
      .set(as(curator)).send({});
    expect(ok.status).toBe(201);
  });

  it('reject: candidate proposed → rejected; duyệt lại → 409', async () => {
    const s = await api().post('/api/v1/ai/inline/taskcell.kpi_link').set(as(author))
      .send({ input: { payload: { ...partialCell, nameVi: `reject ${uniq}` } } });
    await api().post(`/api/v1/ai/inline/suggestions/${s.body.suggestion.id}/apply`)
      .set(as(author)).send({ edited: false });
    await api().post('/api/v1/ai/golden/harvest').set(as(curator)).send({});
    const cand = await owner.aiGoldenCandidate.findFirst({
      where: { tenantId: author.id, suggestionId: s.body.suggestion.id },
    });
    const rej = await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/reject`)
      .set(as(curator)).send({ note: 'không đại diện' });
    expect(rej.status).toBe(201);
    expect(rej.body.status).toBe('rejected');
    expect((await api().post(`/api/v1/ai/golden/candidates/${cand!.id}/approve`)
      .set(as(curator)).send({})).status).toBe(409);
    // rejected KHÔNG sinh eval case
    expect(cand!.caseId).toBeNull();
  });

  it('list candidates: lọc status, emp 403', async () => {
    expect((await api().get('/api/v1/ai/golden/candidates').set(as(emp))).status).toBe(403);
    const res = await api().get('/api/v1/ai/golden/candidates?status=approved').set(as(curator));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const c of res.body) expect(c.status).toBe('approved');
    expect((await api().get('/api/v1/ai/golden/candidates?status=rm-rf').set(as(curator))).status).toBe(422);
  });

  // ===== Seed baseline =====
  it('seed golden-fin-baseline: 4 suite / 9 case curated, idempotent, cùng bộ assertion', async () => {
    const r1 = await seedGoldenFin(owner, 'H.01');
    expect(r1.suites).toBe(4);
    expect(r1.cases).toBe(9);
    const r2 = await seedGoldenFin(owner, 'H.01');
    expect(r2.created).toBe(0); // chạy lại → toàn update, không nhân bản
    expect(r2.updated).toBe(9);

    const suite = await owner.aiEvalSuite.findFirst({
      where: { tenantId: author.id, agent: 'inline.taskcell.kpi_link', name: BASELINE_SUITE_NAME },
    });
    expect(suite).not.toBeNull();
    const apCase = await owner.aiEvalCase.findFirst({
      where: { tenantId: author.id, suiteId: suite!.id, name: 'fin-kpi-link-ap' },
    });
    expect(apCase!.assertions).toEqual([{ type: 'equals', path: 'kpiRef', value: 'FIN-EXT-001' }]);
    expect((apCase!.input as any).context.candidates.length).toBeGreaterThanOrEqual(41);
  });
});
