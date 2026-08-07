/**
 * Integration [Trục D L2] QUYỀN HỮU HIỆU CỦA AGENT — N4 · N8.
 *
 * Trước lát này agent **mượn trọn quyền người gọi**: `admin@` hỏi Copilot thì Copilot có mọi
 * quyền của `admin@`. Hiến chương trong danh bạ chỉ là chữ — nó MÔ TẢ agent mà không RÀNG BUỘC
 * agent. Lát này làm nó có răng: quyền hữu hiệu = quyền người gọi ∩ hiến chương.
 *
 * ═══ Phép GIAO cắt theo CẢ HAI chiều, và cổng ra đòi chứng minh cả hai
 *
 *   ① người gọi RỘNG + hiến chương HẸP  ⇒ lấy theo HIẾN CHƯƠNG
 *      (`admin@` không biến agent tra Từ điển thành công cụ vạn năng)
 *   ② người gọi HẸP + hiến chương RỘNG  ⇒ lấy theo NGƯỜI GỌI
 *      (agent không phải cửa sau để `emp1@` đọc thứ chính mình không được đọc)
 *
 * Chiều ② quan trọng không kém chiều ①: một lát siết mà chỉ chứng minh chiều ① thì vẫn có thể
 * đã mở toang chiều kia mà không ai thấy.
 *
 * ═══ Ba đường gọi — và một sự thật phải ghi ra, không giấu
 *
 * Kế hoạch đòi "2 chiều × 3 đường = 6 ca". Đo thì thấy **Copilot chat KHÔNG đọc dữ liệu phía
 * máy chủ**: ngữ cảnh do FE gửi lên trong body (`ai-chat.service.ts` chỉ chuyển tiếp), nên
 * đường đó hôm nay KHÔNG có hành vi cần quyền để mà cắt. Viết một ca "chứng minh" cho nó sẽ
 * là ca xanh không đo gì cả — đúng loại số trông-như-thật mà dự án cấm. Ghi nhận ở đây, và
 * ca `[đường 3]` bên dưới đóng đinh chính SỰ THẬT đó để nếu ngày nào Copilot bắt đầu đọc dữ
 * liệu phía máy chủ thì ca này đỏ và người sửa biết phải thêm cổng.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { effectiveAgentPermissions, missingForAgent } from '@ipms/shared';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { McpService } from '../../src/modules/ai/mcp/mcp.service';
import { AiAgentService } from '../../src/modules/ai/agents/ai-agent.service';
import type { RequestUser } from '../../src/common/auth/decorators';

jest.setTimeout(180_000);

describe('[Trục D L2] Quyền hữu hiệu của agent — N4/N8', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let mcp: McpService;
  let agents: AiAgentService;
  let tenantId: string;
  let sub: string;

  /** Người gọi giả lập với đúng tập quyền muốn kiểm — không mượn persona seed để khỏi phụ
   *  thuộc catalog role đổi theo lát khác (bài học "không chốt mốc trước khi đo"). */
  const asUser = (perms: string[]): RequestUser => ({
    claims: { sub } as any, tenantId, permissions: new Set(perms), scopes: [],
  });

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    tenantId = tenant!.id;
    const dbUser = await owner.appUser.findFirst({ where: { tenantId, email: { startsWith: 'designer@' } } });
    sub = dbUser!.id;
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    mcp = app.get(McpService);
    agents = app.get(AiAgentService);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
  });

  // ═════════════════ Hàm thuần — nền của cả hai chiều ═════════════════

  it('[N4] `effectiveAgentPermissions` là phép GIAO — cắt cả hai chiều', () => {
    // ① người gọi rộng, hiến chương hẹp ⇒ theo hiến chương
    expect([...effectiveAgentPermissions(['a', 'b', 'c'], ['a'])]).toEqual(['a']);
    // ② người gọi hẹp, hiến chương rộng ⇒ theo người gọi
    expect([...effectiveAgentPermissions(['a'], ['a', 'b', 'c'])]).toEqual(['a']);
    // không giao ⇒ rỗng, không "mặc định cho qua"
    expect([...effectiveAgentPermissions(['x'], ['y'])]).toEqual([]);
  });

  it('[N4] `missingForAgent` phân biệt THIẾU VÌ NGƯỜI GỌI với THIẾU VÌ HIẾN CHƯƠNG', () => {
    /**
     * Hai nguyên nhân khác hẳn nhau và cách xử lý cũng khác: xin quyền cho người dùng, hay
     * mở rộng hiến chương agent (quyết định của chủ dữ liệu). Một thông điệp gộp chung sẽ
     * đẩy người dùng đi xin sai cửa.
     */
    const r = missingForAgent(['org:read', 'kpi:read'], ['org:read'], ['kpi:read']);
    expect(r.missing).toEqual(['kpi:read', 'org:read']);
    expect(r.doNguoiGoi).toEqual(['kpi:read']);      // người gọi không có
    expect(r.doHienChuong).toEqual(['org:read']);    // có, nhưng hiến chương không cho
  });

  // ═════════════════ Đường 1 — MCP tool (đường DUY NHẤT thực thi quyền phía máy chủ) ═════

  it('[đường 1 · chiều ①] người gọi quyền RỘNG NHẤT vẫn không vượt được hiến chương agent', async () => {
    const agent = await agents.resolve(tenantId, 'mcp');
    // Chọn một quyền mà hiến chương `mcp` KHÔNG khai, rồi cấp nó cho người gọi
    const ngoaiHienChuong = 'review:read';
    expect(agent.permissions).not.toContain(ngoaiHienChuong);

    // Người gọi "vạn năng": có MỌI quyền tool đòi + quyền ngoài hiến chương
    const superUser = asUser([...agent.permissions, ngoaiHienChuong, 'ai:invoke']);
    // Tool hợp lệ vẫn chạy — ĐỐI CHỨNG, chứng minh không chặn oan
    const ok = await mcp.invoke(superUser, 'ipms.get_org', {});
    expect(ok.tool).toBe('ipms.get_org');

    // Còn quyền ngoài hiến chương thì KHÔNG đi vào quyền hữu hiệu, dù người gọi có
    const eff = effectiveAgentPermissions(superUser.permissions, agent.permissions);
    expect(eff.has(ngoaiHienChuong)).toBe(false);
  });

  it('[đường 1 · chiều ②] hiến chương rộng KHÔNG giúp người gọi làm điều chính mình không được', async () => {
    // `emp1` giả lập: chỉ có ai:invoke, không có org:read
    const empLike = asUser(['ai:invoke']);
    await expect(mcp.invoke(empLike, 'ipms.get_org', {}))
      .rejects.toThrow(/cần permission 'org:read'/);
  });

  it('[đường 1] thông điệp chặn NÓI RÕ thiếu vì hiến chương, không đổ lên đầu người dùng', async () => {
    /**
     * Người dùng CÓ quyền mà vẫn bị chặn là tình huống dễ gây mất niềm tin nhất — nếu thông
     * điệp chỉ nói "bạn thiếu quyền X" thì họ đi xin một thứ họ đã có, và không ai gỡ được.
     */
    const code = `test.l2.narrow.${Date.now()}`;
    await owner.aiAgent.deleteMany({ where: { code } });
    // Siết bản chuẩn `mcp` cho tenant này: bản riêng BỚT `org:read`
    const global = await owner.aiAgent.findFirst({ where: { tenantId: null, code: 'mcp' } });
    const narrowed = await owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId, code: 'mcp',
        nameVi: global!.nameVi, purpose: global!.purpose, ownerRole: global!.ownerRole,
        kind: global!.kind, maxDataClass: global!.maxDataClass,
        dataAssetCodes: global!.dataAssetCodes as any,
        permissions: (global!.permissions as string[]).filter((p) => p !== 'org:read'),
        hitlMode: global!.hitlMode, status: 'active',
        note: '[TEST L2] bản riêng siết bớt org:read',
      },
    });
    try {
      const user = asUser(['org:read', 'ai:invoke']);   // NGƯỜI GỌI CÓ org:read
      await expect(mcp.invoke(user, 'ipms.get_org', {}))
        .rejects.toThrow(/hiến chương của agent 'mcp' không cho/);
    } finally {
      await owner.aiAgent.delete({ where: { id: narrowed.id } });
    }
  });

  // ═════════════════ Đường 2 — inline assist ═════════════════

  it('[đường 2 · chiều ①] `library:curate` của người gọi chỉ dùng được khi hiến chương khai', async () => {
    const dedup = await agents.resolve(tenantId, 'inline.curation.dedup');
    const draft = await agents.resolve(tenantId, 'inline.taskcell.draft');
    // Agent dedup ĐƯỢC khai library:curate (đó là việc của nó); agent soạn nháp thì KHÔNG
    expect(dedup.permissions).toContain('library:curate');
    expect(draft.permissions).not.toContain('library:curate');

    const curator = asUser(['library:curate', 'ai:assist']);
    // Cùng một người, hai agent, hai kết quả khác nhau — chính là điều hiến chương nói
    expect(effectiveAgentPermissions(curator.permissions, dedup.permissions).has('library:curate')).toBe(true);
    expect(effectiveAgentPermissions(curator.permissions, draft.permissions).has('library:curate')).toBe(false);
  });

  it('[đường 2 · chiều ②] người gọi không có `library:curate` thì hiến chương rộng cũng vô nghĩa', async () => {
    const dedup = await agents.resolve(tenantId, 'inline.curation.dedup');
    const author = asUser(['ai:assist']);      // tác giả thường, không phải curator
    expect(effectiveAgentPermissions(author.permissions, dedup.permissions).has('library:curate')).toBe(false);
  });

  // ═════════════════ Đường 3 — Copilot chat: ghi nhận SỰ THẬT, không dựng ca giả ═════════

  it('[đường 3] Copilot chat không đọc bảng NGHIỆP VỤ phía máy chủ — ghi nhận, không dựng ca xanh giả', async () => {
    /**
     * Bản đầu của ca này khẳng định "Copilot KHÔNG đọc dữ liệu phía máy chủ" và assert rằng
     * service không có `withTenant`. **Chính ca test bắt lời khẳng định đó là SAI** — service
     * có ba lượt `withTenant`. Đọc kỹ thì chúng chỉ chạm `aiConversation`/`aiMessage`, luôn
     * khoá `userId = chính người gọi`: lịch sử hội thoại của bản thân, không mang chiều quyền
     * nào để mà cắt. Ngữ cảnh nghiệp vụ vẫn do FE gửi lên trong body.
     *
     * Nên phát biểu đúng là: **không đọc bảng NGHIỆP VỤ**. Ca này đóng đinh đúng vế đó — ngày
     * nào Copilot bắt đầu đọc org/kpi/taskcell/scorecard/review/person phía máy chủ, ca đỏ và
     * người sửa biết phải thêm cổng N4 cho đường này.
     *
     * Ghi lại vì nó là ví dụ sống của bài học F191: tôi suýt commit một khẳng định sai kèm
     * một ca test xanh "chứng minh" nó.
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/modules/ai/ai-chat.service.ts'), 'utf8',
    );
    const BANG_NGHIEP_VU = /tx\.(orgUnit|kpiTemplate|taskCell|scorecard|review|person|appUser|goal|libraryContribution)\b/;
    expect(src).not.toMatch(BANG_NGHIEP_VU);
    // Liệt kê ĐÚNG các bảng được chạm — thêm bảng mới là phải sửa ca này, tức phải nghĩ lại.
    // `aiSuggestion` nằm đây vì Copilot ĐẺ đề xuất: chính chi tiết đó là lỗ N8 mà ca kiểm
    // này tìm ra (xem chú thích ở `ai-chat.service.ts`), nay đã có cổng.
    const chamToi = [...src.matchAll(/tx\.([a-zA-Z]+)\./g)].map((m) => m[1]);
    expect([...new Set(chamToi)].sort()).toEqual(['aiConversation', 'aiMessage', 'aiSuggestion']);
    // Và cổng N8 phải CÓ MẶT trên đường này — không chỉ ở MCP và inline.
    // Ở đây nó BỎ đề xuất chứ không ném: câu trả lời là thứ người dùng cần và nó hợp lệ;
    // ném sau khi đã stream xong sẽ làm mất luôn tin nhắn AI chưa kịp ghi (vá theo soát lớp 1).
    expect(src).toMatch(/hitlMode !== 'propose_only'/);
    expect(src).toMatch(/suggestion = undefined/);

    // ĐỐI CHỨNG: hiến chương của config_copilot vẫn tồn tại và vẫn được L1 dùng để suy mức
    const copilot = await agents.resolve(tenantId, 'config_copilot');
    expect(copilot.permissions.length).toBeGreaterThan(0);
  });

  // ═════════════════ N8 — hitlMode có răng ═════════════════

  it('[N8] agent `read_only` KHÔNG đẻ nổi `ai_suggestion` qua MCP', async () => {
    /**
     * Tới trước L2, `hitl_mode` chỉ có CHECK ở lược đồ và trigger giữ khỏi bị nới — KHÔNG
     * dòng mã nào ĐỌC nó để quyết định. Một bất biến không ai đọc là bất biến không tồn tại.
     */
    const global = await owner.aiAgent.findFirst({ where: { tenantId: null, code: 'mcp' } });
    const ro = await owner.aiAgent.create({
      data: {
        id: uuidv7(), tenantId, code: 'mcp',
        nameVi: global!.nameVi, purpose: global!.purpose, ownerRole: global!.ownerRole,
        kind: global!.kind, maxDataClass: global!.maxDataClass,
        dataAssetCodes: global!.dataAssetCodes as any,
        permissions: global!.permissions as any,
        hitlMode: 'read_only', status: 'active',
        note: '[TEST L2] bản riêng siết HITL xuống read_only',
      },
    });
    try {
      const user = asUser([...(global!.permissions as string[]), 'ai:invoke']);
      await expect(mcp.invoke(user, 'ipms.propose_org_change', {
        proposal: { nameVi: 'thử' }, reason: 'ca kiểm N8',
      })).rejects.toThrow(/chế độ 'read_only'|N8/);
    } finally {
      await owner.aiAgent.delete({ where: { id: ro.id } });
    }
  });

  it('[N8 — ĐỐI CHỨNG] agent `propose_only` vẫn đẻ được suggestion PENDING', async () => {
    const global = await owner.aiAgent.findFirst({ where: { tenantId: null, code: 'mcp' } });
    const user = asUser([...(global!.permissions as string[]), 'ai:invoke']);
    const res: any = await mcp.invoke(user, 'ipms.propose_org_change', {
      proposal: { nameVi: 'thử đối chứng' }, reason: 'ca đối chứng N8',
    });
    expect(res.result.status).toBe('pending');
    await owner.aiSuggestion.deleteMany({ where: { id: res.result.id } });
  });
});
