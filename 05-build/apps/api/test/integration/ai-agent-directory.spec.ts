/**
 * Integration [Trục D L0] Danh bạ agent AI — `/ai/agents`.
 *
 * Trọng tâm, đúng cổng ra mà kế hoạch trục D đòi ở L0:
 *  - MỌI mã agent mà mã sản phẩm đang truyền vào `LlmRequest.agent` đều tra được trong sổ
 *    (điều kiện cần để L1 bật N1 "agent lạ ⇒ 422" mà không gãy tính năng đang chạy)
 *  - đơn vị chỉ SIẾT được, không nới — kiểm CẢ ở service (422 đọc được) lẫn ở TRIGGER DB
 *    (đường ghi trực tiếp bằng OWNER, bỏ qua service VÀ bỏ qua RLS, vẫn phải bị chặn)
 *  - phân quyền: đọc cho vai quản trị, ghi CHỈ `data_steward`
 *  - agent chưa đăng ký ⇒ 404 fail-closed, KHÔNG mặc định về một agent "chung chung"
 *
 * ⚠️ PHẠM VI: L0 chỉ dựng SỔ. `ai-gateway` CHƯA gọi `resolve()` — cưỡng chế N1/N2/N3 là L1.
 * Spec này cố ý KHÔNG khẳng định gateway đã bị chặn, để không mạo nhận một bất biến chưa có.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7, ACTIVE_AGENT_CODES, GLOBAL_AI_AGENTS } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string }

describe('[Trục D L0] Danh bạ agent AI', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;    // tenant_admin — có aiagent:read, KHÔNG có :write
  let steward: Ctx;  // data_steward — vai DUY NHẤT có :write
  let emp: Ctx;      // employee — không có quyền nào với danh bạ
  let t2admin: Ctx;

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    if (!user) throw new Error(`User ${emailPrefix} @ ${tenantCode} chưa seed`);
    const token = jwt.sign(
      { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user.id };
  }

  const H = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    // Bài học đắt nhất trục C L5: dựng trạng thái đầu vào ở beforeAll, không chỉ dọn ở
    // afterAll. Một đơn vị CÓ override là trạng thái sản phẩm hợp lệ — driver sống có thể để
    // lại một dòng, và ca đối chứng "siết được" sẽ ăn lỗi unique thay vì lỗi trigger.
    await owner.aiAgent.deleteMany({ where: { tenantId: { not: null } } }).catch(() => {});
    admin = await ctxFor('H.01', 'admin@');
    steward = await ctxFor('H.01', 'steward@');
    emp = await ctxFor('H.01', 'emp1@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await owner.aiAgent.deleteMany({ where: { tenantId: { not: null } } }).catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  // ─────────────────────────── đọc + phân quyền ───────────────────────────

  it('data_steward đọc được danh bạ đầy đủ', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ai/agents').set(H(steward)).expect(200);
    expect(res.body.entries.length).toBe(GLOBAL_AI_AGENTS.length);
    expect(res.body.total).toBe(res.body.entries.length);
    const copilot = res.body.entries.find((e: any) => e.code === 'config_copilot');
    // Sáu trường BR-M09-02 đòi, phải có mặt đủ trên đường đọc — không chỉ trong DB.
    expect(copilot).toMatchObject({
      ownerRole: 'B3', maxDataClass: 'internal', hitlMode: 'propose_only',
      status: 'active', scope: 'global',
    });
    expect(copilot.purpose.length).toBeGreaterThan(0);
    expect(copilot.permissions.length).toBeGreaterThan(0);
    expect(copilot.dataAssetCodes.length).toBeGreaterThan(0);
  });

  it('tenant_admin đọc được (aiagent:read cấp rộng cho vai quản trị)', async () => {
    await request(app.getHttpServer()).get('/api/v1/ai/agents').set(H(admin)).expect(200);
  });

  it('employee KHÔNG đọc được danh bạ — 403', async () => {
    await request(app.getHttpServer()).get('/api/v1/ai/agents').set(H(emp)).expect(403);
  });

  it('tenant_admin KHÔNG ghi được — chỉ data_steward giữ aiagent:write', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/config_copilot').set(H(admin))
      .send({ maxDataClass: 'public' }).expect(403);
  });

  // ─────────────────────────── CỔNG RA L0 ───────────────────────────

  it('🎯 CỔNG RA — mọi mã agent ĐANG CHẠY THẬT đều tra được trong sổ', async () => {
    expect(ACTIVE_AGENT_CODES.length).toBeGreaterThan(0);   // chống assert chạy 0 lần
    for (const code of ACTIVE_AGENT_CODES) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ai/agents/${code}`).set(H(steward)).expect(200);
      expect(res.body.code).toBe(code);
      expect(res.body.status).toBe('active');
    }
  });

  it('🎯 CỔNG RA — mã agent mà `ai_interaction` đã ghi mà sổ KHÔNG có thì phải là rác của TEST', async () => {
    /**
     * Đây là phép đo quyết định L1 có bật N1 được hay không, nên nó phải tự chứng minh mình
     * đo đúng đối tượng (lỗi ĐO đã lặp BỐN lần trong trục C).
     *
     * Phát biểu: mọi giá trị `agent` từng được ghi mà không tra được trong danh bạ đều phải
     * mang dấu vết TEST. Nếu một mã KHÔNG khớp mẫu test nào lọt vào đây, nghĩa là có đường
     * chạy sản phẩm mà sổ chưa phủ — và bật N1 ở L1 sẽ gãy đúng đường đó.
     */
    const rows: Array<{ agent: string }> = await owner.$queryRawUnsafe(
      `SELECT DISTINCT i.agent FROM ai_interaction i
        WHERE NOT EXISTS (SELECT 1 FROM ai_agent a WHERE a.tenant_id IS NULL AND a.code = i.agent)`,
    );
    // Mẫu do CHÍNH các spec trong repo sinh ra — truy được về 5 tệp:
    // egress-policy · anthropic-live-wiring · ai-readiness · model-qualification · ai-governance-fixes
    const DAU_VET_TEST = /^(egress-(test|pii|narrowed|internal)-|anthropic-(live|stream)-|inline\.test\.)/;
    const nghi_van = rows.map((r) => r.agent).filter((a) => !DAU_VET_TEST.test(a));
    expect(nghi_van).toEqual([]);
  });

  it('agent chưa đăng ký ⇒ 404 fail-closed, KHÔNG mặc định về agent chung chung', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/ai/agents/khong.co.that').set(H(steward)).expect(404);
  });

  // ─────────────────────────── siết được / nới không được ───────────────────────────

  it('đơn vị SIẾT được: hạ trần + bớt quyền + tắt agent', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/ai/agents/config_copilot').set(H(steward))
      .send({ maxDataClass: 'public', permissions: ['kpi:read'], status: 'retired' })
      .expect(200);
    expect(res.body).toMatchObject({ scope: 'tenant', created: true, maxDataClass: 'public' });

    // bản hiệu lực nay là bản của đơn vị
    const eff = await request(app.getHttpServer())
      .get('/api/v1/ai/agents/config_copilot').set(H(steward)).expect(200);
    expect(eff.body).toMatchObject({ scope: 'tenant', maxDataClass: 'public', status: 'retired' });
    expect(eff.body.permissions).toEqual(['kpi:read']);
  });

  it('① NỚI trần phân loại ⇒ 422', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/inline.taskcell.draft').set(H(steward))
      .send({ maxDataClass: 'confidential' }).expect(422);
  });

  it('② thêm quyền NGOÀI hiến chương chuẩn ⇒ 422', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/inline.taskcell.draft').set(H(steward))
      .send({ permissions: ['taskcell:read', 'payroll:export'] }).expect(422);
  });

  it('③ thêm nhóm dữ liệu NGOÀI phạm vi chuẩn ⇒ 422', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/inline.taskcell.draft').set(H(steward))
      .send({ dataAssetCodes: ['task.dictionary', 'payroll.reward'] }).expect(422);
  });

  it('④ NỚI chế độ HITL (read_only → propose_only) ⇒ 422', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/review.summarizer').set(H(steward))
      .send({ hitlMode: 'propose_only' }).expect(422);
  });

  it('⑤ tự BẬT agent mà bản chuẩn để `planned` ⇒ 422 (N7)', async () => {
    // Đây là chiều nới lỏng vô hiệu hoá cả bốn chiều kia: agent `review.summarizer` đòi mô
    // hình nội bộ, self-host chưa tồn tại. Bật được nghĩa là L3 chưa làm mà đã có đường chạy.
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/review.summarizer').set(H(steward))
      .send({ status: 'active' }).expect(422);
  });

  it('đơn vị KHÔNG đúc được agent mã mới ⇒ 422', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/ai/agents/agent.tu.che').set(H(steward))
      .send({ maxDataClass: 'internal' }).expect(422);
  });

  // ─────────────────────── trigger DB: đường ghi trực tiếp ───────────────────────

  it('🔒 TRIGGER DB chặn nới lỏng kể cả khi ĐI THẲNG bằng OWNER (bỏ qua service + bỏ qua RLS)', async () => {
    /**
     * Kiểm ở service trả 422 đọc được; kiểm ở DB để không đường ghi nào lách được. Chạy bằng
     * `owner` là có chủ đích — role đó BỎ QUA RLS, nên nếu chỉ có RLS mà không có trigger thì
     * ca này sẽ LỌT. Cùng bài học "probe của tôi đo sai đối tượng" ở trục C L2 ③.
     */
    const t2 = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });

    /**
     * ⚠️ MỖI ĐÒN PHẢI ĐÁNH ĐÚNG AGENT CÓ BẢN CHUẨN Ở TRẠNG THÁI CHẶT HƠN.
     *
     * Bản đầu của ca này dùng `inline.taskcell.draft` cho cả bốn đòn — nhưng bản chuẩn của nó
     * ĐÃ LÀ `propose_only`, nên đòn ④ đặt `propose_only` không phải "nới" và trigger cho qua
     * ĐÚNG. Test báo đỏ một lỗ không tồn tại. Đây là lần thứ HAI trong cùng phiên probe của
     * tôi đo sai đối tượng (lần đầu ở probe psql, cũng đúng đòn ⑤/④) và là lần thứ SÁU của
     * dự án trong họ "không chốt mốc trước khi đo".
     *
     * Quy tắc rút ra: đòn "nới X" chỉ có nghĩa khi bản chuẩn của agent đó ĐANG chặt về X.
     */
    const attempts: Array<[string, string, Record<string, unknown>]> = [
      // agent nền: bản chuẩn internal / [task.dictionary] / [taskcell:read,taskdict:read] / propose_only
      ['① nâng trần', 'inline.taskcell.draft', { maxDataClass: 'confidential' }],
      ['② thêm quyền', 'inline.taskcell.draft', { permissions: ['taskcell:read', 'payroll:export'] }],
      ['③ thêm nhóm dữ liệu', 'inline.taskcell.draft', { dataAssetCodes: ['task.dictionary', 'payroll.reward'] }],
      // bản chuẩn `goal.risk_alert` là read_only — mới có cái để nới
      ['④ nới HITL', 'goal.risk_alert', { hitlMode: 'propose_only' }],
    ];
    let blocked = 0;
    for (const [label, code, patch] of attempts) {
      const g = GLOBAL_AI_AGENTS.find((a) => a.code === code)!;
      // Nền dựng TỪ chính bản chuẩn ⇒ mọi chiều khác đều "bằng", chỉ chiều đang thử là nới.
      const base = {
        id: uuidv7(), tenantId: t2!.id, code,
        nameVi: 'x', purpose: 'x', ownerRole: g.owner, kind: g.kind,
        maxDataClass: g.maxDataClass, dataAssetCodes: g.assets,
        permissions: g.permissions, hitlMode: g.hitl, status: g.status,
      };
      await expect(owner.aiAgent.create({ data: { ...base, ...patch } as any }))
        .rejects.toThrow(/không được|tập con/);
      blocked += 1;
      void label;
    }
    expect(blocked).toBe(attempts.length);   // assert THỰC SỰ chạy đủ 4 lần

    // ⑤ tự bật: cần bản chuẩn đang `planned` — `review.summarizer` đúng trạng thái đó.
    await expect(owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId: t2!.id, code: 'review.summarizer',
        nameVi: 'x', purpose: 'x', ownerRole: 'B1', kind: 'business',
        maxDataClass: 'confidential', dataAssetCodes: ['review.result'],
        permissions: ['review:read'], hitlMode: 'read_only', status: 'active',
      } as any,
    })).rejects.toThrow(/không được tự BẬT/);

    // ĐỐI CHỨNG — siết vẫn phải QUA, nếu không là chặn oan (không phải an toàn hơn).
    const ok = await owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId: t2!.id, code: 'inline.taskcell.draft',
        nameVi: 'x', purpose: 'x', ownerRole: 'B1', kind: 'business',
        maxDataClass: 'public', dataAssetCodes: [], permissions: [],
        hitlMode: 'read_only', status: 'retired',
      } as any,
    });
    expect(ok.id).toBeTruthy();
    await owner.aiAgent.delete({ where: { id: ok.id } });
  });

  it('🔒 CHECK cấp lược đồ: KHÔNG giá trị hitl_mode nào cho phép AI ghi thẳng', async () => {
    const t2 = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });
    await expect(owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId: t2!.id, code: 'inline.taskcell.draft',
        nameVi: 'x', purpose: 'x', ownerRole: 'B1', kind: 'business',
        maxDataClass: 'internal', dataAssetCodes: [], permissions: [],
        hitlMode: 'write', status: 'planned',
      } as any,
    })).rejects.toThrow(/hitl_mode_check|constraint/i);
  });

  // ─────────────────────────── cô lập đơn vị ───────────────────────────

  it('🔒 RLS: đơn vị khác KHÔNG thấy bản siết riêng của H.01', async () => {
    // H.01 đã siết config_copilot xuống 'public'/'retired' ở ca trên.
    const h01 = await request(app.getHttpServer())
      .get('/api/v1/ai/agents/config_copilot').set(H(steward)).expect(200);
    expect(h01.body.scope).toBe('tenant');

    const t2 = await request(app.getHttpServer())
      .get('/api/v1/ai/agents/config_copilot').set(H(t2admin)).expect(200);
    // T2 phải thấy BẢN CHUẨN, không thấy bản siết của H.01
    expect(t2.body.scope).toBe('global');
    expect(t2.body.maxDataClass).toBe('internal');
    expect(t2.body.status).toBe('active');
  });
});
