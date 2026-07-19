/**
 * Integration — [Learning Loop L0] tín hiệu học từ HITL inline:
 * apply/apply-edited/dismiss → signal đúng outcome (cùng tx) · append-only ·
 * [F158] expire job PENDING mồ côi · stats per agent (ai:eval) · cô lập tenant.
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

describe('Learning Loop L0 — ai_learning_signal + F158 expire', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
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

  const partialCell = { nameVi: `Học từ HITL ${uniq}`, code: 'TS-G01-C01-T001' };

  async function makeSuggestion(task: string, input: Record<string, unknown>) {
    const res = await api().post(`/api/v1/ai/inline/${task}`).set(as(author)).send({ input });
    expect(res.status).toBe(201);
    return res.body as { suggestion: { id: string }; proposal: Record<string, unknown> };
  }

  // ===== Chấp nhận sạch =====
  it('apply (edited=false) → signal outcome=accepted CÙNG tx, đủ proposed + actor, editedFields null', async () => {
    const { suggestion } = await makeSuggestion('taskcell.draft', { payload: partialCell });
    const res = await api().post(`/api/v1/ai/inline/suggestions/${suggestion.id}/apply`)
      .set(as(author)).send({ edited: false });
    expect(res.status).toBe(201);

    const sig = await owner.aiLearningSignal.findFirst({
      where: { tenantId: author.id, suggestionId: suggestion.id },
    });
    expect(sig).not.toBeNull();
    expect(sig!.outcome).toBe('accepted');
    expect(sig!.agent).toBe('inline.taskcell.draft');
    expect(sig!.actorUserId).toBe(author.userId);
    expect(sig!.editedFields).toBeNull();
    expect((sig!.proposedPayload as any).fill).toBeTruthy();
  });

  // ===== Sửa rồi chấp nhận =====
  it('apply edited + finalPayload khác → accepted_with_edits + editedFields chỉ đúng field bị sửa', async () => {
    const { suggestion, proposal } = await makeSuggestion('taskcell.kpi_link', { payload: partialCell });
    const aiKpi = proposal.kpiRef as string;
    // Chọn 1 mã KHÁC trong Từ điển KPI làm "người dùng sửa lại"
    const other = await owner.kpiTemplate.findFirst({
      where: { tenantId: author.id, isDictionary: true, deletedAt: null, code: { not: aiKpi } },
    });
    expect(other).not.toBeNull();

    const res = await api().post(`/api/v1/ai/inline/suggestions/${suggestion.id}/apply`)
      .set(as(author)).send({ edited: true, finalPayload: { kpiRef: other!.code }, note: 'sửa rồi chấp nhận' });
    expect(res.status).toBe(201);

    const sig = await owner.aiLearningSignal.findFirst({
      where: { tenantId: author.id, suggestionId: suggestion.id },
    });
    expect(sig!.outcome).toBe('accepted_with_edits');
    expect(sig!.editedFields).toEqual(['kpiRef']);
    expect((sig!.proposedPayload as any).kpiRef).toBe(aiKpi);
    expect((sig!.finalPayload as any).kpiRef).toBe(other!.code);
  });

  it('apply edited=true nhưng finalPayload Y HỆT proposal → vẫn accepted_with_edits (tôn trọng cờ người dùng)', async () => {
    const { suggestion, proposal } = await makeSuggestion('taskcell.kpi_link', { payload: partialCell });
    const res = await api().post(`/api/v1/ai/inline/suggestions/${suggestion.id}/apply`)
      .set(as(author)).send({ edited: true, finalPayload: { kpiRef: proposal.kpiRef } });
    expect(res.status).toBe(201);
    const sig = await owner.aiLearningSignal.findFirst({
      where: { tenantId: author.id, suggestionId: suggestion.id },
    });
    expect(sig!.outcome).toBe('accepted_with_edits');
    expect(sig!.editedFields).toEqual([]);
  });

  it('finalPayload >16KB → 422 (F149), suggestion vẫn pending, KHÔNG signal', async () => {
    const { suggestion } = await makeSuggestion('taskcell.draft', { payload: partialCell });
    const res = await api().post(`/api/v1/ai/inline/suggestions/${suggestion.id}/apply`)
      .set(as(author)).send({ edited: true, finalPayload: { x: 'y'.repeat(17_000) } });
    expect(res.status).toBe(422);
    const still = await owner.aiSuggestion.findFirst({ where: { id: suggestion.id } });
    expect(still!.status).toBe('pending');
    expect(await owner.aiLearningSignal.count({
      where: { tenantId: author.id, suggestionId: suggestion.id },
    })).toBe(0);
  });

  // ===== Bỏ =====
  it('dismiss → signal outcome=rejected, finalPayload null', async () => {
    const { suggestion } = await makeSuggestion('taskcell.draft', { payload: partialCell });
    const res = await api().post(`/api/v1/ai/inline/suggestions/${suggestion.id}/dismiss`)
      .set(as(author)).send({ note: 'không dùng' });
    expect(res.status).toBe(201);
    const sig = await owner.aiLearningSignal.findFirst({
      where: { tenantId: author.id, suggestionId: suggestion.id },
    });
    expect(sig!.outcome).toBe('rejected');
    expect(sig!.finalPayload).toBeNull();
  });

  // ===== Append-only =====
  it('ai_learning_signal APPEND-ONLY: UPDATE/DELETE bị trigger chặn kể cả owner', async () => {
    const row = await owner.aiLearningSignal.findFirst({ where: { tenantId: author.id } });
    expect(row).not.toBeNull();
    await expect(
      owner.$executeRawUnsafe(`UPDATE ai_learning_signal SET outcome='accepted' WHERE id='${row!.id}'`),
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.$executeRawUnsafe(`DELETE FROM ai_learning_signal WHERE id='${row!.id}'`),
    ).rejects.toThrow(/append-only/);
  });

  // ===== F158 expire =====
  it('[F158] expire job: pending quá TTL → expired + signal outcome=expired (actor=null); pending mới KHÔNG bị đụng', async () => {
    // Suggestion mồ côi 20 ngày tuổi (owner ghi thẳng — giả lập lịch sử)
    const orphan = await owner.aiSuggestion.create({
      data: {
        id: uuidv7(), tenantId: author.id, type: 'taskcell_draft',
        payload: { proposal: { fill: { nameVi: `mồ côi ${uniq}` } } },
        status: 'pending', createdBy: author.userId, createdByTool: 'inline.taskcell.draft',
        createdAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });
    const { suggestion: fresh } = await makeSuggestion('taskcell.draft', { payload: partialCell });

    // author (không ai:eval) → 403; emp → 403
    expect((await api().post('/api/v1/ai/learning/jobs/expire/run').set(as(author)).send({})).status).toBe(403);
    expect((await api().post('/api/v1/ai/learning/jobs/expire/run').set(as(emp)).send({})).status).toBe(403);

    const res = await api().post('/api/v1/ai/learning/jobs/expire/run')
      .set(as(designer)).send({ ttlDays: 14 });
    expect(res.status).toBe(201);
    expect(res.body.expired).toBeGreaterThanOrEqual(1);
    expect(res.body.ttlDays).toBe(14);

    const expired = await owner.aiSuggestion.findFirst({ where: { id: orphan.id } });
    expect(expired!.status).toBe('expired');
    expect(expired!.decisionNote).toContain('auto-expire F158');
    const sig = await owner.aiLearningSignal.findFirst({
      where: { tenantId: author.id, suggestionId: orphan.id },
    });
    expect(sig!.outcome).toBe('expired');
    expect(sig!.actorUserId).toBeNull();

    // pending mới (trong TTL) không bị đụng — và vẫn apply được bình thường
    const stillFresh = await owner.aiSuggestion.findFirst({ where: { id: fresh.id } });
    expect(stillFresh!.status).toBe('pending');

    // idempotent: chạy lại — orphan đã expired, không tăng thêm signal cho nó
    await api().post('/api/v1/ai/learning/jobs/expire/run').set(as(designer)).send({ ttlDays: 14 });
    expect(await owner.aiLearningSignal.count({
      where: { tenantId: author.id, suggestionId: orphan.id },
    })).toBe(1);
  });

  it('[F158] ttlDays ngoài khoảng 1–365 → 422/400 tại cửa', async () => {
    expect((await api().post('/api/v1/ai/learning/jobs/expire/run')
      .set(as(designer)).send({ ttlDays: 0 })).status).toBeGreaterThanOrEqual(400);
    expect((await api().post('/api/v1/ai/learning/jobs/expire/run')
      .set(as(designer)).send({ ttlDays: 9999 })).status).toBeGreaterThanOrEqual(400);
  });

  // ===== Stats =====
  it('stats (ai:eval): emp/author 403; designer thấy aggregate per agent + topEditedFields', async () => {
    expect((await api().get('/api/v1/ai/learning/stats').set(as(emp))).status).toBe(403);
    expect((await api().get('/api/v1/ai/learning/stats').set(as(author))).status).toBe(403);

    const res = await api().get('/api/v1/ai/learning/stats').set(as(designer));
    expect(res.status).toBe(200);
    expect(res.body.totalSignals).toBeGreaterThanOrEqual(4);

    const kpiLink = res.body.agents.find((a: any) => a.agent === 'inline.taskcell.kpi_link');
    expect(kpiLink).toBeTruthy();
    expect(kpiLink.acceptedWithEdits).toBeGreaterThanOrEqual(1);
    expect(kpiLink.topEditedFields.map((f: any) => f.field)).toContain('kpiRef');
    expect(kpiLink.acceptRate).not.toBeNull();

    const draft = res.body.agents.find((a: any) => a.agent === 'inline.taskcell.draft');
    expect(draft.accepted).toBeGreaterThanOrEqual(1);
    expect(draft.rejected).toBeGreaterThanOrEqual(1);
    expect(draft.expired).toBeGreaterThanOrEqual(1);
  });

  // ===== Cô lập tenant + RLS =====
  it('signal nằm đúng tenant; RLS fail-closed khi thiếu context', async () => {
    const rows = await owner.aiLearningSignal.findMany({
      where: { suggestionId: { in: (await owner.aiSuggestion.findMany({
        where: { tenantId: author.id, createdBy: author.userId }, select: { id: true },
      })).map((s) => s.id) } },
    });
    for (const r of rows) expect(r.tenantId).toBe(author.id);

    const app_client = createPrismaClient(process.env.DATABASE_URL);
    try {
      const naked = await app_client.$queryRawUnsafe<any[]>('SELECT * FROM ai_learning_signal LIMIT 5');
      expect(naked.length).toBe(0); // không set app.tenant_id ⇒ 0 dòng
    } finally {
      await app_client.$disconnect();
    }
  });
});
