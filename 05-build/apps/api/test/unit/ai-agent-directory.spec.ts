import { GLOBAL_AI_AGENTS, ACTIVE_AGENT_CODES } from '@ipms/db';
import { PERMISSIONS, DATA_CLASSIFICATIONS, dataClassRank } from '@ipms/shared';
import { unknownPermissions } from '../../src/modules/ai/agents/ai-agent.service';

/**
 * [Trục D L0] Bất biến của DANH BẠ AGENT, kiểm trên chính hằng số seed — không cần DB.
 *
 * Vì sao đáng có một suite riêng cho một bảng dữ liệu: hiến chương agent là thứ mà L1 (trần
 * phân loại), L2 (quyền hữu hiệu) và L3 (định tuyến) đều ĐỌC. Một mã quyền gõ sai ở đây không
 * gây lỗi gì hôm nay — nó lặng lẽ biến thành "quyền không bao giờ khớp" khi L2 lấy giao với
 * quyền người gọi, tức là agent mất năng lực mà không ai biết vì sao. Đúng họ với lỗi chuỗi
 * tự do mà L0 sinh ra để đóng.
 */
describe('[Trục D L0] Danh bạ agent — bất biến của hiến chương', () => {
  it('có agent để kiểm (chống assert chạy 0 lần)', () => {
    // Bài học trục A ②: test xanh trong khi vòng lặp assert không chạy lần nào.
    expect(GLOBAL_AI_AGENTS.length).toBeGreaterThan(0);
    expect(ACTIVE_AGENT_CODES.length).toBeGreaterThan(0);
  });

  it('mã agent duy nhất và khớp ràng buộc CHECK của DDL', () => {
    const codes = GLOBAL_AI_AGENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    // Cùng biểu thức với `ai_agent_code_check` trong migration — lệch nhau thì seed đỏ ở DB,
    // nhưng ở đây đỏ SỚM HƠN và nói rõ mã nào sai.
    for (const c of codes) expect(c).toMatch(/^[a-z][a-z0-9_.]{2,63}$/);
  });

  it('MỌI quyền trong hiến chương đều tồn tại trong catalog quyền', () => {
    const all = GLOBAL_AI_AGENTS.flatMap((a) => a.permissions);
    expect(all.length).toBeGreaterThan(0);
    expect(unknownPermissions(all)).toEqual([]);
  });

  it('MỌI mã dữ liệu trong phạm vi đều trỏ sổ đăng ký của trục C', () => {
    // Chín nhóm chuẩn tập đoàn (seed trục C L0). Liệt kê ở đây có chủ đích: nếu ai đó xoá một
    // nhóm khỏi `data_asset` thì test này phải đỏ, chứ không phải im lặng cho agent trỏ vào
    // một mã không còn tồn tại (L1 sẽ ném lúc chạy — muộn hơn nhiều).
    const REGISTERED = new Set([
      'objective.kpi', 'task.dictionary', 'review.result', 'payroll.reward', 'hr.profile',
      'finance.metric', 'opco.operational', 'system.log', 'audit.log',
    ]);
    const all = GLOBAL_AI_AGENTS.flatMap((a) => a.assets);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((c) => !REGISTERED.has(c))).toEqual([]);
  });

  it('trần phân loại nằm trong bốn mức, và KHÔNG agent nào chạm `restricted`', () => {
    for (const a of GLOBAL_AI_AGENTS) {
      expect(DATA_CLASSIFICATIONS as readonly string[]).toContain(a.maxDataClass);
      // N6: `restricted` không tới bất kỳ nhà cung cấp nào. Một agent khai trần `restricted`
      // là mâu thuẫn tự thân — nó tuyên bố được xử lý thứ không được rời máy dưới mọi hình
      // thức. Chặn ngay ở dữ liệu, đừng đợi L3 phát hiện.
      expect(dataClassRank(a.maxDataClass)).toBeLessThan(dataClassRank('restricted'));
    }
  });

  it('KHÔNG agent nào chạm nhóm dữ liệu mức `restricted`', () => {
    const RESTRICTED_ASSETS = new Set(['payroll.reward', 'opco.operational']);
    for (const a of GLOBAL_AI_AGENTS) {
      const bad = a.assets.filter((c) => RESTRICTED_ASSETS.has(c));
      expect({ agent: a.code, bad }).toEqual({ agent: a.code, bad: [] });
    }
  });

  it('phạm vi dữ liệu không vượt trần của chính agent', () => {
    // Trần `internal` mà khai chạm `review.result` (confidential) là hiến chương tự mâu thuẫn:
    // L1 sẽ chặn agent đó ở MỌI lượt gọi, tức là một agent chết mà nhìn sổ tưởng đang sống.
    const ASSET_CLASS: Record<string, (typeof DATA_CLASSIFICATIONS)[number]> = {
      'objective.kpi': 'internal', 'task.dictionary': 'internal', 'system.log': 'internal',
      'review.result': 'confidential', 'hr.profile': 'confidential', 'finance.metric': 'confidential',
      'audit.log': 'confidential', 'payroll.reward': 'restricted', 'opco.operational': 'restricted',
    };
    let checked = 0;
    for (const a of GLOBAL_AI_AGENTS) {
      for (const code of a.assets) {
        const cls = ASSET_CLASS[code];
        expect({ agent: a.code, code, cls, tran: a.maxDataClass, vuot: dataClassRank(cls) > dataClassRank(a.maxDataClass) })
          .toEqual({ agent: a.code, code, cls, tran: a.maxDataClass, vuot: false });
        checked += 1;
      }
    }
    // Bài học trục A ②: đếm số lần assert THỰC SỰ chạy. Vòng lặp lồng hai tầng là chỗ dễ
    // nhất để một test xanh mà không kiểm gì (agent rỗng assets ⇒ vòng trong không chạy).
    expect(checked).toBeGreaterThanOrEqual(GLOBAL_AI_AGENTS.length);
  });

  it('KHÔNG chế độ HITL nào cho phép AI ghi thẳng nghiệp vụ (BRD §ranh_gioi_ai)', () => {
    for (const a of GLOBAL_AI_AGENTS) {
      expect(['read_only', 'propose_only']).toContain(a.hitl);
    }
  });

  it('agent `read_only` KHÔNG giữ quyền ghi nào', () => {
    for (const a of GLOBAL_AI_AGENTS.filter((x) => x.hitl === 'read_only')) {
      const writes = a.permissions.filter((p) => /:(write|approve|publish|manage|run|delete|revoke|assign|propose)$/.test(p));
      expect({ agent: a.code, writes }).toEqual({ agent: a.code, writes: [] });
    }
  });

  it('hai agent BRD đòi mô hình nội bộ đang ở `planned` — KHÔNG được bật trước L3 (N7)', () => {
    // Đích hợp lệ cho `confidential` (self-host) CHƯA tồn tại; `egress-policy.ts` chặn cứng.
    // Bật hai agent này thành `active` trước L3 làm rỗng nghĩa câu chặn đó.
    const internalOnly = GLOBAL_AI_AGENTS.filter((a) => a.maxDataClass === 'confidential');
    expect(internalOnly.map((a) => a.code).sort()).toEqual(['calibration.advisor', 'review.summarizer']);
    for (const a of internalOnly) expect(a.status).toBe('planned');
  });

  it('SÁU mã đang chạy thật đều `active` trong sổ — điều kiện cần để L1 bật N1', () => {
    // Đo trên DB dev 05/08/2026: đây là toàn bộ giá trị `agent` mà MÃ SẢN PHẨM truyền vào
    // `LlmRequest.agent`. Thiếu một mã ở đây thì bật N1 (agent lạ ⇒ 422) là gãy tính năng.
    // Cập nhật danh sách này khi thêm agent mới — cố ý bắt phải sửa tay ở MỘT chỗ.
    const DANG_CHAY_THAT = [
      'config_copilot', 'mcp',
      'inline.taskcell.draft', 'inline.taskcell.kpi_link',
      'inline.derivation.rule', 'inline.curation.dedup',
    ];
    expect(ACTIVE_AGENT_CODES.slice().sort()).toEqual(DANG_CHAY_THAT.slice().sort());
  });

  it('mọi agent có chủ quản và mục đích đọc được (BR-M09-02)', () => {
    for (const a of GLOBAL_AI_AGENTS) {
      // `owner` là tên trường trong AiAgentSeed (map sang cột `owner_role`). Bản đầu của test
      // này viết `a.ownerRole ?? a.owner` — `ownerRole` KHÔNG tồn tại trên kiểu, và vì ts-jest
      // chạy transpile-only nên nó không đỏ, chỉ luôn rơi về nhánh sau. Test xanh mà một nửa
      // biểu thức là chữ chết: đúng họ F181 "tên nói một đằng kiểm một nẻo".
      expect(a.owner.trim().length).toBeGreaterThanOrEqual(2);
      expect(a.purpose.trim().length).toBeGreaterThanOrEqual(20);
      expect(a.nameVi.trim().length).toBeGreaterThan(0);
    }
  });

  it('`eval_harness` CỐ Ý không có trong sổ — 0 dòng ai_interaction, không bịa cho đủ bộ', () => {
    expect(GLOBAL_AI_AGENTS.map((a) => a.code)).not.toContain('eval_harness');
  });

  it('catalog quyền có `aiagent:read`/`aiagent:write`', () => {
    expect(PERMISSIONS as readonly string[]).toContain('aiagent:read');
    expect(PERMISSIONS as readonly string[]).toContain('aiagent:write');
  });
});
