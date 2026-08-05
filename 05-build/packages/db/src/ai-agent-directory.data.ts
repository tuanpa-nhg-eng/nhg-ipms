/**
 * [Trục D L0] DANH BẠ AGENT — bản chuẩn CẤP TẬP ĐOÀN (`tenant_id NULL`).
 *
 * Tách khỏi `seed.ts` (khuôn `kpi-dictionary.data.ts` / `task-catalog.data.ts`) vì đây là DỮ
 * LIỆU được kiểm chứng độc lập: unit test đọc thẳng hằng số này để đóng đinh các bất biến của
 * hiến chương mà không cần dựng DB.
 *
 * ═══ Nguồn có HAI, và chúng KHÔNG khớp nhau. Bảng này ghi lại đúng chỗ lệch thay vì bịa cho khớp:
 *
 *   ┌ BRD Nền tảng §agent — 7 agent nghiệp vụ, mỗi cái đã có sẵn *chủ quản* và *phân loại tối
 *   │  đa*. Đây chính là các trường BR-M09-02 đòi.
 *   └ Mã đang chạy — ĐO bằng `SELECT DISTINCT agent FROM ai_interaction` trên DB dev:
 *      SÁU mã thật lẫn trong 397 mã; 391 mã còn lại là rác do test đẻ ra (mỗi lượt chạy mint
 *      một "agent" mới, nằm lại vĩnh viễn trong bảng append-only).
 *
 * ═══ Bảng ánh xạ BRD ⟷ mã (là DỮ LIỆU của quyết định, không phải chú thích trang trí):
 *
 *   BRD "Trợ lý hiệu suất"                → config_copilot            ✅ đang chạy (492 lượt)
 *   BRD "Trợ lý soạn chỉ số"              → inline.taskcell.kpi_link  ✅ đang chạy (1.281)
 *   BRD "Trợ lý soạn tác vụ"              → inline.taskcell.draft     ✅ đang chạy (862)
 *   BRD "Trợ lý phát hiện trùng lặp"      → inline.curation.dedup     ✅ đang chạy (188)
 *   BRD "Trợ lý cảnh báo mục tiêu rủi ro" → (chưa có mã)              ⏳ planned
 *   BRD "Trợ lý tóm tắt đánh giá"         → (chưa có mã)              ⏳ planned — đòi mô hình nội bộ
 *   BRD "Trợ lý cân chỉnh"                → (chưa có mã)              ⏳ planned — đòi mô hình nội bộ
 *   (KHÔNG có trong BRD) inline.derivation.rule                       ✅ đang chạy (493)
 *   (KHÔNG có trong BRD) mcp                                          ✅ hạ tầng (796)
 *   (chỉ có nhánh mock, KHÔNG caller) kpi_designer                    ⏳ planned
 *
 * `eval_harness` CỐ Ý KHÔNG có trong sổ: nó chỉ xuất hiện trong một chú thích ví dụ ở
 * `llm-client.ts`. Lượt eval thật ghi `agent = suite.agent` (agent ĐANG BỊ đánh giá), nên
 * `eval_harness` chưa bao giờ là một giá trị `agent` — 0 dòng trong `ai_interaction`. Seed nó
 * cho "đủ bộ" đúng là kiểu số trông-như-thật mà trục A đã phải xoá bốn khối.
 *
 * Hai agent BRD đòi *"Confidential — chỉ mô hình nội bộ"* để `planned`: đích hợp lệ cho chúng
 * (self-host) là việc của L3. Khai danh tính ra và để `planned` là ghi nhận trung thực; bật
 * sớm là hứa một thứ hệ thống chưa làm được — và làm rỗng nghĩa câu chặn cứng ở `egress-policy.ts`.
 */
export interface AiAgentSeed {
  code: string;
  nameVi: string;
  nameEn?: string;
  purpose: string;
  /** Chủ quản theo VAI/KHỐI ('B1','B3','B5') — không theo tên người. */
  owner: string;
  kind: 'business' | 'infrastructure';
  /** TRẦN phân loại — thuộc tính của AGENT, không phải của phiên gọi (N3, cưỡng chế ở L1). */
  maxDataClass: 'public' | 'internal' | 'confidential' | 'restricted';
  /** Trỏ `data_asset.code` của trục C. */
  assets: string[];
  /** Hiến chương quyền. Quyền hữu hiệu = quyền người gọi ∩ tập này (N4, ở L2). */
  permissions: string[];
  hitl: 'read_only' | 'propose_only';
  status: 'active' | 'planned' | 'retired';
  note?: string;
}

export const GLOBAL_AI_AGENTS: AiAgentSeed[] = [
  {
    code: 'config_copilot', nameVi: 'Trợ lý hiệu suất', nameEn: 'Performance Copilot',
    purpose: 'Hỏi đáp và hướng dẫn trong sản phẩm, hiểu ngữ cảnh màn hình người dùng đang mở',
    owner: 'B3', kind: 'business', maxDataClass: 'internal',
    assets: ['objective.kpi', 'task.dictionary'],
    permissions: ['kpi:read', 'goal:read', 'strategy:read', 'scorecard:read', 'config:read', 'taskdict:read'],
    hitl: 'propose_only', status: 'active',
    note: 'BRD "Trợ lý hiệu suất". Tên mã lịch sử là config_copilot — GIỮ nguyên vì đổi mã sẽ '
      + 'cắt đứt 492 dòng ai_interaction, mọi eval suite và launch bar đang khoá theo chuỗi này.',
  },
  {
    code: 'inline.taskcell.kpi_link', nameVi: 'Trợ lý soạn chỉ số', nameEn: 'KPI Drafting Assistant',
    purpose: 'Gợi ý gắn tác vụ với chỉ số phù hợp trong Từ điển KPI',
    owner: 'B1', kind: 'business', maxDataClass: 'internal',
    assets: ['objective.kpi', 'task.dictionary'],
    permissions: ['kpi:read', 'taskcell:read', 'taskdict:read'],
    hitl: 'propose_only', status: 'active',
  },
  {
    code: 'inline.taskcell.draft', nameVi: 'Trợ lý soạn tác vụ', nameEn: 'Task Cell Drafting Assistant',
    purpose: 'Soạn nháp tác vụ theo bảy nhóm thuộc tính A–G',
    owner: 'B1', kind: 'business', maxDataClass: 'internal',
    assets: ['task.dictionary'],
    permissions: ['taskcell:read', 'taskdict:read'],
    hitl: 'propose_only', status: 'active',
  },
  {
    code: 'inline.curation.dedup', nameVi: 'Trợ lý phát hiện trùng lặp', nameEn: 'Duplicate Detection Assistant',
    purpose: 'Phát hiện tác vụ và chỉ số trùng nhau, đề xuất gộp',
    owner: 'B1', kind: 'business', maxDataClass: 'internal',
    assets: ['task.dictionary', 'objective.kpi'],
    permissions: ['taskcell:read', 'taskdict:read', 'kpi:read'],
    hitl: 'propose_only', status: 'active',
  },
  {
    code: 'inline.derivation.rule', nameVi: 'Trợ lý soạn luật kéo theo', nameEn: 'Derivation Rule Assistant',
    purpose: 'Gợi ý luật kéo theo bộ chỉ số từ chức năng/ngạch/cấp bậc',
    owner: 'B3', kind: 'business', maxDataClass: 'internal',
    assets: ['objective.kpi', 'task.dictionary'],
    permissions: ['config:read', 'kpi:read', 'org:read', 'taskcell:read'],
    hitl: 'propose_only', status: 'active',
    note: 'KHÔNG có trong danh sách 7 agent của BRD — khai bổ sung vì nó đang chạy thật (493 '
      + 'lượt). Chỗ lệch này cần B3 xác nhận khi cập nhật BRD, KHÔNG tự sửa BRD từ phía mã.',
  },
  {
    code: 'mcp', nameVi: 'Cổng công cụ MCP', nameEn: 'MCP Tool Gateway',
    purpose: 'Hạ tầng: phục vụ các công cụ đọc + đề xuất theo giao thức MCP cho mọi agent',
    owner: 'B3', kind: 'infrastructure', maxDataClass: 'internal',
    assets: ['objective.kpi', 'task.dictionary'],
    permissions: ['org:read', 'kpi:read', 'scorecard:read', 'taskdict:read'],
    hitl: 'propose_only', status: 'active',
    note: 'Hạ tầng, không phải agent nghiệp vụ. Cổng per-tool `mcp_tool.scope_permission` + '
      + 'min-permission canonical trong mã (F55) vẫn đứng ĐỘC LẬP — hiến chương này là lớp thứ ba.',
  },
  {
    code: 'goal.risk_alert', nameVi: 'Trợ lý cảnh báo mục tiêu rủi ro', nameEn: 'Goal Risk Alert Assistant',
    purpose: 'Phát hiện mục tiêu có nguy cơ trượt, cảnh báo sớm — không tự điều chỉnh mục tiêu',
    owner: 'B1', kind: 'business', maxDataClass: 'internal',
    assets: ['objective.kpi'],
    permissions: ['goal:read', 'strategy:read', 'evidence:read'],
    hitl: 'read_only', status: 'planned',
    note: 'BRD có, mã CHƯA có. Giữ planned để danh bạ nói đúng hiện trạng.',
  },
  {
    code: 'kpi_designer', nameVi: 'Trợ lý thiết kế chỉ số', nameEn: 'KPI Designer Agent',
    purpose: 'Soạn nháp chỉ số, công thức và bậc thang theo PRD KPI Designer Agent',
    owner: 'B1', kind: 'business', maxDataClass: 'internal',
    assets: ['objective.kpi'],
    permissions: ['kpi:read', 'kpi:propose'],
    hitl: 'propose_only', status: 'planned',
    note: 'Có PRD riêng và có NHÁNH trong MockLlmClient, nhưng KHÔNG caller nào — 0 dòng '
      + 'ai_interaction. Planned chứ không active: một nhánh mock không phải một agent đang chạy.',
  },
  {
    code: 'review.summarizer', nameVi: 'Trợ lý tóm tắt đánh giá', nameEn: 'Review Summarizer',
    purpose: 'Tóm tắt phản hồi nhiều nguồn cho quản lý — người viết kết luận',
    owner: 'B1 + B5', kind: 'business', maxDataClass: 'confidential',
    assets: ['review.result'],
    permissions: ['review:read'],
    hitl: 'read_only', status: 'planned',
    note: 'BRD ghi "Confidential — chỉ mô hình nội bộ". Đích hợp lệ CHƯA TỒN TẠI (self-host là '
      + 'L3) ⇒ planned. Bật trước khi có self-host là vi phạm N7.',
  },
  {
    code: 'calibration.advisor', nameVi: 'Trợ lý cân chỉnh', nameEn: 'Calibration Advisor',
    purpose: 'Nêu điểm lệch chuẩn giữa các quản lý — người chủ trì quyết',
    owner: 'B1', kind: 'business', maxDataClass: 'confidential',
    assets: ['review.result'],
    permissions: ['review:read'],
    hitl: 'read_only', status: 'planned',
    note: 'BRD ghi "Confidential — chỉ mô hình nội bộ". Cùng lý do planned như review.summarizer.',
  },
];

/**
 * SÁU mã agent mà MÃ SẢN PHẨM thực sự truyền vào `LlmRequest.agent` hôm nay.
 *
 * Suy ra từ chính danh bạ (`status='active'`) chứ KHÔNG liệt kê tay lần thứ hai — khuôn
 * `SUPPORT_ROLE_PERMISSIONS` của trục C L2b. Liệt kê tay là chỗ agent thứ bảy thêm vào sẽ bị
 * bỏ quên đúng ở cái test sinh ra để canh nó.
 *
 * Đây là tập mà L1 phải phủ TRƯỚC khi bật N1 (agent lạ ⇒ 422): thiếu một mã ở đây thì bật
 * chặn là gãy một tính năng đang chạy.
 */
export const ACTIVE_AGENT_CODES: string[] = GLOBAL_AI_AGENTS
  .filter((a) => a.status === 'active')
  .map((a) => a.code);
