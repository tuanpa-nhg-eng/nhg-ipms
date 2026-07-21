/**
 * Integration — [Last-mile Lát 3] Toàn mạch gateway thật với AnthropicLlmClient THẬT
 * (transport override bằng fake qua Nest DI — KHÔNG mạng, không key thật) chứng minh:
 * scrub (Lát 1) → egress (Lát 2) → client thật → costUsd tính đúng theo ai_model_price
 * (F167 tenant thắng global) → rehydrate đúng cho caller. Đây là bằng chứng "lật cờ
 * ai_gateway_live + key thật thì mạch đã đúng", không phải gọi Anthropic thật.
 *
 * DÙNG TENANT T2.TEST (không phải H.01): `ai_interaction` APPEND-ONLY (trigger chặn
 * UPDATE/DELETE kể cả owner — đã tự kiểm bằng va chạm thật khi soạn test này), nên
 * costUsd > 0 do test tạo ra là VĨNH VIỄN, không xoá được. Nhiều suite khác assert
 * "tổng costUsd toàn tenant H.01 = 0" (RED-LINE — ai-gateway.spec.ts, ai-economics.spec.ts,
 * inline-assist.spec.ts) — CHỈ ĐÚNG vì không suite nào khác bật backend=anthropic cho
 * H.01. Test NÀY cần costUsd thật để chứng minh Lát 3 → phải ở tenant riêng.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { AiGatewayService } from '../../src/modules/ai/ai-gateway.service';
import { AnthropicLlmClient, AnthropicStreamEvent } from '../../src/modules/ai/llm/anthropic-llm-client';
import type { RequestUser } from '../../src/common/auth/decorators';

jest.setTimeout(120_000);

function fakeTransport(events: AnthropicStreamEvent[]) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    transport: {
      messages: {
        async *stream(params: Record<string, unknown>) {
          calls.push(params);
          for (const e of events) yield e;
        },
      },
    },
  };
}

describe('[Last-mile Lát 3] AnthropicLlmClient thật qua toàn mạch gateway (transport giả)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gateway: AiGatewayService;
  let tenantId: string;
  let user: RequestUser;
  const uniq = Date.now();
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  let flagId: string | undefined;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const tenant = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });
    tenantId = tenant!.id;
    const dbUser = await owner.appUser.findFirst({ where: { tenantId, email: { startsWith: 'designer@' } } });
    const token = jwt.sign({ sub: dbUser!.id, tid: tenantId, email: dbUser!.email }, getJwtSecret(), { expiresIn: '1h' });
    user = { claims: jwt.decode(token) as any, tenantId, permissions: new Set(['ai:eval']), scopes: [] };

    const flag = await owner.featureFlag.create({ data: { id: uuidv7(), tenantId, key: 'ai_gateway_live', enabled: true } });
    flagId = flag.id;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-not-real'; // chỉ để hasApiKey=true; transport bị override, không dùng key này
  });

  afterAll(async () => {
    if (flagId) await owner.featureFlag.deleteMany({ where: { id: flagId } });
    // ai_interaction append-only — KHÔNG xoá được các row costUsd>0 vừa tạo (đúng chủ
    // đích thiết kế audit log). Tenant T2.TEST được chọn CHÍNH VÌ lý do này — không
    // suite nào khác assert "tổng cost T2 = 0" (chỉ H.01 có bất biến đó).
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    await app?.close();
    await owner?.$disconnect();
  });

  it('complete(): scrub PII trước khi transport thấy prompt, costUsd tính THẬT theo ai_model_price, rehydrate đúng cho caller', async () => {
    const { transport, calls } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 100 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Đã nhận: ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '[[PII:email:1]]' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 200 } },
      { type: 'message_stop' },
    ]);

    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnthropicLlmClient).useValue(AnthropicLlmClient.withTransport(transport))
      .compile();
    app = mod.createNestApplication();
    await app.init();
    gateway = app.get(AiGatewayService);

    const email = `khach.hang.${uniq}@nhg.edu.vn`;
    const res = await gateway.complete(
      user,
      { agent: `anthropic-live-${uniq}`, prompt: `Liên hệ ${email} để duyệt`, dataClass: 'internal' },
      `test.anthropic.${uniq}`,
    );

    // Transport (đại diện Anthropic thật) KHÔNG BAO GIỜ thấy email gốc
    const sentContent = (calls[0].messages as Array<{ content: string }>)[0].content;
    expect(sentContent).not.toContain(email);
    expect(sentContent).toContain('[[PII:email:1]]');

    // Caller nội bộ nhận lại giá trị THẬT (nghịch)
    expect(res.text).toBe(`Đã nhận: ${email}`);
    expect(res.model).toBe('claude-opus-4-8');
    expect(res.tokensIn).toBe(100);
    expect(res.tokensOut).toBe(200);

    // costUsd tính THẬT theo ai_model_price (không còn 0 placeholder của client)
    const price = await owner.aiModelPrice.findFirst({ where: { model: 'claude-opus-4-8', tenantId: null, deletedAt: null } });
    const expectedCost = Number(((100 / 1_000_000) * Number(price!.inputUsdPerMTok) + (200 / 1_000_000) * Number(price!.outputUsdPerMTok)).toFixed(6));
    expect(res.costUsd).toBe(expectedCost);
    expect(res.costUsd).toBeGreaterThan(0);

    // ai_interaction: audit log giữ bản ĐÃ SCRUB (không email gốc) + costUsd đúng + piiScrubbed đếm
    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: `anthropic-live-${uniq}` }, orderBy: { at: 'desc' },
    });
    expect(row!.status).toBe('ok');
    expect(row!.model).toBe('claude-opus-4-8');
    expect(Number(row!.costUsd)).toBe(expectedCost);
    expect(JSON.stringify(row!.input)).not.toContain(email);
    expect((row!.input as any).piiScrubbed.email).toBe(1);
  });

  it('stream(): cost thật ghi vào ai_interaction (chunk done vẫn placeholder — không ai đọc costUsd từ chunk)', async () => {
    const { transport } = fakeTransport([
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: {}, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ]);
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnthropicLlmClient).useValue(AnthropicLlmClient.withTransport(transport))
      .compile();
    const streamApp = mod.createNestApplication();
    await streamApp.init();
    const streamGateway = streamApp.get(AiGatewayService);
    try {
      const chunks = [];
      for await (const c of streamGateway.stream(user, { agent: `anthropic-stream-${uniq}`, prompt: 'x' }, `test.stream.${uniq}`)) {
        chunks.push(c);
      }
      const done = chunks.find((c) => c.type === 'done');
      expect(done?.usage?.costUsd).toBe(0); // placeholder — chunk KHÔNG mang giá thật

      const row = await owner.aiInteraction.findFirst({
        where: { tenantId, agent: `anthropic-stream-${uniq}` }, orderBy: { at: 'desc' },
      });
      const price = await owner.aiModelPrice.findFirst({ where: { model: 'claude-opus-4-8', tenantId: null, deletedAt: null } });
      const expectedCost = Number(((10 / 1_000_000) * Number(price!.inputUsdPerMTok) + (5 / 1_000_000) * Number(price!.outputUsdPerMTok)).toFixed(6));
      expect(Number(row!.costUsd)).toBe(expectedCost); // ai_interaction (nguồn báo cáo) có giá THẬT
      expect(Number(row!.costUsd)).toBeGreaterThan(0);
    } finally {
      await streamApp.close();
    }
  });
});
