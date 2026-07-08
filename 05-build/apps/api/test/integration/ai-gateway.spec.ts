/**
 * Integration Phase 3 lát 4a — MCP server governed (2 lớp permission, HITL suggestion)
 * + eval harness tất định trên mock + ai_interaction append-only + cô lập tenant.
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

describe('Phase 3 lát 4a — ai-gateway + MCP + eval harness', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;
  let designer: Ctx;
  let approver: Ctx;
  let emp: Ctx;
  let t2designer: Ctx;
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
    designer = await ctxFor('H.01', 'designer@');
    approver = await ctxFor('H.01', 'approver@');
    emp = await ctxFor('H.01', 'emp1@');
    t2designer = await ctxFor('T2.TEST', 'designer@');

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
  let suggestionId: string;
  let suiteId: string;

  // ===== MCP: registry + guard 2 lớp =====
  it('GET /mcp/tools: designer (ai:invoke) thấy catalog; emp/approver KHÔNG có ai:invoke → 403', async () => {
    const res = await api().get('/api/v1/mcp/tools').set(as(designer));
    expect(res.status).toBe(200);
    const names = res.body.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'ipms.get_org', 'ipms.get_kpi', 'ipms.get_scorecard', 'ipms.get_task_dictionary',
      'ipms.propose_org_change', 'ipms.propose_derivation_rule',
    ]));
    expect((await api().get('/api/v1/mcp/tools').set(as(emp))).status).toBe(403);
    expect((await api().get('/api/v1/mcp/tools').set(as(approver))).status).toBe(403);
  });

  it('invoke ipms.get_org: trả org tenant mình + ghi ai_interaction (append-only log)', async () => {
    const res = await api().post('/api/v1/mcp/tools/ipms.get_org/invoke').set(as(designer)).send({});
    expect(res.status).toBe(201);
    expect(res.body.readOnly).toBe(true);
    expect(res.body.result.length).toBeGreaterThan(0);
    const codes = res.body.result.map((o: any) => o.code);
    expect(codes).toContain('ROOT');

    const log = await owner.aiInteraction.findFirst({
      where: { tenantId: designer.id, toolName: 'ipms.get_org', actorUserId: designer.userId },
      orderBy: { at: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.agent).toBe('mcp');
    expect(log!.status).toBe('ok');
  });

  it('lớp 2 fail-closed: tool cần scope_permission caller không giữ → 403 + log blocked', async () => {
    // tenant_admin có mọi quyền TRỪ audit:read — tạo tool test scope audit:read
    await owner.mcpTool.create({
      data: {
        id: uuidv7(), tenantId: admin.id, name: `test.blocked_${uniq}`,
        descriptionVi: 'tool test scope', scopePermission: 'audit:read',
        readOnly: true, enabled: true,
      },
    });
    const res = await api().post(`/api/v1/mcp/tools/test.blocked_${uniq}/invoke`).set(as(admin)).send({});
    expect(res.status).toBe(403);
    const log = await owner.aiInteraction.findFirst({
      where: { tenantId: admin.id, toolName: `test.blocked_${uniq}` },
      orderBy: { at: 'desc' },
    });
    expect(log!.status).toBe('blocked');
  });

  it('tenant override thắng global: H.01 tắt ipms.get_kpi → 404; T2 vẫn gọi được', async () => {
    await owner.mcpTool.create({
      data: {
        id: uuidv7(), tenantId: admin.id, name: 'ipms.get_kpi',
        descriptionVi: 'override tắt', scopePermission: 'kpi:read',
        readOnly: true, enabled: false,
      },
    });
    expect((await api().post('/api/v1/mcp/tools/ipms.get_kpi/invoke').set(as(designer)).send({})).status).toBe(404);
    expect((await api().post('/api/v1/mcp/tools/ipms.get_kpi/invoke').set(as(t2designer)).send({})).status).toBe(201);
    // dọn override để không ảnh hưởng test khác
    await owner.mcpTool.deleteMany({ where: { tenantId: admin.id, name: 'ipms.get_kpi' } });
  });

  // ===== HITL: propose → ai_suggestion → accept/reject =====
  it('propose_org_change: tạo ai_suggestion PENDING, KHÔNG chạm org (human-in-the-loop)', async () => {
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `AI lát 4a ${uniq}` });
    expect(cv.status).toBe(201);
    draftId = cv.body.id;

    const orgBefore = await owner.orgUnit.count({ where: { tenantId: designer.id, deletedAt: null } });
    const res = await api().post('/api/v1/mcp/tools/ipms.propose_org_change/invoke').set(as(designer)).send({
      args: {
        configVersionId: draftId,
        proposal: { op: 'create_org_unit', code: `AI-DEPT-${uniq}`, name_vi: 'Phòng AI đề xuất' },
        reason: 'Copilot mock đề xuất từ mô tả người dùng',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.result.status).toBe('pending');
    suggestionId = res.body.result.id;

    expect(await owner.orgUnit.count({ where: { tenantId: designer.id, deletedAt: null } })).toBe(orgBefore);
  });

  it('emp không accept được (403 — thiếu config:write); designer accept → config_change vào draft', async () => {
    expect((await api().post(`/api/v1/ai/suggestions/${suggestionId}/accept`).set(as(emp))
      .send({})).status).toBe(403);

    const res = await api().post(`/api/v1/ai/suggestions/${suggestionId}/accept`).set(as(designer))
      .send({ note: 'duyệt bản nháp' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');
    expect(res.body.decidedBy).toBe(designer.userId);

    const change = await owner.configChange.findFirst({
      where: { tenantId: designer.id, configVersionId: draftId, entityType: 'ai_suggestion:org_change' },
    });
    expect(change).not.toBeNull();
    expect((change!.after as any).suggestion_id).toBe(suggestionId);
  });

  it('HITL không lách vào version PUBLISHED: propose → 409; accept trỏ published → 409', async () => {
    // designer tạo draft mới, approver publish (SoD)
    const cv2 = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `AI published ${uniq}` });
    const pub = await api().post(`/api/v1/config-versions/${cv2.body.id}/publish`).set(as(approver))
      .send({ version: cv2.body.version });
    expect(pub.status).toBe(201);

    // (c) propose vào version đã publish → 409 (mustGetDraft)
    expect((await api().post('/api/v1/mcp/tools/ipms.propose_org_change/invoke').set(as(designer)).send({
      args: { configVersionId: cv2.body.id, proposal: { op: 'x' } },
    })).status).toBe(409);

    // (b) accept trỏ configVersionId published → 409, suggestion vẫn pending
    const s2 = await api().post('/api/v1/mcp/tools/ipms.propose_org_change/invoke').set(as(designer)).send({
      args: { proposal: { op: 'create_org_unit', code: `AI-X-${uniq}` } },
    });
    expect(s2.status).toBe(201);
    expect((await api().post(`/api/v1/ai/suggestions/${s2.body.result.id}/accept`).set(as(designer))
      .send({ configVersionId: cv2.body.id })).status).toBe(409);
    const still = await owner.aiSuggestion.findFirst({ where: { id: s2.body.result.id } });
    expect(still!.status).toBe('pending');
  });

  it('double-accept → 409 (conditional update); reject suggestion đã quyết → 409', async () => {
    expect((await api().post(`/api/v1/ai/suggestions/${suggestionId}/accept`).set(as(designer))
      .send({})).status).toBe(409);
    expect((await api().post(`/api/v1/ai/suggestions/${suggestionId}/reject`).set(as(designer))
      .send({ note: 'x' })).status).toBe(409);
  });

  // ===== EVAL HARNESS =====
  it('tạo suite (case thiếu assertions → 422) + chạy: mock tất định, summary đúng', async () => {
    expect((await api().post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: 'config_copilot', name: `bad ${uniq}`,
      cases: [{ input: { prompt: 'x' }, assertions: [] }],
    })).status).toBe(422);

    const suite = await api().post('/api/v1/ai/eval/suites').set(as(designer)).send({
      agent: 'config_copilot', name: `copilot smoke ${uniq}`,
      cases: [
        { name: 'shape đúng', input: { prompt: 'Tạo phòng Tuyển sinh', context: { org: 'H.01' } },
          assertions: [
            { type: 'equals', path: 'suggestion_type', value: 'org_change' },
            { type: 'contains', path: 'proposal.summary', value: '[MOCK]' },
            { type: 'exists', path: 'confidence' },
          ] },
        { name: 'cố tình fail', input: { prompt: 'Tạo phòng Kế toán' },
          assertions: [{ type: 'equals', path: 'suggestion_type', value: 'không_bao_giờ_đúng' }] },
      ],
    });
    expect(suite.status).toBe(201);
    suiteId = suite.body.id;

    const run = await api().post(`/api/v1/ai/eval/suites/${suiteId}/run`).set(as(designer));
    expect(run.status).toBe(201);
    expect(run.body.status).toBe('done');
    expect(run.body.model).toBe('mock');
    expect(run.body.summary).toEqual({ pass: 1, fail: 1, avg_score: 0.5, deterministic: true });
  });

  it('TẤT ĐỊNH: chạy lại suite → summary + score từng case y hệt', async () => {
    const run2 = await api().post(`/api/v1/ai/eval/suites/${suiteId}/run`).set(as(designer));
    expect(run2.body.summary).toEqual({ pass: 1, fail: 1, avg_score: 0.5, deterministic: true });
    const scores = run2.body.results.map((r: any) => [r.passed, r.score]).sort();
    expect(scores).toEqual([[false, '0'], [true, '1']]);
  });

  it('emp không chạy eval (403); T2 không thấy suite/run của H.01 (RLS)', async () => {
    expect((await api().post(`/api/v1/ai/eval/suites/${suiteId}/run`).set(as(emp))).status).toBe(403);
    const t2suites = await api().get('/api/v1/ai/eval/suites').set(as(t2designer));
    expect(t2suites.body.map((s: any) => s.id)).not.toContain(suiteId);
  });

  // ===== ai_interaction append-only + RED-LINE =====
  it('ai_interaction APPEND-ONLY: update/delete bị trigger chặn (kể cả owner)', async () => {
    const row = await owner.aiInteraction.findFirst({ where: { tenantId: designer.id } });
    await expect(
      owner.aiInteraction.update({ where: { id: row!.id }, data: { status: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.aiInteraction.delete({ where: { id: row!.id } }),
    ).rejects.toThrow(/append-only/);
  });

  it('RED-LINE: flag ai_gateway_live mặc định OFF ⇒ backend mock (0 chi phí)', async () => {
    const flag = await owner.featureFlag.findFirst({ where: { tenantId: null, key: 'ai_gateway_live' } });
    expect(flag!.enabled).toBe(false);
    const cost = await owner.aiInteraction.aggregate({
      where: { tenantId: designer.id }, _sum: { costUsd: true },
    });
    expect(Number(cost._sum.costUsd ?? 0)).toBe(0);
  });
});
