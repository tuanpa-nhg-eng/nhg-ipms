/**
 * Integration — [Lát AI inline] 4 tác vụ inline assist trên ai-gateway (mock tất định):
 * permission ai:assist (tách khỏi ai:invoke) · HITL suggestion PENDING · fail-closed
 * (parse/422, cap 16KB, draft-only) · self-apply/dismiss · cô lập tenant · RED-LINE cost 0.
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

describe('Lát AI inline — inline assist (ai:assist)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let curator: Ctx;
  let designer: Ctx;
  let approver: Ctx;
  let emp: Ctx;
  let t2curator: Ctx;
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
    designer = await ctxFor('H.01', 'designer@');
    approver = await ctxFor('H.01', 'approver@');
    emp = await ctxFor('H.01', 'emp1@');
    t2curator = await ctxFor('T2.TEST', 'curator@');

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

  const partialCell = { nameVi: `Tư vấn tuyển sinh ${uniq}`, code: 'TS-G01-C01-T001' };

  // ===== Permission: ai:assist tách khỏi ai:invoke =====
  it('emp1@ (employee, KHÔNG có ai:assist) → 403; author@ (bu_author) → qua', async () => {
    expect((await api().post('/api/v1/ai/inline/taskcell.draft').set(as(emp))
      .send({ input: { payload: partialCell } })).status).toBe(403);
    const res = await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: partialCell } });
    expect(res.status).toBe(201);
  });

  it('fail-closed cửa vào: task lạ → 422; input >16KB → 422; thiếu payload → 422', async () => {
    expect((await api().post('/api/v1/ai/inline/rm.rf').set(as(author))
      .send({ input: {} })).status).toBe(422);
    expect((await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: { nameVi: 'x'.repeat(17_000) } } })).status).toBe(422);
    expect((await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: {} })).status).toBe(422);
  });

  // ===== taskcell.draft =====
  let draftSuggestionId: string;
  it('taskcell.draft: điền nhóm A–G thiếu → suggestion PENDING + diff cũ→mới + ai_interaction; KHÔNG ghi cell', async () => {
    const cellsBefore = await owner.taskCell.count({ where: { tenantId: author.id } });
    const res = await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: partialCell } });
    expect(res.status).toBe(201);
    expect(res.body.suggestion.status).toBe('pending');
    expect(res.body.suggestion.type).toBe('taskcell_draft');
    draftSuggestionId = res.body.suggestion.id;
    const fields = res.body.diff.map((d: any) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['responsibleRole', 'inputs', 'outputs', 'measures', 'aiLevel']));
    expect(fields).not.toContain('nameVi'); // đã có → không điền
    expect(res.body.model).toBe('mock');

    expect(await owner.taskCell.count({ where: { tenantId: author.id } })).toBe(cellsBefore);
    const log = await owner.aiInteraction.findFirst({
      where: { tenantId: author.id, toolName: 'inline.taskcell.draft', actorUserId: author.userId },
      orderBy: { at: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.status).toBe('ok');
  });

  it('TẤT ĐỊNH: cùng payload gọi 2 lần → proposal y hệt', async () => {
    const r1 = await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: partialCell } });
    const r2 = await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: partialCell } });
    expect(r1.body.proposal).toEqual(r2.body.proposal);
    expect(r1.body.reason).toBe(r2.body.reason);
  });

  it('gate đã đủ A–G → 422, KHÔNG tạo suggestion (fail-closed)', async () => {
    const before = await owner.aiSuggestion.count({ where: { tenantId: author.id } });
    const full = {
      code: 'TS-G01-C01-T099', nameVi: 'Đầy đủ', responsibleRole: 'CV', accountableRole: 'TP',
      inputs: [{ name: 'a' }], outputs: [{ name: 'b' }], measures: [{ name: 'c' }], aiLevel: 'assist',
    };
    expect((await api().post('/api/v1/ai/inline/taskcell.draft').set(as(author))
      .send({ input: { payload: full } })).status).toBe(422);
    expect(await owner.aiSuggestion.count({ where: { tenantId: author.id } })).toBe(before);
  });

  // ===== taskcell.kpi_link =====
  it('kpi_link: kpiRef gợi ý PHẢI thuộc Từ điển KPI (41 mục) + lý do explainable', async () => {
    const res = await api().post('/api/v1/ai/inline/taskcell.kpi_link').set(as(author))
      .send({ input: { payload: partialCell } });
    expect(res.status).toBe(201);
    const kpiRef = res.body.proposal.kpiRef;
    const dictRow = await owner.kpiTemplate.findFirst({
      where: { tenantId: author.id, code: kpiRef, isDictionary: true, deletedAt: null },
    });
    expect(dictRow).not.toBeNull();
    expect(res.body.reason.length).toBeGreaterThan(10);
    expect(res.body.diff).toEqual([{ field: 'kpiRef', old: null, new: kpiRef }]);
  });

  // ===== derivation.rule + vòng accept config:write (materialize F28) =====
  let ruleSuggestionId: string;
  let draftVersionId: string;
  it('derivation.rule gắn DRAFT: suggestion PENDING; author@ (không config:write) accept → 403', async () => {
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `inline assist ${uniq}` });
    expect(cv.status).toBe(201);
    draftVersionId = cv.body.id;

    const res = await api().post('/api/v1/ai/inline/derivation.rule').set(as(designer))
      .send({ input: { description: 'Rule KPI cho phòng tuyển sinh' }, configVersionId: draftVersionId });
    expect(res.status).toBe(201);
    expect(res.body.suggestion.status).toBe('pending');
    expect(res.body.suggestion.configVersionId).toBe(draftVersionId);
    expect(res.body.proposal.rule.match).toBeTruthy();
    expect(res.body.proposal.rule.emit).toBeTruthy();
    ruleSuggestionId = res.body.suggestion.id;

    expect((await api().post(`/api/v1/ai/suggestions/${ruleSuggestionId}/accept`).set(as(author))
      .send({})).status).toBe(403);
  });

  it('designer accept → materialize config_change vào DRAFT (không ghi rule trực tiếp)', async () => {
    const rulesBefore = await owner.derivationRule.count({ where: { tenantId: designer.id } });
    const res = await api().post(`/api/v1/ai/suggestions/${ruleSuggestionId}/accept`).set(as(designer))
      .send({ note: 'duyệt gợi ý inline' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');

    const change = await owner.configChange.findFirst({
      where: { tenantId: designer.id, configVersionId: draftVersionId, entityType: 'ai_suggestion:derivation_rule' },
    });
    expect(change).not.toBeNull();
    expect((change!.after as any).suggestion_id).toBe(ruleSuggestionId);
    // đối tượng nghiệp vụ KHÔNG bị ghi thẳng — vẫn đi vòng publish
    expect(await owner.derivationRule.count({ where: { tenantId: designer.id } })).toBe(rulesBefore);
  });

  it('không lách vào PUBLISHED: derivation.rule trỏ version đã publish → 409, KHÔNG tạo suggestion', async () => {
    const cv2 = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `inline pub ${uniq}` });
    const pub = await api().post(`/api/v1/config-versions/${cv2.body.id}/publish`).set(as(approver))
      .send({ version: cv2.body.version });
    expect(pub.status).toBe(201);

    const before = await owner.aiSuggestion.count({ where: { tenantId: designer.id } });
    expect((await api().post('/api/v1/ai/inline/derivation.rule').set(as(designer))
      .send({ input: { description: 'x' }, configVersionId: cv2.body.id })).status).toBe(409);
    expect(await owner.aiSuggestion.count({ where: { tenantId: designer.id } })).toBe(before);
  });

  // ===== self-apply / dismiss =====
  it('self-apply: NGƯỜI TẠO apply → accepted (audit vết inline-apply, không materialize); người khác → 403; double → 409', async () => {
    expect((await api().post(`/api/v1/ai/inline/suggestions/${draftSuggestionId}/apply`).set(as(curator))
      .send({})).status).toBe(403);

    const res = await api().post(`/api/v1/ai/inline/suggestions/${draftSuggestionId}/apply`).set(as(author))
      .send({ note: 'áp vào form soạn thảo' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');
    expect(res.body.decisionNote).toContain('[inline-apply]');

    expect((await api().post(`/api/v1/ai/inline/suggestions/${draftSuggestionId}/apply`).set(as(author))
      .send({})).status).toBe(409);
  });

  it('self-apply KHÔNG dùng được cho suggestion MCP (org_change) — chặn lách vòng config:write', async () => {
    const mcp = await owner.aiSuggestion.create({
      data: {
        id: uuidv7(), tenantId: author.id, type: 'org_change',
        payload: { op: 'x' }, status: 'pending', createdBy: author.userId, createdByTool: 'ipms.propose_org_change',
      },
    });
    expect((await api().post(`/api/v1/ai/inline/suggestions/${mcp.id}/apply`).set(as(author))
      .send({})).status).toBe(403);
  });

  // ===== curation.dedup =====
  it('curation.dedup: tóm tắt khác biệt 2 cell → khuyến nghị merge/keep_both (curator)', async () => {
    const canonical = await owner.taskCell.findFirst({
      where: { tenantId: curator.id, configVersionId: null, deletedAt: null },
    });
    expect(canonical).not.toBeNull();
    const contrib = await owner.libraryContribution.create({
      data: {
        id: uuidv7(), tenantId: curator.id, authorId: author.userId, type: 'task_cell',
        payload: {
          code: canonical!.code, nameVi: `${canonical!.nameVi} (bản BU chỉnh)`,
          responsibleRole: 'Vai trò khác', aiLevel: 'automate',
        },
        status: 'submitted',
      },
    });
    await owner.libraryDedupCandidate.create({
      data: {
        id: uuidv7(), tenantId: curator.id, contributionId: contrib.id,
        similarTaskCellId: canonical!.id, similarity: 1.0, reason: 'exact code', resolution: 'pending',
      },
    });

    const res = await api().post('/api/v1/ai/inline/curation.dedup').set(as(curator))
      .send({ input: { contributionId: contrib.id } });
    expect(res.status).toBe(201);
    expect(['merge', 'keep_both']).toContain(res.body.proposal.recommendation);
    expect(res.body.diff.length).toBeGreaterThan(0);
    expect(res.body.suggestion.type).toBe('curation_dedup');

    // Cô lập tenant: curator T2 không thấy contribution H.01 → 404
    expect((await api().post('/api/v1/ai/inline/curation.dedup').set(as(t2curator))
      .send({ input: { contributionId: contrib.id } })).status).toBe(404);
  });

  // ===== RED-LINE =====
  it('RED-LINE: mọi interaction inline model=mock, tổng cost 0', async () => {
    const rows = await owner.aiInteraction.findMany({
      where: { tenantId: author.id, toolName: { startsWith: 'inline.' } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.model === null || r.model === 'mock').toBe(true);
    const cost = await owner.aiInteraction.aggregate({
      where: { tenantId: author.id, toolName: { startsWith: 'inline.' } }, _sum: { costUsd: true },
    });
    expect(Number(cost._sum.costUsd ?? 0)).toBe(0);
  });
});
