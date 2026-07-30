/** @ipms/shared — types + hằng số dùng chung FE/BE/AI gateway. */

/** Permission catalog Phase 0 (đồng bộ với packages/db seed). */
export const PERMISSIONS = [
  'tenant:read',
  'org:read', 'org:write',
  'person:read', 'person:write',
  'user:read', 'user:write', 'role:assign',
  'audit:read',
  'flag:read', 'flag:write',
  // Phase 1 — KPI & Scorecard
  'kpi:read', 'kpi:write', 'kpi:approve',
  'scorecard:read', 'scorecard:write',
  // Phase 1 — Strategy & Goal
  'strategy:read', 'strategy:write',
  'goal:read', 'goal:write',
  // Phase 1 — Evidence & Integration
  'evidence:read', 'evidence:write', 'evidence:verify',
  'integration:run',
  // Phase 2 — Check-in, Review, Calibration, Payroll
  'checkin:read', 'checkin:write', 'checkin:review',
  'review:read', 'review:write', 'review:manage', 'rating:approve',
  'calibration:run',
  'payroll:export',
  // Phase 3 — Configuration Studio
  'config:read', 'config:write', 'config:publish',
  'brand:write',
  'org:design',
  'derivation:run',
  'taskcell:read', 'taskcell:write',
  'process:design',
  'integration:connect', 'integration:bind',
  // Phase 3 lát 4a — ai-gateway + MCP + eval harness
  'ai:invoke', 'ai:eval',
  // Phase 3 lát 4f — BU Authoring Gate
  'taskcell:author', 'kpi:propose',
  'library:submit', 'library:curate', 'library:publish', 'library:deprecate',
  'library:import', 'library:import:canonical',
  // Phase 3 lát 4j–4k — Từ điển Tác vụ hoàn thiện (ủy quyền + vòng lặp tối ưu)
  'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
  // Go-live Từ điển Tác vụ — tra cứu canonical toàn hàng (read-only, mọi persona)
  'taskdict:read',
  // Phase 3 lát AI inline — gợi ý inline (chỉ đọc + đẻ ai_suggestion PENDING).
  // TÁCH khỏi ai:invoke (chat/MCP propose): inline nằm đúng chỗ author/curator/dept_head.
  'ai:assist',
  // [Learning Loop L1] Duyệt golden case từ tín hiệu học — TÁCH khỏi ai:eval (chạy eval)
  // và ai:assist (tạo tín hiệu): SoD trên THƯỚC ĐO — người chấp nhận gợi ý không tự
  // nạp case của mình vào golden set (bài học E2 red-team KPI Designer).
  'ai:eval:curate',
  // [Trục B L0] Quản trị tenant (tầng ②) — tách hành động PHÁ HUỶ khỏi quyền ghi thường:
  // mời/khoá người dùng và thu hồi vai là ba việc không nên đi kèm 'user:write'.
  'user:invite', 'user:deactivate',
  'role:read', 'role:revoke',
  'orgunit:update', 'orgunit:archive',
  'tenant.config:read', 'tenant.config:update',
  // [Trục B L0] Tuỳ chọn cá nhân (tầng ③) — cấp cho MỌI role. 'access.self:read'
  // ("Quyền của tôi") là cam kết trust-by-design: ai cũng xem được quyền của chính mình.
  'settings.self:read', 'settings.self:update',
  'access.self:read',
  'notify.self:read', 'notify.self:update',
  // [Trục B L4] Impersonation chỉ-đọc có kiểm soát — cấp cho tenant_admin, KHÔNG org_admin.
  'user:impersonate',
  // [Trục C L0] Sổ đăng ký dữ liệu. ':read' cấp rộng (mọi vai quản trị cần tra mức phân
  // loại trước khi xuất dữ liệu); ':write' CHỈ data_steward (B3 + B5).
  'datacatalog:read', 'datacatalog:write',
  // [Trục C L1] Kiểm soát xuất dữ liệu.
  //  · 'export:confidential' — trần theo mức phân loại: xuất dữ liệu `confidential` đòi
  //    quyền RIÊNG này, và nó KHÔNG nằm trong bộ mặc định của BẤT KỲ vai nào (kể cả hrbp
  //    đang giữ `payroll:export`). Ai được xuất dữ liệu cá nhân là quyết định TƯỜNG MINH
  //    của B1 trên từng người, không phải hệ quả phụ của việc được gán một vai nghiệp vụ.
  //  · 'exportlog:read' — đọc sổ nhật ký xuất. Cấp cho `auditor` (B0) ở L1; `platform_admin`
  //    nhận ở L2. KHÔNG cấp cho vai vận hành: người xuất không tự soát vết xuất của mình.
  'export:confidential', 'exportlog:read',
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

export type ScopeType = 'tenant' | 'org_unit' | 'self';

/**
 * [Trục C L0] Bốn mức phân loại dữ liệu theo NHG Strategic Context §7.
 *
 * ⚠️ LỆCH VỰNG ĐÃ HOÀ GIẢI Ở ĐÂY: lớp AI (`modules/ai/egress/*`) trước đó dùng `pii` làm
 * mức thứ tư. Strategic Context — văn bản gốc mà cả tập đoàn tuân theo — dùng `restricted`.
 * Hai vựng song song là mầm drift: một chỗ siết `pii`, chỗ kia siết `restricted`, và dữ
 * liệu lọt qua khe giữa hai cách gọi. Chuẩn hoá về `restricted`; `pii` giữ làm bí danh
 * TƯƠNG THÍCH NGƯỢC cho các bản ghi `ai_egress_policy` đã tồn tại, chuẩn hoá tại cửa.
 */
export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/** Thứ tự nghiêm ngặt — PHẢI khớp `data_class_rank()` trong migration 20260729100000. */
const CLASS_RANK: Record<DataClassification, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3,
};

export function dataClassRank(c: DataClassification): number {
  return CLASS_RANK[c];
}

/** `pii` (vựng cũ của lớp AI) ⇒ `restricted`. Giá trị lạ trả về null — fail-closed ở nơi gọi. */
export function normalizeDataClass(raw: string): DataClassification | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'pii') return 'restricted';
  return (DATA_CLASSIFICATIONS as readonly string[]).includes(v) ? (v as DataClassification) : null;
}

/** Mức nhạy cảm — không rời hạ tầng do NHG kiểm soát (Strategic Context §9.3). */
export function isSensitiveClass(c: DataClassification): boolean {
  return dataClassRank(c) >= CLASS_RANK.confidential;
}

/**
 * [Trục C L1] LOẠI ĐÍCH ĐẾN của một đường xuất dữ liệu. Trần xuất KHÔNG thể quyết chỉ bằng
 * mức phân loại: "gửi kết quả đánh giá sang hệ lương nội bộ NHG" và "tải bảng điểm về máy
 * cá nhân" là hai rủi ro khác hẳn nhau dù cùng một mức `confidential`.
 *
 *  · internal_system  — hệ khác BÊN TRONG hạ tầng NHG (OneOffice, hệ nhân sự…)
 *  · file_download    — tệp về máy người dùng: rời vùng kiểm soát, không thu hồi được
 *  · external_service — dịch vụ NGOÀI hạ tầng NHG (SaaS, connector bên thứ ba)
 */
export const EXPORT_DEST_KINDS = ['internal_system', 'file_download', 'external_service'] as const;
export type ExportDestKind = (typeof EXPORT_DEST_KINDS)[number];

export interface ExportVerdict {
  allowed: boolean;
  /** Quyền BỔ SUNG mà người xuất phải có (ngoài permission nghiệp vụ của route). */
  requires: PermissionCode | null;
  /** Mã bất biến/lý do — vào thẳng thông báo lỗi và `export_log`, để tra được "vì sao chặn". */
  rule: string;
}

/**
 * [Trục C L1] TRẦN XUẤT DỮ LIỆU — bảng quyết định DUY NHẤT (mức phân loại × loại đích).
 *
 * Đặt ở @ipms/shared chứ không trong guard: FE cần biết trước để KHÔNG vẽ nút xuất mà bấm
 * vào ăn 403, và cùng một bảng phải dùng lại được ở L3 (ngoại lệ có hạn) và L5 (lưu trữ).
 *
 * Bất biến K3 nằm ở hàng `restricted`: KHÔNG có ô nào allowed — kể cả `internal_system`, kể
 * cả khi có ngoại lệ ở L3 (ngoại lệ mở được quyền ĐỌC, không mở được đường XUẤT). Hôm nay
 * không đường xuất nào trong sản phẩm mang dữ liệu `restricted` (xuất lương mang
 * `review.result` = confidential; dữ liệu lương thật nằm ở hệ nhân sự, iPMS không giữ). Khi
 * nào thực sự cần một đường như vậy thì đó là QUYẾT ĐỊNH của B1 kèm mức phân loại mới, chứ
 * không phải mặc định lọt sẵn ở đây.
 */
export function exportDecision(cls: DataClassification, dest: ExportDestKind): ExportVerdict {
  if (cls === 'restricted') {
    return {
      allowed: false, requires: null,
      rule: 'K3: dữ liệu `restricted` không rời hệ thống dưới bất kỳ hình thức nào',
    };
  }
  if (isSensitiveClass(cls)) {          // confidential
    if (dest === 'external_service') {
      return {
        allowed: false, requires: null,
        rule: 'Strategic Context §9.3: dữ liệu nhạy cảm không rời hạ tầng do NHG kiểm soát',
      };
    }
    return {
      allowed: true, requires: 'export:confidential',
      rule: 'confidential: cần quyền riêng `export:confidential` (không nằm trong vai nào)',
    };
  }
  return { allowed: true, requires: null, rule: `${cls}: trong trần cho phép` };
}

/**
 * [Trục B L4 — J11] Danh sách TƯỜNG MINH quyền được giữ khi đang đóng vai (chỉ đọc
 * tuyệt đối). ĐÂY LÀ WHITELIST, KHÔNG PHẢI BLACKLIST theo suy diễn hậu tố (":write",
 * ":approve"…): một số quyền GHI không theo quy ước hậu tố đó (`task:feedback` là nộp góp
 * ý — mutation; `ai:invoke`/`ai:assist`/`ai:eval` gọi LLM thật — có phí + tác dụng phụ dù
 * tên không có hậu tố ghi). Danh sách này PHẢI khai TƯỜNG MINH từng permission — permission
 * MỚI thêm vào catalog ở trên mặc định KHÔNG có ở đây cho tới khi ai đó chủ động thêm vào
 * (đối lập blacklist theo pattern: blacklist hở ngay lần thêm permission tiếp theo không
 * khớp pattern cũ — đã là bài học từ chính rbac-matrix.spec.ts của trục này).
 * Test đóng đinh: `impersonation-whitelist.spec.ts`.
 */
// [F187 — Reviewer đối kháng, MAJOR] KHÔNG có 'audit:read' ở đây dù nó kết thúc bằng ':read'.
// J3 cấm tenant_admin đọc vết kiểm toán CỦA CHÍNH MÌNH — nếu whitelist này giữ audit:read,
// tenant_admin đóng vai auditor@ (người CÓ audit:read) sẽ lách được đúng cái cấm đó qua
// impersonation, biến J11 (đọc-thôi khi đóng vai) thành đường vòng phá J3. Whitelist đọc-thôi
// không có nghĩa "mọi quyền :read" — vẫn phải xét TỪNG quyền có nên lộ qua kênh này không.
export const IMPERSONATION_READ_WHITELIST: readonly PermissionCode[] = [
  'tenant:read', 'org:read', 'person:read', 'user:read', 'role:read',
  'flag:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'evidence:read',
  'checkin:read', 'review:read', 'config:read', 'taskcell:read', 'taskdict:read',
  'tenant.config:read', 'settings.self:read', 'access.self:read', 'notify.self:read',
  // [Trục C L0] tra sổ đăng ký dữ liệu — chỉ đọc, an toàn trong phiên đóng vai
  'datacatalog:read',
];

/** JWT claims chuẩn nội bộ — map sẵn theo Entra ID để cắm SSO sau. */
export interface IpmsJwtClaims {
  sub: string;          // app_user.id — TRONG phiên đóng vai: là TARGET (quyền tính theo người này)
  tid: string;          // tenant.id (Entra: tenant id — ở đây là iPMS tenant)
  oid?: string;         // Entra object id (khi có SSO)
  email: string;
  person_id?: string;
  // [Trục B L4 — J13] Danh tính kép khi đang đóng vai: `act` = actor THẬT (app_user.id),
  // tách khỏi `sub` = người đang bị đóng vai. `imp_sid` = impersonation_session.id — khoá
  // để endpoint thoát phiên định danh ĐÚNG phiên cần kết thúc mà không cần targetUserId.
  act?: string;
  imp_sid?: string;
  iat?: number;
  exp?: number;
}

/** Error model chuẩn TDD §8.2 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
    trace_id?: string;
  };
}

export const ORG_LEVELS = ['group', 'bu', 'department', 'team'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

export const PERSON_STATUSES = ['active', 'leave', 'terminated'] as const;
