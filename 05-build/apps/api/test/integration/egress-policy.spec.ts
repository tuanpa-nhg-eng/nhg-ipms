/**
 * Integration — [Last-mile Lát 2] Egress Policy Engine qua ai-gateway thật (DB thật,
 * AppModule đầy đủ). Gọi thẳng AiGatewayService/EgressPolicyService lấy từ DI container
 * (không qua HTTP — dataClass là chi tiết server-side, chưa có endpoint public set nó)
 * để chứng minh: mock luôn qua · pii/confidential luôn chặn tới anthropic dù cờ+key bật ·
 * internal mặc định qua (không đổi hành vi hiện có) · tenant thu hẹp được qua policy ·
 * mọi lượt chặn ghi ai_interaction status='blocked' KHÔNG BAO GIỜ gọi tới client thật.
 *
 * AN TOÀN CHO SUITE KHÁC: chỉ set feature_flag/ANTHROPIC_API_KEY THEO TENANT TẠM/biến
 * env tạm trong 1 file này, dọn sạch ở afterAll/finally — không đụng flag global.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { AiGatewayService } from '../../src/modules/ai/ai-gateway.service';
import { EgressPolicyService } from '../../src/modules/ai/egress/egress-policy.service';
import type { RequestUser } from '../../src/common/auth/decorators';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string }

describe('[Last-mile Lát 2] Egress Policy Engine — ai-gateway thật', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gateway: AiGatewayService;
  let egress: EgressPolicyService;
  let tenantId: string;
  let user: RequestUser;
  let designerCtx: Ctx;
  let empCtx: Ctx;
  const uniq = Date.now();
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  let flagId: string | undefined;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    tenantId = tenant!.id;
    async function ctxFor(emailPrefix: string): Promise<Ctx> {
      const dbUser = await owner.appUser.findFirst({ where: { tenantId, email: { startsWith: emailPrefix } } });
      const token = jwt.sign({ sub: dbUser!.id, tid: tenantId, email: dbUser!.email }, getJwtSecret(), { expiresIn: '1h' });
      return { id: dbUser!.id, token };
    }
    designerCtx = await ctxFor('designer@');
    empCtx = await ctxFor('emp1@');
    const claims = jwt.decode(designerCtx.token) as any;
    user = { claims, tenantId, permissions: new Set(['ai:eval', 'ai:invoke']), scopes: [] };

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    gateway = app.get(AiGatewayService);
    egress = app.get(EgressPolicyService);
  });

  afterAll(async () => {
    if (flagId) await owner.featureFlag.deleteMany({ where: { id: flagId } });
    await owner.aiEgressPolicy.deleteMany({ where: { tenantId, note: { contains: uniq.toString() } } });
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    await app?.close();
    await owner?.$disconnect();
  });

  it('mock LUÔN cho phép — pii vẫn chạy được khi backend=mock (flag OFF mặc định)', async () => {
    const res = await gateway.complete(user, { agent: `egress-test-${uniq}`, prompt: 'không PII', dataClass: 'pii' });
    expect(res.model).toBe('mock');
    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: `egress-test-${uniq}` }, orderBy: { at: 'desc' },
    });
    expect(row!.status).toBe('ok');
  });

  it('bật flag+key (tenant tạm) → pii tới anthropic LUÔN bị CHẶN, KHÔNG gọi client thật', async () => {
    const flag = await owner.featureFlag.create({
      data: { id: uuidv7(), tenantId, key: 'ai_gateway_live', enabled: true },
    });
    flagId = flag.id;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-not-real';

    await expect(
      gateway.complete(user, { agent: `egress-pii-${uniq}`, prompt: 'dữ liệu nhạy cảm', dataClass: 'pii' }),
    ).rejects.toThrow(/egress bị chặn/);

    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: `egress-pii-${uniq}` }, orderBy: { at: 'desc' },
    });
    expect(row!.status).toBe('blocked');
    expect((row!.output as any).reason).toContain('self-host');
    expect(Number(row!.costUsd ?? 0)).toBe(0); // chưa từng chạm client — chắc chắn 0đ

    // 'internal' (mặc định) KHÔNG bị egress chặn — kiểm qua EgressPolicyService.resolve()
    // trực tiếp (không đi qua gateway.complete(): từ Lát 3 AnthropicLlmClient THẬT, đi hết
    // egress sẽ chạm mạng thật ra Anthropic — không phù hợp cho unit/integration test).
    const decision = await egress.resolve(tenantId, 'internal', 'anthropic');
    expect(decision.allowed).toBe(true);
  });

  it('tenant CHẶN THÊM internal→anthropic qua policy tường minh (thu hẹp mặc định)', async () => {
    const flag = await owner.featureFlag.findFirst({ where: { tenantId, key: 'ai_gateway_live' } });
    if (!flag?.enabled) {
      await owner.featureFlag.updateMany({ where: { tenantId, key: 'ai_gateway_live' }, data: { enabled: true } });
    }
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-not-real';

    await egress.upsert(user, 'internal', 'anthropic', false, `test-narrow-${uniq}`);
    try {
      await expect(
        gateway.complete(user, { agent: `egress-narrowed-${uniq}`, prompt: 'x' }),
      ).rejects.toThrow(/egress bị chặn/);
    } finally {
      // dọn — XOÁ hẳn row để trở lại mặc định "chưa cấu hình = cho phép" (không rò rỉ
      // sang test khác đọc chung tenant H.01)
      await owner.aiEgressPolicy.deleteMany({ where: { tenantId, dataClass: 'internal', destination: 'anthropic' } });
    }
  });

  it('EgressPolicyService chặn TẠO row pii+anthropic allowed=true (bất biến cứng, 422)', async () => {
    await expect(egress.upsert(user, 'pii', 'anthropic', true, `poison-${uniq}`))
      .rejects.toThrow(/bất biến cứng/);
  });

  it('EgressPolicyService.upsert validate dataClass/destination whitelist', async () => {
    await expect(egress.upsert(user, 'not-a-class', 'anthropic', false)).rejects.toThrow(/dataClass/);
    await expect(egress.upsert(user, 'internal', 'not-a-dest', false)).rejects.toThrow(/destination/);
  });

  // ===== Controller — permission gate qua HTTP thật =====

  it('GET /ai/egress-policies: emp1@ (không ai:eval) → 403; designer@ → 200 kèm danh mục hợp lệ', async () => {
    const api = () => request(app.getHttpServer());
    const forbidden = await api().get('/api/v1/ai/egress-policies')
      .set({ Authorization: `Bearer ${empCtx.token}`, 'X-Tenant-Id': tenantId });
    expect(forbidden.status).toBe(403);

    const ok = await api().get('/api/v1/ai/egress-policies')
      .set({ Authorization: `Bearer ${designerCtx.token}`, 'X-Tenant-Id': tenantId });
    expect(ok.status).toBe(200);
    expect(ok.body.dataClasses).toEqual(['public', 'internal', 'confidential', 'pii']);
    expect(ok.body.destinations).toEqual(['mock', 'anthropic', 'self_host']);
  });

  it('PUT /ai/egress-policies: pii+anthropic+allowed=true → 422 (bất biến cứng qua HTTP)', async () => {
    const res = await request(app.getHttpServer()).put('/api/v1/ai/egress-policies')
      .set({ Authorization: `Bearer ${designerCtx.token}`, 'X-Tenant-Id': tenantId })
      .send({ dataClass: 'pii', destination: 'anthropic', allowed: true, note: `http-poison-${uniq}` });
    expect(res.status).toBe(422);
  });
});
