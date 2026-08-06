/**
 * Integration [Trục D L1] TRẦN PHÂN LOẠI THUỘC VỀ AGENT — N1 · N2 · N3.
 *
 * Đây là lát quan trọng nhất của trục D, và nó đóng đúng một dòng:
 *
 *     ai-gateway.service.ts:56   const dataClass = scrubbedReq.dataClass ?? 'internal';
 *
 * Hai lỗ trong một dòng: ① người gọi TỰ KHAI mức nhạy cảm của chính dữ liệu mình đẩy vào LLM
 * ② quên khai thì mặc định là mức CHO PHÉP ĐI. Sau lát này, mức SUY RA từ sổ đăng ký dữ liệu
 * (trục C L0) và không khai được thì không chạy.
 *
 * Ca đối chứng nằm rải trong file: mỗi ca chặn đều có một ca cho-qua kề bên, vì "siết" mà
 * không chứng minh "không siết oan" thì chỉ là làm hỏng tính năng một cách có kỷ luật.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { AiGatewayService } from '../../src/modules/ai/ai-gateway.service';
import type { RequestUser } from '../../src/common/auth/decorators';
import { registerTestAgent, cleanupTestAgents } from '../helpers/test-agent';
import { EvalService } from '../../src/modules/ai/eval/eval.service';

jest.setTimeout(180_000);

describe('[Trục D L1] Trần phân loại thuộc về agent — N1/N2/N3', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let gateway: AiGatewayService;
  let tenantId: string;
  let user: RequestUser;
  const uniq = Date.now();

  let AGENT_INTERNAL: string;    // trần internal, phạm vi [objective.kpi, task.dictionary]
  let AGENT_CONFIDENTIAL: string; // trần confidential, phạm vi [review.result]
  let AGENT_PLANNED: string;      // đăng ký nhưng CHƯA bật

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    tenantId = tenant!.id;
    const dbUser = await owner.appUser.findFirst({ where: { tenantId, email: { startsWith: 'designer@' } } });
    const token = jwt.sign({ sub: dbUser!.id, tid: tenantId, email: dbUser!.email }, getJwtSecret(), { expiresIn: '1h' });
    user = { claims: jwt.decode(token) as any, tenantId, permissions: new Set(['ai:invoke', 'ai:eval']), scopes: [] };

    AGENT_INTERNAL = await registerTestAgent(owner, {
      name: 'ceiling.internal', uniq,
      maxDataClass: 'internal', assets: ['objective.kpi', 'task.dictionary'],
    });
    AGENT_CONFIDENTIAL = await registerTestAgent(owner, {
      name: 'ceiling.conf', uniq,
      maxDataClass: 'confidential', assets: ['review.result'],
    });
    AGENT_PLANNED = await registerTestAgent(owner, {
      name: 'ceiling.planned', uniq,
      maxDataClass: 'internal', assets: ['objective.kpi'], status: 'planned',
    });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    gateway = app.get(AiGatewayService);
  });

  afterAll(async () => {
    await cleanupTestAgents(owner, [AGENT_INTERNAL, AGENT_CONFIDENTIAL, AGENT_PLANNED]);
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════════════════════ N1 — agent phải có danh tính ═══════════════════════════

  it('[N1] agent KHÔNG có trong danh bạ ⇒ chặn, không gọi client', async () => {
    await expect(gateway.complete(user, {
      agent: 'khong.he.ton.tai', prompt: 'x', dataAssets: ['objective.kpi'],
    })).rejects.toThrow(/chưa đăng ký trong danh bạ/);
  });

  it('[N1] agent đã đăng ký nhưng đang `planned` ⇒ chặn — bật agent là quyết định, không phải hệ quả của việc có người gọi', async () => {
    await expect(gateway.complete(user, {
      agent: AGENT_PLANNED, prompt: 'x', dataAssets: ['objective.kpi'],
    })).rejects.toThrow(/trạng thái 'planned'/);
  });

  it('[N1 — ĐỐI CHỨNG] agent `active` chạy bình thường', async () => {
    const res = await gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'x', dataAssets: ['objective.kpi'],
    });
    expect(res.model).toBe('mock');
  });

  // ═══════════════════════ N2 — mức SUY RA, không do người gọi khai ═══════════════════

  it('[N2] không khai `dataAssets` ⇒ CHẶN (trước lát này: mặc định `internal` = cho phép đi)', async () => {
    await expect(gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'x', dataAssets: [],
    })).rejects.toThrow(/không khai nhóm dữ liệu nào/);
  });

  it('[N2] khai mã dữ liệu KHÔNG có trong sổ đăng ký ⇒ chặn (fail-closed, không mặc định)', async () => {
    // Mã nằm trong hiến chương agent nhưng KHÔNG có trong `data_asset` là trạng thái bất
    // thường (ai đó xoá một nhóm khỏi sổ). Phải nổ, không được im lặng coi như 'internal'.
    const code = await registerTestAgent(owner, {
      name: 'ceiling.ghost', uniq, assets: ['nhom.khong.ton.tai'],
    });
    try {
      await expect(gateway.complete(user, {
        agent: code, prompt: 'x', dataAssets: ['nhom.khong.ton.tai'],
      })).rejects.toThrow(/chưa đăng ký trong sổ/);
    } finally {
      await cleanupTestAgents(owner, [code]);
    }
  });

  it('[N2] mức = MAX rank của các nhóm chạm tới, và được GHI LẠI vào ai_interaction', async () => {
    // `review.result` = confidential; agent trần confidential nên qua được.
    await gateway.complete(user, {
      agent: AGENT_CONFIDENTIAL, prompt: 'x', dataAssets: ['review.result'],
    });
    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: AGENT_CONFIDENTIAL }, orderBy: { at: 'desc' },
    });
    // Spec_AI_Assistant §211 khai hai trường này từ đầu — tới trục D mới có cột.
    expect(row!.dataClass).toBe('confidential');
    expect(row!.dataAssets).toEqual(['review.result']);
  });

  it('[N2] mức là KẾT QUẢ SUY DIỄN — người gọi không có đường nào khai đè', async () => {
    /**
     * Ca này đóng đinh chính bản chất của lát. Trước đây `dataClass` là một field của
     * `LlmRequest`; nay nó KHÔNG còn tồn tại trong hợp đồng. Gửi kèm cũng vô hại — TypeScript
     * đã chặn ở biên dịch, và ở runtime gateway không đọc field đó nữa.
     */
    await gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'x', dataAssets: ['objective.kpi'],
      // @ts-expect-error — `dataClass` đã bị gỡ khỏi LlmRequest ở trục D L1 (đây LÀ phép kiểm)
      dataClass: 'public',
    });
    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: AGENT_INTERNAL }, orderBy: { at: 'desc' },
    });
    // 'internal' (suy từ objective.kpi), KHÔNG phải 'public' như lời khai bị bỏ qua
    expect(row!.dataClass).toBe('internal');
  });

  // ═══════════════════════════ N3 — trần + phạm vi của agent ═════════════════════════

  it('[N3] agent trần `internal` chạm dữ liệu `confidential` ⇒ CHẶN, kể cả khi đích là mock', async () => {
    /**
     * Quan trọng: đích ở đây là MOCK (không rời máy), và Egress Policy cho mock qua VÔ ĐIỀU
     * KIỆN. Nếu ca này vẫn bị chặn thì chứng minh được N3 là lớp ĐỘC LẬP với egress — vi phạm
     * hiến chương agent, không phải vi phạm egress. Gộp hai lớp là mất đúng lớp này.
     */
    const code = await registerTestAgent(owner, {
      name: 'ceiling.overreach', uniq,
      maxDataClass: 'internal', assets: ['objective.kpi', 'review.result'],
    });
    try {
      await expect(gateway.complete(user, {
        agent: code, prompt: 'x', dataAssets: ['review.result'],
      })).rejects.toThrow(/có trần 'internal' nhưng lượt gọi chạm dữ liệu mức 'confidential'/);
    } finally {
      await cleanupTestAgents(owner, [code]);
    }
  });

  it('[N3] nhóm dữ liệu NGOÀI hiến chương agent ⇒ chặn (kiểm chéo phạm vi)', async () => {
    await expect(gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'x', dataAssets: ['review.result'],
    })).rejects.toThrow(/không được phép chạm nhóm dữ liệu review\.result/);
  });

  it('[N3 — ĐỐI CHỨNG] agent trần confidential chạm confidential trong phạm vi ⇒ QUA', async () => {
    const res = await gateway.complete(user, {
      agent: AGENT_CONFIDENTIAL, prompt: 'x', dataAssets: ['review.result'],
    });
    expect(res.model).toBe('mock');
  });

  it('[N3] mức lấy MAX — một nhóm nhẹ + một nhóm nặng vẫn ra nặng', async () => {
    const code = await registerTestAgent(owner, {
      name: 'ceiling.mixed', uniq,
      maxDataClass: 'internal', assets: ['objective.kpi', 'review.result'],
    });
    try {
      // objective.kpi = internal (qua trần), review.result = confidential (vượt trần).
      // Nếu gateway lấy nhóm ĐẦU TIÊN thay vì MAX thì ca này lọt — đó là lý do nó tồn tại.
      await expect(gateway.complete(user, {
        agent: code, prompt: 'x', dataAssets: ['objective.kpi', 'review.result'],
      })).rejects.toThrow(/mức 'confidential'/);
    } finally {
      await cleanupTestAgents(owner, [code]);
    }
  });

  // ═════════════════════════ đường STREAM không phải cửa sau ═════════════════════════

  it('🔒 đường STREAM đi qua ĐÚNG ba cổng như complete()', async () => {
    /**
     * Bài học `POST /ai/chat` của trục C: một đường chạy không qua cổng là đủ để vô hiệu cổng.
     * `stream()` là đường của Copilot — đường mà người dùng thật đi nhiều nhất.
     */
    const it1 = gateway.stream(user, { agent: 'khong.he.ton.tai', prompt: 'x', dataAssets: ['objective.kpi'] });
    await expect((async () => { for await (const _ of it1) { /* drain */ } })())
      .rejects.toThrow(/chưa đăng ký trong danh bạ/);

    const it2 = gateway.stream(user, { agent: AGENT_INTERNAL, prompt: 'x', dataAssets: ['review.result'] });
    await expect((async () => { for await (const _ of it2) { /* drain */ } })())
      .rejects.toThrow(/không được phép chạm nhóm dữ liệu/);

    // ĐỐI CHỨNG — stream hợp lệ vẫn chạy
    const chunks = [];
    for await (const c of gateway.stream(user, { agent: AGENT_INTERNAL, prompt: 'x', dataAssets: ['objective.kpi'] })) {
      chunks.push(c);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });

  // ════════ danh bạ là bộ lọc cho MỌI nguồn agent, không chỉ nguồn thuận tay ════════

  it('🐞 [hồi quy] checklist sẵn-sàng-live lọc agent theo danh bạ ở CẢ HAI nguồn (bar + suite)', async () => {
    /**
     * Ca này sinh ra từ một lỗ trong CHÍNH bản vá của tôi ở L1.
     *
     * `readiness()` dựng danh sách agent bằng HỢP của hai tập: `ai_launch_bar` và
     * `ai_eval_suite`. Bản vá đầu chỉ lọc `suites` theo danh bạ và để nguyên `bars` ⇒ agent
     * test cũ vẫn hiện qua đường launch bar. **Full suite jest XANH ngay sau bản vá thiếu
     * đó**; chỉ driver sống trên API thật mới lộ.
     *
     * Mẫu đáng nhớ: LỌC MỘT NGUỒN TRONG KHI KẾT QUẢ GỘP TỪ NHIỀU NGUỒN. Test này đóng đinh
     * đúng nhánh `bars` — dựng một launch bar cho agent KHÔNG có trong danh bạ rồi đòi
     * checklist không nhắc tới nó.
     */
    const ghostAgent = `test.readiness.ghost.${uniq}`;   // CỐ Ý không đăng ký trong danh bạ
    const bar = await owner.aiLaunchBar.create({
      data: { id: uuidv7(), tenantId, agent: ghostAgent, minPassRate: '0.9', minCases: 1 },
    });
    try {
      const evalSvc = app.get(EvalService);
      const rd = await evalSvc.readiness({ ...user, permissions: new Set(['ai:eval']) });
      const codes = (rd.agents ?? []).map((a: any) => a.agent);
      expect(codes.length).toBeGreaterThan(0);        // chống assert chạy 0 lần
      expect(codes).not.toContain(ghostAgent);
    } finally {
      await owner.aiLaunchBar.delete({ where: { id: bar.id } });
    }
  });

  // ═════════════════════ N6 — restricted không bao giờ vào lớp AI ════════════════════

  it('🔒 [N6] KHÔNG lượt gọi nào ghi được `data_class = restricted` — chặn ở CẢ DDL', async () => {
    /**
     * Ba tầng cùng giữ một bất biến, có chủ đích:
     *   ① danh bạ: unit test cấm agent khai trần `restricted`
     *   ② gateway: agent trần cao nhất là confidential ⇒ không lượt nào đạt mức restricted
     *   ③ DDL: CHECK `ai_interaction_no_restricted_check` — nếu ① và ② cùng hở, ghi vẫn nổ
     * Ca này kiểm tầng ③, tầng duy nhất không phụ thuộc mã ứng dụng.
     */
    await expect(owner.$executeRawUnsafe(
      `INSERT INTO ai_interaction (tenant_id, agent, status, data_class)
       VALUES ('${tenantId}'::uuid, 'probe.restricted', 'ok', 'restricted')`,
    )).rejects.toThrow(/no_restricted_check|constraint/i);
  });
});
