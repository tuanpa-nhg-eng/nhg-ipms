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
import { EconomicsService } from '../../src/modules/ai/economics/economics.service';

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
      agent: 'test.khong.he.ton.tai', prompt: 'x', dataAssets: ['objective.kpi'],
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
    const it1 = gateway.stream(user, { agent: 'test.khong.he.ton.tai', prompt: 'x', dataAssets: ['objective.kpi'] });
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

  // ═════════════ Vá theo Reviewer — F201 · F202/F209 · F203 · F204/F211 · F216 ═════════════

  it('🔒 [F201] nhánh chặn KHÔNG ghi prompt vào `ai_interaction`', async () => {
    /**
     * Ba cổng chạy TRƯỚC `pii.scrubRequest` có chủ đích — nên chúng là đường log DUY NHẤT
     * không đi qua scrub. Bản đầu của L1 truyền thẳng `req` THÔ vào `log()`, tức ghi prompt
     * chưa khử PII vào một bảng mà trigger chặn cả UPDATE lẫn DELETE: ghi rồi là ở lại.
     *
     * Nhánh này lại kích hoạt đúng lúc lượt gọi chạm dữ liệu TRÊN trần agent — tức đường rò
     * trùng với dữ liệu nhạy cảm nhất, không phải một nhánh hiếm.
     */
    const canary = `CCCD 079201234567 canary-${uniq}`;
    await expect(gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: canary, dataAssets: ['review.result'],
    })).rejects.toThrow();

    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: AGENT_INTERNAL, status: 'blocked' }, orderBy: { at: 'desc' },
    });
    expect(row).not.toBeNull();
    // Không chỉ "không chứa PII" — không chứa NỘI DUNG. Vết của một lượt bị chặn cần danh
    // tính + lý do, không cần thứ người ta định gửi đi.
    expect(JSON.stringify(row!.input)).not.toContain('canary');
    expect(JSON.stringify(row!.input)).not.toContain('079201234567');
    expect((row!.input as any).promptOmitted).toBe('gate-blocked');
    // ĐỐI CHỨNG: lý do vẫn tra được, nếu không thì "không ghi gì" cũng qua được ca này.
    expect(JSON.stringify(row!.output)).toMatch(/trần|N3/);
  });

  it('🔒 [F202/F209] CẢ BỐN nhánh chặn đều để lại vết `status=blocked`', async () => {
    /**
     * Kế hoạch trục D §Lát-1 yêu cầu tường minh: *"⇒ 422, không gọi client, ghi
     * `ai_interaction` `status='blocked'` kèm lý do đọc được"*. Bản đầu chỉ ghi cho nhánh
     * vượt-trần; ba nhánh còn lại ném câm ⇒ dò mã agent là hành vi không để lại dấu.
     *
     * Đo bằng ĐẾM TRƯỚC/SAU cho từng nhánh, không đếm tổng một lần — đếm tổng thì một nhánh
     * ghi hai dòng có thể che một nhánh ghi không dòng nào.
     */
    const countFor = async (agent: string) => owner.aiInteraction.count({
      where: { tenantId, agent, status: 'blocked' },
    });

    const branches: Array<{ ten: string; agent: string; call: () => Promise<unknown> }> = [
      {
        ten: 'N1 — agent lạ', agent: `test.khong.ton.tai.${uniq}`,
        call: () => gateway.complete(user, {
          agent: `test.khong.ton.tai.${uniq}`, prompt: 'p', dataAssets: ['objective.kpi'],
        }),
      },
      {
        ten: 'N1 — agent planned', agent: AGENT_PLANNED,
        call: () => gateway.complete(user, {
          agent: AGENT_PLANNED, prompt: 'p', dataAssets: ['objective.kpi'],
        }),
      },
      {
        ten: 'N2 — không khai dataAssets', agent: AGENT_INTERNAL,
        call: () => gateway.complete(user, { agent: AGENT_INTERNAL, prompt: 'p', dataAssets: [] }),
      },
      {
        ten: 'N3 — ngoài phạm vi hiến chương', agent: AGENT_CONFIDENTIAL,
        call: () => gateway.complete(user, {
          agent: AGENT_CONFIDENTIAL, prompt: 'p', dataAssets: ['task.dictionary'],
        }),
      },
    ];

    expect(branches.length).toBe(4);   // chống assert chạy 0 lần
    for (const b of branches) {
      const before = await countFor(b.agent);
      await expect(b.call()).rejects.toThrow();
      const after = await countFor(b.agent);
      expect({ nhanh: b.ten, them: after - before }).toEqual({ nhanh: b.ten, them: 1 });
    }
  });

  it('🔒 [F203] N6 chặn TRỰC TIẾP, không nhờ trần agent — và không agent nào đặt được trần `restricted`', async () => {
    /**
     * Trước bản vá, N6 đúng chỉ NHỜ MỘT SỰ TÌNH CỜ: chưa ai khai trần `restricted`. Nhưng
     * `ai_agent_max_data_class_check` CHO PHÉP giá trị đó trong khi
     * `ai_interaction_no_restricted_check` lại CẤM — hai DDL nói ngược nhau, cây cầu duy nhất
     * là một unit test trên dữ liệu seed mà `registerTestAgent()` (ghi bằng owner) đi vòng qua.
     *
     * Ca này kiểm cả hai tầng mới: cổng phát biểu N6, và CHECK không cho đúc agent như thế.
     */
    // ① Agent trần confidential, hiến chương CÓ nhóm restricted ⇒ vẫn chặn vì N6, không vì trần
    const code = await registerTestAgent(owner, {
      name: 'n6.direct', uniq, maxDataClass: 'confidential', assets: ['payroll.reward'],
    });
    try {
      await expect(gateway.complete(user, {
        agent: code, prompt: 'p', dataAssets: ['payroll.reward'],
      })).rejects.toThrow(/N6/);
    } finally {
      await cleanupTestAgents(owner, [code]);
    }

    // ② Không đúc được agent trần `restricted` — kiểm bằng owner (BỎ QUA RLS) để chắc chắn
    //    chặn nằm ở tầng CHECK thật, không phải ở tầng ứng dụng.
    await expect(owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId: null, code: `test.n6.ceiling.${uniq}`,
        nameVi: '[TEST] trần restricted', purpose: 'phải bị CHECK chặn',
        ownerRole: 'B3', kind: 'infrastructure', maxDataClass: 'restricted',
        dataAssetCodes: ['objective.kpi'], permissions: [], hitlMode: 'read_only', status: 'active',
      },
    })).rejects.toThrow(/ceiling_not_restricted|constraint/i);
  });

  it('🔒 [F204/F211/F216] `dataAssets` trùng lặp không nhân số lượt tra sổ; phần tử dị dạng ⇒ chặn', async () => {
    /**
     * ① Trùng lặp qua được kiểm hiến chương (mọi bản sao đều hợp lệ), nên không dedup nghĩa
     *    là NGƯỜI GỌI quyết định số transaction của một lượt gọi.
     * ② Cắt gọt im lặng phần tử dị dạng là fail-open có điều kiện: hệ thống suy mức từ phần
     *    sống sót rồi cho đi, trong khi thứ bị bỏ mới là thứ nhạy cảm.
     */
    // ① 200 bản sao vẫn chạy, và ghi đúng MỘT mã trong `data_assets` (bằng chứng đã dedup)
    const res = await gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'p', dataAssets: Array(200).fill('objective.kpi'),
    });
    expect(res.model).toBe('mock');
    const row = await owner.aiInteraction.findFirst({
      where: { tenantId, agent: AGENT_INTERNAL, status: 'ok' }, orderBy: { at: 'desc' },
    });
    expect(row!.dataAssets).toEqual(['objective.kpi']);

    // ② phần tử không phải chuỗi ⇒ chặn, KHÔNG chạy với phần còn lại
    await expect(gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'p',
      dataAssets: [{ code: 'objective.kpi' } as any, 'objective.kpi'],
    })).rejects.toThrow(/không phải mã hợp lệ/);

    // ③ [F216] chuỗi rỗng/khoảng trắng là dị dạng — cùng một lỗi khai phải cho cùng một lỗi
    await expect(gateway.complete(user, {
      agent: AGENT_INTERNAL, prompt: 'p', dataAssets: ['   '],
    })).rejects.toThrow(/không phải mã hợp lệ/);
  });

  // ═══════ F219 — đóng đinh hai ngữ nghĩa báo cáo mà chủ dự án chốt 06/08 ═══════

  it('🔒 [F217] xoá mềm một agent KHÔNG xoá được chi phí lịch sử của nó khỏi "đã chi"', async () => {
    /**
     * Trước bản vá, `report()` lọc `deletedAt: null` ⇒ xoá mềm một agent làm mọi lượt gọi lịch
     * sử của nó biến khỏi báo cáo 30 ngày. Một thao tác quản trị viết lại quá khứ theo chiều
     * GIẢM, trên dữ liệu vốn append-only — cùng họ "số trông-như-thật" mà L1 vừa vá, chỉ đổi
     * chiều (trước là agent bịa cộng thêm, sau là xoá mềm trừ bớt).
     *
     * Chủ dự án chốt: "đã chi" giữ MỌI agent từng đăng ký; "run-rate" chỉ agent đang hoạt động.
     *
     * ⚠️ Ca này đo bằng SỰ CÓ MẶT và các cờ, KHÔNG bơm `costUsd` — RED-LINE "tổng chi phí AI
     * thật = 0" được driver sống kiểm, và `ai_interaction` là append-only nên một dòng chi phí
     * giả sẽ làm hỏng phép đo đó VĨNH VIỄN.
     */
    const econ = app.get(EconomicsService);
    const code = await registerTestAgent(owner, { name: 'f217.softdelete', uniq });
    try {
      await gateway.complete(user, { agent: code, prompt: 'p', dataAssets: ['objective.kpi'] });

      const truoc: any = await econ.report(user);
      const eTruoc = truoc.agents.find((a: any) => a.agent === code);
      expect(eTruoc).toBeDefined();
      expect(eTruoc.countsTowardRunRate).toBe(true);
      expect(eTruoc.registryStatus).toBe('active');
      const soLuot = eTruoc.calls;
      expect(soLuot).toBeGreaterThan(0);

      // xoá mềm — đúng đường mà một quản trị viên sẽ đi
      await owner.aiAgent.updateMany({ where: { code }, data: { deletedAt: new Date() } });

      const sau: any = await econ.report(user);
      const eSau = sau.agents.find((a: any) => a.agent === code);
      // ① Lịch sử KHÔNG biến mất, và không hụt đi một lượt nào
      expect(eSau).toBeDefined();
      expect(eSau.calls).toBe(soLuot);
      expect(eSau.registryStatus).toBe('da_xoa_mem');
      // ② Nhưng không còn kéo theo chiếu tương lai
      expect(eSau.countsTowardRunRate).toBe(false);
      expect(eSau.projections).toEqual([]);
      // ③ Và hai tổng nói đúng hai câu chuyện khác nhau
      expect(sau.totalActualCostUsd).toBeGreaterThanOrEqual(sau.totalRunRateCostUsd);
    } finally {
      await owner.aiAgent.deleteMany({ where: { code } });
    }
  });

  it('🔒 [F218] agent `planned` ĐẠT BAR vẫn KHÔNG BAO GIỜ `ready: true`', async () => {
    /**
     * Ca này chỉ có nghĩa nếu agent THỰC SỰ đạt ngưỡng chất lượng — nếu nó trượt bar thì
     * `ready === false` đúng vì một lý do khác, và phép đo không nói được gì về F218. Nên
     * dựng đủ: launch bar dễ + eval suite + một run `done` toàn pass.
     */
    const evalSvc = app.get(EvalService);
    const code = await registerTestAgent(owner, {
      name: 'f218.planned', uniq, status: 'planned',
    });
    const barId = uuidv7();
    const suiteId = uuidv7();
    try {
      await owner.aiLaunchBar.create({
        data: { id: barId, tenantId, agent: code, minPassRate: '0.5', minCases: 1 },
      });
      await owner.aiEvalSuite.create({
        data: { id: suiteId, tenantId, agent: code, name: `f218-${uniq}` },
      });
      await owner.aiEvalRun.create({
        data: {
          id: uuidv7(), tenantId, suiteId, status: 'done', model: 'mock',
          finishedAt: new Date(), summary: { pass: 5, fail: 0, avg_score: 1 } as any,
        },
      });

      const rd: any = await evalSvc.readiness({ ...user, permissions: new Set(['ai:eval']) });
      const e = rd.agents.find((a: any) => a.agent === code);
      expect(e).toBeDefined();                 // HIỆN, không ẩn — quyết định 06/08
      expect(e.registryStatus).toBe('planned');
      expect(e.meetsBar).toBe(true);           // ĐẠT ngưỡng chất lượng…
      expect(e.ready).toBe(false);             // …nhưng KHÔNG sẵn sàng chạy
      expect(e.liveQualified).toBe(false);
      expect(e.reasons.join(' ')).toMatch(/chưa được bật|planned/);
    } finally {
      await owner.aiEvalRun.deleteMany({ where: { suiteId } });
      await owner.aiEvalSuite.deleteMany({ where: { id: suiteId } });
      await owner.aiLaunchBar.deleteMany({ where: { id: barId } });
      await cleanupTestAgents(owner, [code]);
    }
  });

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
