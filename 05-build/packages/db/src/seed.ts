/**
 * Seed Phase 0 — chạy bằng OWNER connection (bypass RLS như table owner).
 * Tạo: catalog permission + role toàn cục · tenant H.01 (pilot) · tenant T2 (test cô lập)
 * · org unit · person · app_user admin mỗi tenant.
 * Idempotent: upsert theo khóa tự nhiên.
 */
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { KPI_DICTIONARY } from './kpi-dictionary.data';
import { KPI_DICTIONARY_EXT } from './kpi-dictionary-ext.data';
// [Trục D L0] Danh bạ agent — hằng số tách riêng để unit test đọc thẳng, không cần DB.
import { GLOBAL_AI_AGENTS } from './ai-agent-directory.data';

const prisma = new PrismaClient(); // DATABASE_URL = owner

/**
 * [Trục C L3 — NỢ KỸ THUẬT ĐÃ TRẢ] Catalog permission nhập MỘT MỐI với `@ipms/shared`.
 *
 * Trước lát này, đây là một BẢN SAO TAY của `PERMISSIONS` trong `packages/shared/src/index.ts`.
 * Nó đã cắn ĐÚNG BA LẦN — `datacatalog:*` (L0), `export:confidential`+`exportlog:read` (L1),
 * `exception:*` (L3) — và mỗi lần đều theo cùng một kịch bản: seed ném
 * `Argument `permissionId` is missing` KHÔNG kèm tên quyền nào, phải dò tay để biết đã quên gì.
 *
 * Hai lần trước hoãn với lý do "gộp là thêm một cạnh vào đồ thị build, xứng một lát riêng".
 * Cạnh đó hoá ra là: một dòng `"@ipms/shared": "workspace:*"` trong package.json + một dòng
 * import — pnpm tự xếp thứ tự build theo phụ thuộc, `prisma generate` không liên quan (nó
 * sinh `@prisma/client`, không đọc file này). Cái giá thật của việc hoãn lớn hơn cái giá của
 * việc làm, và đó chính là lý do ghi lại con số ba lần ở đây.
 */
import { PERMISSIONS, EXCEPTION_GRANTABLE_PERMISSIONS, SUPPORT_ROLE_PERMISSIONS } from '@ipms/shared';

// [Trục B L0] Quyền cá nhân — MỌI role đều có (đúng khuôn taskdict:read đã dùng ở Go-live Từ điển).
const SELF_PERMISSIONS = [
  'settings.self:read', 'settings.self:update',
  'access.self:read',
  'notify.self:read', 'notify.self:update',
];

// Role toàn cục (tenant_id = null) + permission mặc định
const GLOBAL_ROLES: Record<string, string[]> = {
  employee: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write',
    'checkin:read', 'checkin:write', 'review:read', 'review:write',
    // [4k] "mọi người dùng" góp ý tác vụ active (Spec Task Dictionary §5).
    // KHÔNG cấp taskcell:read (đó là API Config Studio version-scoped — lộ draft);
    // đọc từ điển + lịch sử phiên bản đi qua taskdict:read (đã cấp mọi role).
    'task:feedback',
  ],
  manager: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write', 'evidence:verify',
    'checkin:read', 'checkin:write', 'checkin:review', 'review:read', 'review:write', 'rating:approve',
    'task:feedback', // [4k] mọi người dùng góp ý tác vụ active
  ],
  hrbp: [
    'tenant:read', 'org:read', 'org:write', 'person:read', 'person:write', 'user:read',
    'kpi:read', 'kpi:write', 'kpi:approve', 'scorecard:read', 'scorecard:write',
    'strategy:read', 'strategy:write', 'goal:read', 'goal:write',
    'evidence:read', 'evidence:write', 'evidence:verify', 'integration:run',
    'checkin:read', 'checkin:review', 'review:read', 'review:write', 'review:manage',
    'calibration:run', 'payroll:export',
    // [F186 — Reviewer đối kháng] `/hr/policy` (SPA đã có sẵn) đọc qua `GET /policies`,
    // đòi `config:read` — hrbp trước đây KHÔNG có, bấm vào ăn 403. Chỉ thêm quyền ĐỌC
    // (cùng lý do tenant_admin đã có config:read: "đọc rộng để hỗ trợ" — không kèm
    // config:write/config:publish, SoD designer/approver giữ nguyên).
    'config:read',
  ],
  // [Trục B L0 — J2] tenant_admin LIỆT KÊ TƯỜNG MINH. Trước đây là
  // `PERMISSIONS.filter((p) => p !== 'audit:read')` — tức god-account trừ đúng một quyền:
  // admin@ finalize được đánh giá, xuất được bảng lương, publish được config, xác minh được
  // bằng chứng ⇒ toàn bộ SoD dựng từ Phase 0 (F26/F30/F41/F91/F116) đi vòng qua được bằng
  // MỘT tài khoản. Nay tenant_admin = người quản trị NGƯỜI DÙNG + CƠ CẤU + CẤU HÌNH ĐƠN VỊ,
  // cộng quyền ĐỌC rộng để hỗ trợ. Không một quyền ghi nghiệp vụ nào.
  // "Ai giữ thay" từng quyền bị tước: xem OWNER_DIGEST mục trục B L0.
  tenant_admin: [
    'tenant:read',
    // quản trị người dùng & vai trò
    'user:read', 'user:write', 'user:invite', 'user:deactivate',
    'role:read', 'role:assign', 'role:revoke',
    'person:read', 'person:write',
    // quản trị cơ cấu tổ chức
    'org:read', 'org:write', 'orgunit:update', 'orgunit:archive',
    // cấu hình đơn vị
    'tenant.config:read', 'tenant.config:update',
    // đọc rộng để hỗ trợ — KHÔNG kèm quyền ghi tương ứng
    'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'evidence:read',
    'checkin:read', 'review:read', 'config:read', 'taskcell:read', 'flag:read',
    // là người dùng như mọi người: góp ý tác vụ active
    'task:feedback',
    // [Trục B L4] Impersonation CHỈ ĐỌC có kiểm soát — không cần Entra, đã kéo vào phạm vi
    'user:impersonate',
    // [Trục C L3] xin + đọc đơn ngoại lệ; KHÔNG duyệt (K5 — duyệt là việc của data_steward)
    'exception:request', 'exception:read',
    // [Trục C L4 — hệ quả J1① tự bắt khi chạy full suite] `tenant_admin` KHÔNG cần đọc cờ rủi
    // ro để làm việc của mình, nhưng BẮT BUỘC phải giữ quyền này vì một lý do khác hẳn: J1①
    // cấm gán vai chứa quyền người cấp không có. `exec_viewer` vừa được thêm
    // `risk:read_summary` ⇒ nếu tenant_admin không có, nó KHÔNG onboard được người điều hành
    // nữa — mốc demo của trục B gãy vì một thay đổi ở trục C. Đây là ràng buộc chung, đáng
    // nhớ: **thêm quyền cho một vai persona thì vai onboard persona đó cũng phải có.**
    // An toàn vì đây là SỐ ĐẾM (không chi tiết, không định danh) — khác `risk:read` của B5/B0.
    'risk:read_summary',
    // KHÔNG có 'audit:read' (J3 — người quản trị không đọc vết của chính mình)
    // KHÔNG có 'flag:write' (tầng ① Platform Admin — lộ trình B1)
  ],
  // [Trục B L0] org_admin — như tenant_admin nhưng SCOPE org_unit và hẹp hơn:
  // KHÔNG tạo được tài khoản mới (chạm app_user/email đăng nhập = việc tenant-level),
  // KHÔNG đụng cơ cấu tổ chức lẫn cấu hình đơn vị.
  org_admin: [
    'tenant:read', 'org:read', 'person:read', 'person:write',
    'user:read', 'user:write',
    'role:read', 'role:assign', 'role:revoke',
    'kpi:read', 'scorecard:read', 'goal:read', 'checkin:read', 'review:read',
    'task:feedback',
  ],
  // Config Studio §12 — SoD Designer (sửa) ⟂ Approver (duyệt)
  config_designer: [
    'tenant:read', 'org:read', 'person:read',
    'config:read', 'config:write', 'brand:write', 'org:design', 'derivation:run',
    'taskcell:read', 'taskcell:write', 'kpi:read', 'scorecard:read', 'flag:read',
    'process:design',
    // lát 4a: designer dùng MCP tools + chạy eval (mock) — approver KHÔNG có (SoD giữ nguyên)
    'ai:invoke', 'ai:eval',
    'ai:assist', // AI inline (gợi ý PENDING) trong Studio
    // [Trục B L0] "AI GIỮ THAY" cho tenant_admin: đấu nối/ràng buộc integration là việc
    // CẤU HÌNH, không phải việc quản trị người dùng. Trước đây chỉ tenant_admin có
    // (qua filter god-account) nên tước đi mà không giao lại sẽ làm chết tính năng.
    'integration:connect', 'integration:bind',
  ],
  config_approver: ['tenant:read', 'org:read', 'config:read', 'config:publish', 'scorecard:read', 'kpi:read'],
  // BU Authoring Gate §4 — SoD: soạn (bu_author) ⟂ duyệt/publish (library_curator)
  bu_author: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:author', 'kpi:propose', 'library:submit', 'library:import',
    'ai:invoke', // AI soạn nháp (human-in-the-loop)
    'ai:assist', // AI inline — điền nhóm A–G thiếu + gợi ý kpiRef (suggestion PENDING)
  ],
  library_curator: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read', 'config:read',
    'library:curate', 'library:publish', 'library:deprecate',
    'library:import', 'library:import:canonical',
    'ai:assist', // AI inline — tóm tắt khác biệt dedup + khuyến nghị merge/keep_both
    // [Learning Loop L1] curator giữ cổng chất lượng golden set (SoD per-candidate
    // vẫn chặn duyệt tín hiệu do CHÍNH MÌNH tạo — kể cả admin)
    'ai:eval:curate',
  ],
  // [4j] Từ điển Tác vụ §5 — SoD: nhân viên soạn (staff_author) ⟂ trưởng phòng duyệt (dept_head)
  // staff_author KHÔNG gán tay: materialize qua authoring_grant (trưởng phòng cấp, scope org_unit)
  staff_author: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:author', 'library:submit', 'task:feedback',
  ],
  dept_head: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
    'library:curate',
    'ai:assist', // AI inline — hỗ trợ duyệt/tối ưu tác vụ của phòng (suggestion PENDING)
  ],
  // [Trục C L1] `exportlog:read` — B0 đọc sổ vết xuất dữ liệu. Đặt ở auditor chứ không ở
  // tenant_admin/hrbp theo đúng tinh thần J3: người vận hành đường xuất không tự soát vết
  // xuất của mình. Là quyền ĐỌC nên không phá bất biến "auditor không giữ quyền ghi nào".
  // [Trục C L3] `exception:read` — B0 rà được MỌI đơn ngoại lệ, kể cả đơn mình không xin và
  // không duyệt. Vẫn là quyền ĐỌC ⇒ không phá bất biến "auditor không giữ quyền ghi nào".
  auditor: ['tenant:read', 'audit:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'exportlog:read', 'exception:read',
    // [Trục C L4] B0 rà cờ rủi ro + hồ sơ sự cố. Vẫn thuần ĐỌC — auditor không mở/đóng sự cố
    // (đó là việc của B5 tuân thủ), đúng tinh thần "người soát không phải người xử lý".
    // [Trục C L4 — driver sống bắt] Ai đọc được CHI TIẾT thì đương nhiên đọc được SỐ ĐẾM:
    // bản tổng hợp là tập con thông tin của danh sách chi tiết. Bản đầu chỉ cấp `risk:read`
    // và `GET /risk/summary` trả 403 cho chính B5 — quyền hẹp hơn lại bị chặn ở chỗ rộng hơn
    // cho qua. Guard so từng permission một, không suy diễn bao hàm, nên quan hệ "chi tiết ⊇
    // tổng hợp" phải khai TƯỜNG MINH ở đây.
    'risk:read', 'risk:read_summary', 'incident:read',
    // [Trục C L5] B0 rà chính sách lưu trữ + sổ lượt chạy — KHÔNG đặt, KHÔNG bấm chạy.
    'retention:read'],
  // [Trục C L4] V1 (điều hành) xem BẢN TỔNG HỢP một màn: `risk:read_summary` = chỉ số đếm.
  // KHÔNG `risk:read` — điều hành cần biết "có bao nhiêu, mức nào", không cần biết ai chạm gì.
  exec_viewer: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'risk:read_summary',
  ],
  /**
   * [Trục C L1 — chủ dự án chốt 30/07: "giữ nguyên + B1 cấp cho 1–2 người"]
   *
   * Vai CHUYÊN TRÁCH chỉ mang `export:confidential`, KHÔNG gán sẵn cho ai. Vì sao phải có vai
   * này thay vì "cấp quyền lẻ cho một người": quyền chỉ đến với người QUA MỘT VAI
   * (`user_role → role_permission`) — không có bảng "quyền cấp trực tiếp", và API không có
   * đường tạo vai/gắn quyền lúc chạy. Không có vai này thì quyết định trên chỉ thực hiện được
   * bằng sửa DB tay, tức không có vết `user_role`, không có audit, không ai rà được.
   *
   * Vai này TỰ NÓ không xuất được gì: nó chỉ mở TRẦN phân loại. Muốn xuất thật vẫn phải có
   * quyền nghiệp vụ của đường xuất (`payroll:export` = hrbp). Nghĩa là gán vai này cho một
   * nhân viên thường không tạo ra người xuất dữ liệu — nó chỉ nâng trần cho người ĐÃ có
   * đường xuất. Đó là lý do nó an toàn để `tenant_admin` gán, xem allowlist trong
   * `admin-roles.service.ts`.
   */
  export_officer: ['export:confidential'],
  /**
   * [Trục C L2 — K9] Quản trị nền tảng. Danh sách này là BẢN PHẢN CHIẾU của
   * `PLATFORM_ADMIN_PERMISSIONS` khai trong `packages/shared/src/index.ts` — nguồn gốc nằm ở
   * MÃ, không ở seed (kế hoạch trục C §4 L2). `rbac-matrix.spec` đối chiếu hai bên, và
   * `PlatformService.assertWithinAllowlist` kiểm lại lúc chạy: cấp thêm quyền cho vai này
   * bằng đường nào cũng bị bắt.
   *
   * KHÔNG có `audit:read` (của auditor, giữ J3) · không một quyền ghi nghiệp vụ nào ·
   * không `datacatalog:write` (của data_steward) · không `user:*`/`role:*` (của tenant_admin —
   * B3 vận hành hạ tầng, không quản trị người của đơn vị khác).
   */
  platform_admin: [
    'tenant:list', 'tenant:create',
    'system:health', 'integration:status', 'ai:usage_read',
    'flag:read', 'flag:write',
    'exportlog:read_metadata', 'audit:read_metadata',
    // [Trục C L3] xin được ngoại lệ, KHÔNG duyệt được (K5)
    'exception:request',
    // [Trục C L4] số đếm cờ rủi ro xuyên đơn vị (đọc snapshot) — KHÔNG phải `risk:read`
    'risk:read_summary',
  ],
  /**
   * [Trục C L2b — K11] Hỗ trợ kỹ thuật. BẢN PHẢN CHIẾU của `SUPPORT_ROLE_PERMISSIONS` trong
   * `packages/shared/src/index.ts` (nguồn gốc ở MÃ, không ở seed — cùng khuôn platform_admin).
   *
   * Danh sách = whitelist chỉ-đọc của impersonation + `user:impersonate`, **SUY RA** từ
   * `SUPPORT_ROLE_PERMISSIONS` của `@ipms/shared` — không liệt kê tay.
   *
   * [Trục D L0 — NỢ TRẢ] Tới trước lát này đây là BẢN SAO TAY thứ ba của whitelist, và chú
   * thích cũ biện minh bằng *"`packages/db` không phụ thuộc `@ipms/shared`"*. Điều đó **đã hết
   * đúng từ trục C L3**, khi `PERMISSIONS` được gộp về một mối và package.json thêm
   * `"@ipms/shared": "workspace:*"` (xem chú thích ở đầu tệp). Chú thích ở lại, bản sao ở lại,
   * và `aiagent:read` của trục D làm nó cắn lần thứ tư — SÁU ca `rbac-matrix.spec` đỏ cùng lúc.
   *
   * Đúng bài học F191: **một ghi chú khẳng định sai sẽ được đọc như bằng chứng ở mọi lần sửa
   * sau.** Chú thích cũ nói "bản sao lệch sẽ đỏ ngay, không âm thầm" — đúng, nhưng "đỏ ngay"
   * không phải là an toàn, chỉ là phát hiện muộn hơn việc không có bản sao nào.
   *
   * KHÔNG một quyền ghi nghiệp vụ nào (K11) · KHÔNG `audit:read` (J3) · KHÔNG `user:write`/
   * `role:assign` — người hỗ trợ nhìn được mọi thứ người dùng nhìn, và chỉ thế. Ba tính chất
   * đó nay do CHÍNH whitelist bảo đảm, không do sự cẩn thận khi chép tay.
   */
  support: [...SUPPORT_ROLE_PERMISSIONS],
  // [Trục C L0] Chủ dữ liệu — B3 (nền tảng, nhật ký) + B5 (tuân thủ). Vai DUY NHẤT được
  // sửa sổ đăng ký dữ liệu. Không kèm quyền nghiệp vụ nào: sổ này quyết định dữ liệu được
  // xử lý thế nào, nên người giữ nó không nên đồng thời là người xử lý dữ liệu đó.
  // [Trục C L3] `exception:approve` đặt Ở ĐÂY, không ở `tenant_admin`: người duyệt một ngoại
  // lệ dữ liệu phải là người chịu trách nhiệm về dữ liệu (B5 tuân thủ), không phải người vận
  // hành cần nới. `data_steward` cũng KHÔNG có `exception:request` — vai duy nhất duyệt được
  // thì không nên đồng thời là vai xin, dù K5 đã chặn tự duyệt trên từng đơn.
  data_steward: [
    'tenant:read', 'org:read', 'datacatalog:read', 'datacatalog:write',
    'exception:approve', 'exception:read',
    // [Trục C L4] B5 tuân thủ — đọc cờ CHI TIẾT và là vai DUY NHẤT mở/đóng sự cố.
    'risk:read', 'risk:read_summary', 'incident:read', 'incident:manage',
    // [Trục C L5] Lưu trữ & xoá dữ liệu cá nhân — B5 đặt chính sách VÀ bấm chạy. Hai quyền
    // tách sẵn để sau này giao hai người mà không phải sửa mã; chốt an toàn hôm nay là bắt
    // buộc chạy thử trước, không phải phân người.
    'retention:read', 'retention:manage', 'retention:run',
    // [Trục D L0] Vai DUY NHẤT sửa được hiến chương agent. Cùng lý do đã đặt
    // `datacatalog:write` ở đây: hiến chương agent phát biểu *dữ liệu nào được đưa cho AI*,
    // nên nó là quyết định quản trị dữ liệu — không phải của người dựng agent.
    'aiagent:read', 'aiagent:write',
  ],
};

// [Go-live Từ điển Tác vụ] Tra cứu Từ điển canonical là tài nguyên tham chiếu TOÀN HÀNG
// (read-only) — MỌI vai trò đọc được. Cấp taskdict:read cho từng role một cách tường minh.
for (const perms of Object.values(GLOBAL_ROLES)) {
  if (!perms.includes('taskdict:read')) perms.push('taskdict:read');
}

// [Trục B L0] Quyền cá nhân (tuỳ chọn, thông báo, "Quyền của tôi") — cấp cho MỌI role,
// cùng khuôn taskdict:read ở trên. Không role nào phải xin để xem quyền của chính mình.
for (const perms of Object.values(GLOBAL_ROLES)) {
  for (const p of SELF_PERMISSIONS) if (!perms.includes(p)) perms.push(p);
}

// [Trục C L0] `datacatalog:read` cấp cho các vai QUẢN TRỊ + kiểm toán: trước khi xuất bất
// kỳ dữ liệu nào (L1) hay đặt thời hạn lưu trữ (L5), người ta phải tra được mức phân loại.
// KHÔNG cấp cho vai nghiệp vụ thường (employee/manager) — họ không có việc gì với sổ này.
// `datacatalog:write` KHÔNG có ở đây: chỉ data_steward, khai tường minh phía trên.
for (const r of ['tenant_admin', 'org_admin', 'auditor', 'config_designer', 'config_approver']) {
  const perms = GLOBAL_ROLES[r];
  if (perms && !perms.includes('datacatalog:read')) perms.push('datacatalog:read');
}

// [Trục D L0] `aiagent:read` — cùng tập vai với `datacatalog:read` ở trên, và cùng lý do:
// trước khi duyệt bất cứ việc gì dính AI (bật cờ, cấp ngoại lệ, soát vết), người ta phải tra
// được agent đó là ai và trần bao nhiêu. `data_steward` nhận cả `:write` (khai tường minh ở
// GLOBAL_ROLES). KHÔNG cấp cho vai nghiệp vụ thường — họ dùng AI, không quản trị nó.
//
// ⚠️ `platform_admin` CỐ Ý không có: K9 (không quyền nghiệp vụ nào). Danh bạ là tài nguyên
// cấp đơn vị; tầng nền tảng muốn số liệu AI thì đã có `ai:usage_read` (chỉ metadata).
for (const r of ['tenant_admin', 'org_admin', 'auditor', 'config_designer', 'config_approver']) {
  const perms = GLOBAL_ROLES[r];
  if (perms && !perms.includes('aiagent:read')) perms.push('aiagent:read');
}

/**
 * [Trục C L0] Sổ đăng ký dữ liệu — bản chuẩn CẤP TẬP ĐOÀN (tenant_id NULL).
 *
 * Chín nhóm lấy từ NHG Strategic Context §6 (nguồn dữ liệu gốc cần quản trị), giữ nguyên
 * chủ dữ liệu và mức phân loại đã chốt trong BRD Nền tảng §12. Đơn vị kế thừa bản này và
 * chỉ SIẾT CHẶT được (trigger data_asset_no_loosen).
 *
 * Chủ dữ liệu ghi theo KHỐI, không theo tên người.
 */
const GLOBAL_DATA_ASSETS: Array<{
  code: string; group: string; owner: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  source?: string; desc?: string; legal?: string;
}> = [
  { code: 'objective.kpi', group: 'Mục tiêu & chỉ số', owner: 'B1', classification: 'internal',
    source: 'iPMS (hệ ghi nhận)', desc: 'Cây mục tiêu OKR/KGI/KPI, công thức, định mức' },
  { code: 'task.dictionary', group: 'Tác vụ & mô tả công việc', owner: 'B1 + OpCo', classification: 'internal',
    source: 'iPMS (hệ ghi nhận)', desc: 'Từ điển Tác vụ, RACI, luồng vào–ra, chiều AI' },
  { code: 'review.result', group: 'Kết quả đánh giá cá nhân', owner: 'B1', classification: 'confidential',
    source: 'iPMS (hệ ghi nhận)', desc: 'Điểm, nhận xét, cân chỉnh, kết quả chốt kỳ',
    legal: 'Dữ liệu cá nhân — Nghị định 13' },
  { code: 'payroll.reward', group: 'Lương thưởng, kỷ luật', owner: 'B1 + B2', classification: 'restricted',
    source: 'Hệ nhân sự – tiền lương', desc: 'Bảng lương, quỹ thưởng, hồ sơ kỷ luật',
    legal: 'Dữ liệu cá nhân nhạy cảm — không đưa vào AI dưới bất kỳ hình thức nào' },
  { code: 'hr.profile', group: 'Hồ sơ nhân sự, chức danh, đơn vị', owner: 'B1', classification: 'confidential',
    source: 'Hệ nhân sự', desc: 'Danh sách nhân sự, chức danh, phòng ban, quan hệ quản lý',
    legal: 'Dữ liệu cá nhân — Nghị định 13' },
  { code: 'finance.metric', group: 'Số liệu tài chính phục vụ chỉ số', owner: 'B2', classification: 'confidential',
    source: 'Hệ tài chính – kế toán', desc: 'Doanh thu, chi phí, dòng tiền ở mức phục vụ KPI' },
  { code: 'opco.operational', group: 'Dữ liệu vận hành ngành', owner: 'OpCo', classification: 'restricted',
    source: 'Hệ nghiệp vụ của OpCo', desc: 'Tuyển sinh, học vụ, khám chữa bệnh',
    legal: 'Dữ liệu người học/người bệnh — không rời hạ tầng NHG' },
  { code: 'system.log', group: 'Nhật ký hệ thống & AI usage', owner: 'B3', classification: 'internal',
    source: 'iPMS', desc: 'Nhật ký vận hành, lượt gọi AI, chi phí' },
  { code: 'audit.log', group: 'Nhật ký kiểm toán', owner: 'B0', classification: 'confidential',
    source: 'iPMS (append-only)', desc: 'Vết mọi thao tác nhạy cảm',
    legal: 'Không đưa vào AI; thời hạn lưu trữ dài hơn dữ liệu nghiệp vụ' },
];

async function main() {
  // 1. Permission catalog
  const permIds: Record<string, string> = {};
  for (const code of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { id: uuidv7(), code },
    });
    permIds[code] = p.id;
  }

  // 2. Global roles + role_permission
  const roleIds: Record<string, string> = {};
  for (const [code, perms] of Object.entries(GLOBAL_ROLES)) {
    let role = await prisma.role.findFirst({ where: { code, tenantId: null } });
    if (!role) {
      role = await prisma.role.create({
        data: { id: uuidv7(), code, tenantId: null, nameVi: code, nameEn: code },
      });
    }
    roleIds[code] = role.id;
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permIds[p] } },
        update: {},
        create: { roleId: role.id, permissionId: permIds[p] },
      });
    }
  }

  // 2b. [Trục C L5] Chính sách lưu trữ CHUẨN TẬP ĐOÀN (tenant_id NULL).
  //
  // Ba con số dưới đây là GIẢ ĐỊNH §6 mục 2 của kế hoạch — B5 chưa chốt. Ghi vào seed thay vì
  // để trống có chủ đích: không có chính sách thì hệ rơi về mặc định suy từ mức phân loại, và
  // một con số suy diễn trông y hệt một con số đã được người có thẩm quyền duyệt. Có dòng ở
  // đây thì `source` trả về "chuẩn tập đoàn" và B5 biết chính xác cái gì đang chờ mình chốt.
  //
  // `audit.log` để `cold_archive`: đúng ý định (nhật ký kiểm toán giữ 10 năm rồi chuyển kho
  // lạnh), và CHECK constraint K6 chỉ cho phép đúng hai hành động này cho sổ giám sát. Kho
  // lạnh CHƯA tồn tại — lượt quét sẽ báo "chưa thực thi được" thay vì âm thầm không làm gì.
  const GLOBAL_RETENTION: Array<{ code: string; months: number; action: string; legal?: string }> = [
    { code: 'review.result', months: 60, action: 'anonymize',
      legal: 'NĐ13 — dữ liệu cá nhân; giữ số liệu thống kê, khử phần văn bản nhận dạng được' },
    { code: 'hr.profile', months: 60, action: 'keep',
      legal: 'NĐ13 — hồ sơ nhân sự do hệ nhân sự làm chủ, iPMS không tự xoá' },
    { code: 'system.log', months: 24, action: 'hard_delete' },
    { code: 'audit.log', months: 120, action: 'cold_archive',
      legal: 'K6 — sổ giám sát không xoá; giữ dài hơn dữ liệu nghiệp vụ' },
  ];
  for (const r of GLOBAL_RETENTION) {
    const existing = await prisma.retentionPolicy.findFirst({
      where: { tenantId: null, assetCode: r.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.retentionPolicy.create({
        data: {
          id: uuidv7(), tenantId: null, assetCode: r.code,
          retentionMonths: r.months, action: r.action, legalBasis: r.legal ?? null,
          note: 'Bản chuẩn tập đoàn — giả định §6, chờ B5 chốt',
        },
      });
    }
  }

  // 2a. [Trục C L0] Sổ đăng ký dữ liệu — bản chuẩn cấp tập đoàn. Idempotent theo `code`;
  // KHÔNG đè bản đã có (data_steward có thể đã chỉnh mô tả/ghi chú pháp lý), chỉ tạo mới.
  for (const a of GLOBAL_DATA_ASSETS) {
    const existing = await prisma.dataAsset.findFirst({
      where: { tenantId: null, code: a.code, deletedAt: null },
    });
    if (!existing) {
      await prisma.dataAsset.create({
        data: {
          id: uuidv7(), tenantId: null, code: a.code, groupName: a.group,
          ownerRole: a.owner, classification: a.classification,
          sourceSystem: a.source ?? null, description: a.desc ?? null, legalNote: a.legal ?? null,
        },
      });
    }
  }

  // 2c. [Trục D L0 · RECONCILE thêm ở L2] Danh bạ agent — bản chuẩn cấp tập đoàn.
  //
  // Chú thích cũ ở đây viết "KHÔNG đè bản đã có (data_steward có thể đã siết trần hoặc bớt
  // quyền), chỉ tạo mới" — và lý do đó SAI với chính hàng này: `data_steward` KHÔNG ghi được
  // bản chuẩn tập đoàn (`tenantId = null`, RLS chặn app ghi); chỗ họ siết là bản RIÊNG của
  // đơn vị, và bản riêng không bị khối này chạm tới.
  //
  // Hệ quả của lý do sai đó: đổi hiến chương trong mã KHÔNG có tác dụng trên bất kỳ DB nào đã
  // seed — L2 phát hiện khi sửa hiến chương `mcp` mà 3/6 tool vẫn chết. Đây ĐÚNG mẫu mà khối
  // 2b ngay bên dưới đã phải vá cho role: "upsert chỉ THÊM, không có bước này thì DB đã seed
  // trước đó vẫn giữ nguyên god-account và cả trục B chỉ đúng trên máy chạy DB sạch."
  //
  // Nay reconcile: bản chuẩn LUÔN khớp mã nguồn. Bản riêng của đơn vị không bị chạm — trigger
  // `ai_agent_no_loosen` vẫn gác mọi lần đơn vị ghi.
  for (const a of GLOBAL_AI_AGENTS) {
    const existing = await prisma.aiAgent.findFirst({
      where: { tenantId: null, code: a.code, deletedAt: null },
    });
    const fields = {
      nameVi: a.nameVi, nameEn: a.nameEn ?? null, purpose: a.purpose,
      ownerRole: a.owner, kind: a.kind, maxDataClass: a.maxDataClass,
      dataAssetCodes: a.assets, permissions: a.permissions,
      hitlMode: a.hitl, status: a.status, note: a.note ?? null,
    };
    if (existing) {
      await prisma.aiAgent.update({ where: { id: existing.id }, data: fields });
    } else {
      await prisma.aiAgent.create({
        data: { id: uuidv7(), tenantId: null, code: a.code, ...fields },
      });
    }
  }

  // 2b. [Trục B L0] RECONCILE role toàn cục: xoá mọi role_permission KHÔNG còn được khai
  // báo trong GLOBAL_ROLES. Trước đây phải liệt kê tay từng quyền cấp nhầm (khối [4k]
  // taskcell:read cho employee/manager — nay reconcile bao trùm). Cần thiết vì L0 hạ
  // tenant_admin từ ~70 quyền xuống 25: upsert chỉ THÊM, không có bước này thì DB đã seed
  // trước đó vẫn giữ nguyên god-account và cả trục B chỉ đúng trên máy chạy DB sạch.
  // CHỈ đụng role toàn cục (tenantId = null) — role riêng của tenant không bị chạm.
  for (const [code, perms] of Object.entries(GLOBAL_ROLES)) {
    const keepIds = perms.map((p) => permIds[p]);
    await prisma.rolePermission.deleteMany({
      where: { roleId: roleIds[code], permissionId: { notIn: keepIds } },
    });
  }

  // 3. Tenants
  async function seedTenant(code: string, nameVi: string, type: string) {
    const tenant = await prisma.tenant.upsert({
      where: { code },
      update: {},
      create: { id: uuidv7(), code, nameVi, nameEn: nameVi, type },
    });

    /**
     * [Trục C L3 — K4] Vai TẠM cho ngoại lệ có thời hạn: một vai cho mỗi quyền trong
     * `EXCEPTION_GRANTABLE_PERMISSIONS`, mang ĐÚNG một quyền đó.
     *
     * Dựng ở SEED chứ không lúc duyệt đơn, vì `ipms_app` cố ý không có INSERT trên `role` —
     * tầng ứng dụng không đúc ra vai (cùng họ [F1] "app chỉ ĐỌC feature_flag"). Phát hiện khi
     * chạy thật ở L3: bản đầu tạo vai lúc duyệt và ăn `permission denied for table role`.
     * Cách sửa sai là GRANT thêm cho ipms_app; cách đúng là chốt danh sách vai ở đây.
     *
     * TENANT-SCOPED, không toàn cục: `GET /admin/roles` chỉ liệt kê vai toàn cục, nên các vai
     * này KHÔNG lọt vào danh mục `tenant_admin` gán tay được — quyền nới chỉ tới người qua
     * đúng một đường: một đơn ngoại lệ đã được duyệt.
     */
    for (const p of EXCEPTION_GRANTABLE_PERMISSIONS) {
      const code_ = `exception:${p}`;
      let r = await prisma.role.findFirst({ where: { tenantId: tenant.id, code: code_ } });
      if (!r) {
        r = await prisma.role.create({
          data: {
            id: uuidv7(), tenantId: tenant.id, code: code_,
            nameVi: `Ngoại lệ có hạn — ${p}`, nameEn: `Time-boxed exception — ${p}`,
          },
        });
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: r.id, permissionId: permIds[p] } },
        update: {},
        create: { roleId: r.id, permissionId: permIds[p] },
      });
      // Vai tạm mang ĐÚNG một quyền — dọn mọi quyền thừa nếu ai đó thêm tay (đối xứng với
      // bước dọn god-account ở trên: upsert chỉ THÊM, không tự siết).
      await prisma.rolePermission.deleteMany({
        where: { roleId: r.id, permissionId: { not: permIds[p] } },
      });
    }

    const root = await prisma.orgUnit.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'ROOT' } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, code: 'ROOT',
        nameVi: `${nameVi} — Đơn vị gốc`, nameEn: `${nameVi} Root`, level: 'bu',
      },
    });

    const dept = await prisma.orgUnit.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'ADMISSIONS' } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, parentId: root.id, code: 'ADMISSIONS',
        nameVi: 'Phòng Tuyển sinh', nameEn: 'Admissions', level: 'department',
      },
    });

    const person = await prisma.person.upsert({
      where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: `${code}-ADMIN` } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, employeeCode: `${code}-ADMIN`,
        fullName: `Tenant Admin (${code})`, email: `admin@${code.toLowerCase().replace('.', '')}.nhg.local`,
        status: 'active', orgUnitId: dept.id,
      },
    });

    const user = await prisma.appUser.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: person.email! } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, personId: person.id,
        email: person.email!, status: 'active',
      },
    });

    const existing = await prisma.userRole.findFirst({
      where: { tenantId: tenant.id, appUserId: user.id, roleId: roleIds['tenant_admin'] },
    });
    if (!existing) {
      await prisma.userRole.create({
        data: {
          id: uuidv7(), tenantId: tenant.id, appUserId: user.id,
          roleId: roleIds['tenant_admin'], scopeType: 'tenant',
        },
      });
    }

    // Employee mẫu (role employee, scope SELF) — phục vụ test F6 scope enforcement
    const empPerson = await prisma.person.upsert({
      where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: `${code}-EMP1` } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, employeeCode: `${code}-EMP1`,
        fullName: `Nhân viên mẫu (${code})`,
        email: `emp1@${code.toLowerCase().replace('.', '')}.nhg.local`,
        status: 'active', orgUnitId: dept.id,
      },
    });
    const empUser = await prisma.appUser.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: empPerson.email! } },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id, personId: empPerson.id,
        email: empPerson.email!, status: 'active',
      },
    });
    const empRole = await prisma.userRole.findFirst({
      where: { tenantId: tenant.id, appUserId: empUser.id, roleId: roleIds['employee'] },
    });
    if (!empRole) {
      await prisma.userRole.create({
        data: {
          id: uuidv7(), tenantId: tenant.id, appUserId: empUser.id,
          roleId: roleIds['employee'], scopeType: 'self',
        },
      });
    }

    // Config Studio: Designer + Approver (SoD — 2 người khác nhau)
    async function seedStudioUser(
      prefix: string, roleCode: string,
      scope: { scopeType: string; scopeId?: string } = { scopeType: 'tenant' },
      personOrgUnitId?: string,
    ) {
      const p = await prisma.person.upsert({
        where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: `${code}-${prefix.toUpperCase()}` } },
        update: {},
        create: {
          id: uuidv7(), tenantId: tenant.id, employeeCode: `${code}-${prefix.toUpperCase()}`,
          fullName: `${roleCode} (${code})`,
          email: `${prefix}@${code.toLowerCase().replace('.', '')}.nhg.local`,
          status: 'active', orgUnitId: personOrgUnitId ?? root.id,
        },
      });
      const u = await prisma.appUser.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: p.email! } },
        update: {},
        create: { id: uuidv7(), tenantId: tenant.id, personId: p.id, email: p.email!, status: 'active' },
      });
      const existing = await prisma.userRole.findFirst({
        where: { tenantId: tenant.id, appUserId: u.id, roleId: roleIds[roleCode] },
      });
      if (!existing) {
        await prisma.userRole.create({
          data: {
            id: uuidv7(), tenantId: tenant.id, appUserId: u.id,
            roleId: roleIds[roleCode], scopeType: scope.scopeType, scopeId: scope.scopeId,
          },
        });
      } else if (
        existing.scopeType !== scope.scopeType || (existing.scopeId ?? null) !== (scope.scopeId ?? null)
      ) {
        // [F100] scope thiết kế đổi → seed tự đồng bộ (idempotent không có nghĩa là đóng băng)
        await prisma.userRole.update({
          where: { id: existing.id },
          data: { scopeType: scope.scopeType, scopeId: scope.scopeId ?? null },
        });
      }
    }
    await seedStudioUser('designer', 'config_designer');
    await seedStudioUser('approver', 'config_approver');
    // BU Authoring Gate: author (soạn, SCOPE ORG_UNIT — spec §4) ⟂ curator (duyệt/publish)
    await seedStudioUser('author', 'bu_author', { scopeType: 'org_unit', scopeId: dept.id });
    await seedStudioUser('curator', 'library_curator');
    // [4j] Trưởng phòng — cổng ủy quyền + duyệt active của phòng (scope org_unit)
    await seedStudioUser('dept', 'dept_head', { scopeType: 'org_unit', scopeId: dept.id });

    // [Trục A — L0] Persona vòng đời hiệu suất. Trước trục này chỉ có admin@/emp1@ +
    // 5 vai Studio ⇒ 18 màn employee/manager/hr/exec/audit KHÔNG có ai đăng nhập được.
    // mgr@ để scope ORG_UNIT (chỉ phòng mình) — chính là điều kiện chứng minh bất biến
    // I1 (không đọc chéo) và I3 (SoD không tự duyệt) khi chạy E2E đa persona ở Lát 6.
    // Person của mgr@ đặt TRONG phòng (không phải root) vì checkin.review/review.manager
    // assertScope theo person.orgUnitId của người được duyệt.
    await seedStudioUser('mgr', 'manager', { scopeType: 'org_unit', scopeId: dept.id }, dept.id);
    await seedStudioUser('hr', 'hrbp');
    await seedStudioUser('exec', 'exec_viewer');
    // auditor@: giữ đúng SoD — auditor CÓ audit:read, tenant_admin KHÔNG (xem GLOBAL_ROLES).
    await seedStudioUser('auditor', 'auditor');
    // [Trục B — L0] orgadmin@ — quản trị NGƯỜI trong phạm vi MỘT phòng (scope org_unit).
    // Cần từ L0 để test ma trận chứng minh được bất biến J1② (scope cấp ⊆ scope người cấp)
    // ngay khi API quản trị lên ở L1, thay vì chỉ chứng minh trên tenant_admin scope tenant.
    // [Trục C L0] Chủ dữ liệu — vai DUY NHẤT sửa được sổ đăng ký dữ liệu.
    await seedStudioUser('steward', 'data_steward');
    /**
     * [Trục C L2b — K11] Hỗ trợ kỹ thuật. Scope TENANT có chủ đích và BẮT BUỘC: quyền
     * `user:impersonate` ở scope hẹp hơn bị J12⑤ từ chối thẳng (đóng vai một người scope
     * tenant từ một vai scope org_unit là leo thang theo chiều phạm vi).
     */
    await seedStudioUser('support', 'support');
    /**
     * [Trục C L2] Quản trị nền tảng (B3).
     *
     * Danh tính NẰM TRONG một đơn vị (H.01) dù vai là toàn hệ — có chủ đích, và không phải
     * lỗ hổng: `app_user`/`user_role` là bảng tenant-bound, nên một người "không thuộc đơn vị
     * nào" sẽ cần phá cả mô hình danh tính để dựng. Quan trọng hơn: vai này KHÔNG có một
     * quyền nghiệp vụ nào, nên ở trong H.01 cũng không đọc được dữ liệu H.01 — chính điều đó
     * là ca đối chứng mạnh nhất của K9 (`platform@` bị 403 ở mọi endpoint nghiệp vụ của đúng
     * đơn vị chứa nó). Xuyên đơn vị đến từ read model + GUC, không từ chỗ danh tính nằm.
     */
    if (code === 'H.01') await seedStudioUser('platform', 'platform_admin');
    await seedStudioUser('orgadmin', 'org_admin', { scopeType: 'org_unit', scopeId: dept.id }, dept.id);

    // [F53] SoD mặc định fail-closed: config:write ⟂ config:publish
    // (tenant muốn tắt → soft-delete rule; mặc định KHÔNG ai vừa sửa vừa publish)
    await prisma.sodRule.upsert({
      where: {
        tenantId_permissionA_permissionB: {
          tenantId: tenant.id, permissionA: 'config:write', permissionB: 'config:publish',
        },
      },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id,
        permissionA: 'config:write', permissionB: 'config:publish',
        severity: 'high', note: 'SoD mặc định — tách vai Designer/Approver',
      },
    });
    // [4f] SoD mặc định BU Authoring — soạn ⟂ publish thư viện (Spec §4)
    await prisma.sodRule.upsert({
      where: {
        tenantId_permissionA_permissionB: {
          tenantId: tenant.id, permissionA: 'taskcell:author', permissionB: 'library:publish',
        },
      },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id,
        permissionA: 'taskcell:author', permissionB: 'library:publish',
        severity: 'high', note: 'SoD mặc định — BU Author ⟂ Library Curator',
      },
    });
    // [4j] SoD mặc định Từ điển Tác vụ §5 — người soạn ⟂ người duyệt active
    await prisma.sodRule.upsert({
      where: {
        tenantId_permissionA_permissionB: {
          tenantId: tenant.id, permissionA: 'taskcell:author', permissionB: 'taskcell:approve',
        },
      },
      update: {},
      create: {
        id: uuidv7(), tenantId: tenant.id,
        permissionA: 'taskcell:author', permissionB: 'taskcell:approve',
        severity: 'high', note: 'SoD mặc định — nhân viên soạn ⟂ trưởng phòng duyệt active',
      },
    });

    // [4h] Từ điển KPI chuẩn (20 metric Semantic Dictionary) — nguồn tham chiếu BẮT BUỘC.
    // Mọi task_cell active/canonical phải gắn kpiRef ∈ danh sách này (Q1 CHẶN CỨNG).
    // [G2] + Từ điển mở rộng FIN-EXT (ĐỀ XUẤT harvest từ Dashboard v2 — B1 hiệu chỉnh
    // trực tiếp kpi-dictionary-ext.data.ts; D3 15/07/2026).
    for (const k of [...KPI_DICTIONARY, ...KPI_DICTIONARY_EXT]) {
      const found = await prisma.kpiTemplate.findFirst({
        where: { tenantId: tenant.id, code: k.code },
      });
      const data = {
        nameVi: k.nameVi, method: 'system', direction: 'forward',
        frequency: 'quarterly', domain: k.domain,
        definition: k.definition, grain: k.grain,
        dataClassification: k.dataClassification, aiBoundary: k.aiBoundary,
        sourceSystem: k.sourceSystem,
        origin: 'library', libScope: 'tenant', isDictionary: true,
      };
      if (found) {
        await prisma.kpiTemplate.update({ where: { id: found.id }, data });
      } else {
        await prisma.kpiTemplate.create({
          data: { id: uuidv7(), tenantId: tenant.id, code: k.code, ...data },
        });
      }
    }
    return tenant;
  }

  const h01 = await seedTenant('H.01', 'NHG H.01 (Pilot)', 'opco');
  const t2 = await seedTenant('T2.TEST', 'Tenant kiểm thử cô lập', 'opco');

  // 4. Feature flags mặc định (global, tắt)
  // ai_gateway_live = OFF ⇒ ai-gateway luôn dùng MockLlmClient (RED-LINE: không gọi API thật)
  for (const key of ['config_studio', 'ai_gateway', 'integration_hub', 'ai_gateway_live']) {
    const found = await prisma.featureFlag.findFirst({ where: { tenantId: null, key } });
    if (!found) {
      await prisma.featureFlag.create({ data: { id: uuidv7(), tenantId: null, key, enabled: false } });
    }
  }

  // 4b. [Learning Loop L2] Launch bar mặc định per agent inline (AI-Native PRD §14) —
  // ngưỡng eval là điều kiện CẦN để cân nhắc bật live. B1/chủ dự án hiệu chỉnh sau.
  const INLINE_AGENTS = [
    'inline.taskcell.draft', 'inline.taskcell.kpi_link', 'inline.derivation.rule', 'inline.curation.dedup',
  ];
  for (const tenant of [h01, t2]) {
    for (const agent of INLINE_AGENTS) {
      const found = await prisma.aiLaunchBar.findFirst({ where: { tenantId: tenant.id, agent } });
      if (!found) {
        await prisma.aiLaunchBar.create({
          data: {
            id: uuidv7(), tenantId: tenant.id, agent,
            minPassRate: 0.85, minCases: 5,
            note: 'Mặc định L2 — hiệu chỉnh ngưỡng trước khi cân nhắc bật live (đo trên model thật, không phải mock)',
          },
        });
      }
    }
  }

  // 4c. [Learning Loop L3] Bảng giá model GLOBAL (unit economics PRD §16) —
  // giá niêm yết Anthropic per 1M token (nguồn: skill claude-api, cached 2026-06-24).
  // App CHỈ ĐỌC; cập nhật giá = sửa đây + chạy lại seed (idempotent upsert theo model).
  const MODEL_PRICES: Array<{ model: string; inp: number; out: number; note?: string }> = [
    { model: 'mock', inp: 0, out: 0, note: 'MockLlmClient — RED-LINE dev, không chi phí' },
    { model: 'claude-haiku-4-5', inp: 1.0, out: 5.0 },
    { model: 'claude-sonnet-5', inp: 3.0, out: 15.0, note: 'Giá intro $2/$10 tới 31/08/2026' },
    { model: 'claude-opus-4-8', inp: 5.0, out: 25.0, note: 'Model mặc định registry Copilot' },
    { model: 'claude-fable-5', inp: 10.0, out: 50.0 },
  ];
  for (const p of MODEL_PRICES) {
    const found = await prisma.aiModelPrice.findFirst({
      where: { tenantId: null, model: p.model, deletedAt: null },
    });
    const data = {
      inputUsdPerMTok: p.inp, outputUsdPerMTok: p.out,
      note: p.note ?? null, asOf: '2026-06-24',
    };
    if (found) {
      await prisma.aiModelPrice.update({ where: { id: found.id }, data });
    } else {
      await prisma.aiModelPrice.create({
        data: { id: uuidv7(), tenantId: null, model: p.model, ...data },
      });
    }
  }

  // 5. MCP tool catalog global (Spec Config Studio §9) — read-only + propose (HITL)
  const MCP_TOOLS: Array<{
    name: string; descriptionVi: string; scopePermission: string; readOnly: boolean;
    inputSchema: Record<string, unknown>;
  }> = [
    { name: 'ipms.get_org', descriptionVi: 'Đọc cây cơ cấu tổ chức của tenant',
      scopePermission: 'org:read', readOnly: true,
      inputSchema: { type: 'object', properties: {} } },
    { name: 'ipms.get_kpi', descriptionVi: 'Đọc danh mục KPI (KPI Dictionary)',
      scopePermission: 'kpi:read', readOnly: true,
      inputSchema: { type: 'object', properties: { status: { type: 'string' } } } },
    { name: 'ipms.get_scorecard', descriptionVi: 'Đọc scorecard + items',
      scopePermission: 'scorecard:read', readOnly: true,
      inputSchema: { type: 'object', properties: { scorecardId: { type: 'string' } } } },
    { name: 'ipms.get_task_dictionary', descriptionVi: 'Đọc Từ điển Tác vụ (Task Cell)',
      scopePermission: 'taskcell:read', readOnly: true,
      inputSchema: { type: 'object', properties: { configVersionId: { type: 'string' } } } },
    { name: 'ipms.propose_org_change', descriptionVi:
        'Đề xuất thay đổi cơ cấu tổ chức — tạo ai_suggestion chờ người duyệt (KHÔNG tự ghi)',
      scopePermission: 'config:write', readOnly: false,
      inputSchema: { type: 'object', required: ['proposal'],
        properties: { configVersionId: { type: 'string' }, proposal: { type: 'object' }, reason: { type: 'string' } } } },
    { name: 'ipms.propose_derivation_rule', descriptionVi:
        'Đề xuất derivation rule (kéo theo KPI) — tạo ai_suggestion chờ người duyệt',
      scopePermission: 'config:write', readOnly: false,
      inputSchema: { type: 'object', required: ['proposal'],
        properties: { configVersionId: { type: 'string' }, proposal: { type: 'object' }, reason: { type: 'string' } } } },
  ];
  for (const t of MCP_TOOLS) {
    const found = await prisma.mcpTool.findFirst({ where: { tenantId: null, name: t.name } });
    if (!found) {
      await prisma.mcpTool.create({
        data: {
          id: uuidv7(), tenantId: null, name: t.name, descriptionVi: t.descriptionVi,
          inputSchema: t.inputSchema as any, scopePermission: t.scopePermission,
          readOnly: t.readOnly, enabled: true,
        },
      });
    }
  }

  console.log(`Seed OK — tenants: ${h01.code} (${h01.id}), ${t2.code} (${t2.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
