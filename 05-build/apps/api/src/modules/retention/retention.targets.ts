import type { TenantTx } from '@ipms/db';

/**
 * [Trục C L5] BẢN ĐỒ "nhóm dữ liệu → cái gì thực sự bị đụng".
 *
 * Chính sách lưu trữ được viết bằng ngôn ngữ nghiệp vụ (`review.result`, `system.log`); ánh xạ
 * sang bảng, cột ngày, và phép lọc bảo vệ nằm ở ĐÂY — một chỗ, đọc được trong một màn hình.
 *
 * Vì sao không viết SQL động từ chính sách: một job xoá dữ liệu dựng câu lệnh từ dữ liệu cấu
 * hình là thứ không ai rà nổi. Mỗi mã dữ liệu có executor VIẾT TAY, và mã nào không có
 * executor thì lượt chạy trả về "chưa hỗ trợ" — fail-closed, không im lặng bỏ qua.
 *
 * ⚠️ `audit.log` và `export.log` CỐ Ý không có mặt ở đây (K6). Đây là tầng thứ ba của cùng
 * một bất biến: CHECK constraint không cho lưu chính sách, service từ chối, và ngay cả khi
 * hai lớp đó thủng thì cũng không tồn tại đoạn mã nào biết cách xoá hai bảng đó.
 */
export interface RetentionPlan {
  /** Số bản ghi quá hạn VÀ được phép đụng. */
  planned: number;
  /** Số bản ghi quá hạn nhưng bỏ qua vì đang được bảo vệ (K7). */
  skippedProtected: number;
  /** Mô tả người đọc hiểu được — vào `report` của lượt chạy và hiện trên màn chạy thử. */
  detail: Record<string, unknown>;
}

export interface RetentionTarget {
  assetCode: string;
  /** Bảng/cột bị đụng, viết cho người đọc báo cáo chứ không cho máy. */
  describes: string;
  /** Hành động hợp lệ với mã này — chính sách khai hành động ngoài danh sách sẽ bị từ chối. */
  supports: readonly string[];
  plan(tx: TenantTx, cutoff: Date): Promise<RetentionPlan>;
  apply(tx: TenantTx, cutoff: Date, action: string): Promise<number>;
}

/** Giá trị thay thế khi khử danh — cố định để đọc báo cáo biết ngay dòng nào đã bị khử. */
const ANON = '[đã khử danh theo chính sách lưu trữ]';

/**
 * `review.result` — kết quả đánh giá cá nhân (`confidential`, NĐ13).
 *
 * Hành động là KHỬ DANH, không xoá hàng: điểm số và hạng là dữ liệu thống kê hợp pháp để giữ
 * (phân bố hiệu suất theo năm), còn thứ nhận dạng được một con người cụ thể là các trường văn
 * bản tự do — tự đánh giá, nhận xét của quản lý, điểm mạnh/điểm yếu, nhu cầu phát triển, lý do
 * chốt hạng. Xoá cả hàng sẽ phá luôn số liệu lịch sử mà không thu thêm được lợi ích riêng tư nào.
 *
 * [K7] CHỈ đụng review thuộc kỳ đã CHỐT (`review_cycle.status = 'closed'`). Review của kỳ đang
 * mở là dữ liệu đang dùng — xoá nó không phải tuân thủ, là mất dữ liệu.
 */
const reviewTarget: RetentionTarget = {
  assetCode: 'review.result',
  describes: 'review — các trường văn bản tự do (tự đánh giá, nhận xét quản lý, điểm mạnh/yếu, lý do chốt hạng)',
  supports: ['anonymize', 'keep'],

  async plan(tx, cutoff) {
    // "Còn thứ để khử" — phải loại cả hàng ĐÃ khử danh, không chỉ hàng NULL.
    //
    // [Lỗi tự bắt ở lần chạy test đầu] Bản đầu lọc `{ not: null }`. Nhưng khử danh GHI ĐÈ một
    // chuỗi (không đặt NULL), nên hàng đã xử lý vẫn thoả điều kiện: mỗi lượt chạy lại báo đúng
    // con số cũ, "khử danh" lại chính những hàng đã khử, và `affected_count` phồng lên vô hạn.
    // Hồ sơ tuân thủ khi đó nói dối theo hướng nguy hiểm nhất — luôn còn việc phải làm, nên
    // không ai nhận ra công việc đã xong từ lâu. `{ not: ANON }` trong Prisma dịch thành
    // `<> ANON`, tức loại luôn NULL — đúng cả hai vế trong một điều kiện.
    const hasText = {
      OR: [
        { selfReflection: { not: ANON } }, { managerAssessment: { not: ANON } },
        { strengths: { not: ANON } }, { gaps: { not: ANON } },
        { developmentNeeds: { not: ANON } }, { finalRationale: { not: ANON } },
      ],
    };
    const overdue = { createdAt: { lt: cutoff }, deletedAt: null, ...hasText };
    const planned = await tx.review.count({
      where: { ...overdue, cycle: { status: 'closed' } },
    });
    const skippedProtected = await tx.review.count({
      where: { ...overdue, cycle: { status: { not: 'closed' } } },
    });
    return {
      planned, skippedProtected,
      detail: {
        table: 'review',
        fields: ['self_reflection', 'manager_assessment', 'strengths', 'gaps', 'development_needs', 'final_rationale'],
        keeps: ['final_score', 'final_rating', 'ipc_grade'],
        protection: 'K7 — bỏ qua review thuộc kỳ chưa chốt (review_cycle.status <> closed)',
      },
    };
  },

  async apply(tx, cutoff, action) {
    if (action !== 'anonymize') return 0;
    const rows = await tx.review.findMany({
      where: {
        createdAt: { lt: cutoff }, deletedAt: null, cycle: { status: 'closed' },
        OR: [
          { selfReflection: { not: ANON } }, { managerAssessment: { not: ANON } },
          { strengths: { not: ANON } }, { gaps: { not: ANON } },
          { developmentNeeds: { not: ANON } }, { finalRationale: { not: ANON } },
        ],
      },
      select: { id: true },
    });
    if (rows.length === 0) return 0;
    // `updateMany` theo đúng danh sách id đã LẬP KẾ HOẠCH, không update theo điều kiện lần
    // nữa: giữa lúc lập kế hoạch và lúc chạy, một kỳ có thể vừa được mở lại. Chạy theo id thì
    // phạm vi đúng bằng thứ đã được người duyệt nhìn thấy.
    const res = await tx.review.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        selfReflection: ANON, managerAssessment: ANON, strengths: ANON,
        gaps: ANON, developmentNeeds: ANON, finalRationale: ANON,
      },
    });
    return res.count;
  },
};

/**
 * `system.log` — nhật ký vận hành & lượt gọi AI (`internal`, mặc định 2 năm).
 *
 * Ở đây XOÁ CỨNG là đúng: `ai_interaction` là dữ liệu vận hành, không có giá trị pháp lý dài
 * hạn, và giữ lại thì vẫn mang prompt/kết quả đã cắt PII — vẫn là bề mặt phơi nhiễm.
 * KHÔNG có phép lọc bảo vệ nào (không thuộc kỳ đánh giá nào) — `skippedProtected` luôn 0, và
 * điều đó là ĐÚNG với mã này chứ không phải phép lọc hỏng.
 */
const systemLogTarget: RetentionTarget = {
  assetCode: 'system.log',
  describes: 'ai_interaction — lượt gọi AI đã quá hạn (xoá cứng)',
  supports: ['hard_delete', 'keep'],

  async plan(tx, cutoff) {
    const planned = await tx.aiInteraction.count({ where: { at: { lt: cutoff } } });
    return {
      planned, skippedProtected: 0,
      detail: {
        table: 'ai_interaction',
        protection: 'không có — dữ liệu vận hành, không gắn kỳ đánh giá nào',
      },
    };
  },

  async apply(tx, cutoff, action) {
    if (action !== 'hard_delete') return 0;
    const res = await tx.aiInteraction.deleteMany({ where: { at: { lt: cutoff } } });
    return res.count;
  },
};

export const RETENTION_TARGETS: readonly RetentionTarget[] = [reviewTarget, systemLogTarget];

export function findTarget(assetCode: string): RetentionTarget | undefined {
  return RETENTION_TARGETS.find((t) => t.assetCode === assetCode);
}
