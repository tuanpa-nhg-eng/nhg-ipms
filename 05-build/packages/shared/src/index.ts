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
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

export type ScopeType = 'tenant' | 'org_unit' | 'self';

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
