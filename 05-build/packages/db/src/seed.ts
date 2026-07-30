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

const prisma = new PrismaClient(); // DATABASE_URL = owner

// Catalog permission Phase 0 (mở rộng dần theo TDD §8.3)
const PERMISSIONS = [
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
  // Phase 3 lát 4f — BU Authoring Gate (Spec_BU_Authoring_Gate §4 + §6.5)
  'taskcell:author', 'kpi:propose',
  'library:submit', 'library:curate', 'library:publish', 'library:deprecate',
  'library:import', 'library:import:canonical',
  // Phase 3 lát 4j–4k — Từ điển Tác vụ hoàn thiện (Spec Task Dictionary §5)
  'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
  // Go-live Từ điển Tác vụ — tra cứu canonical toàn hàng (read-only, mọi persona)
  'taskdict:read',
  // AI inline assist — gợi ý inline (chỉ đọc + đẻ ai_suggestion PENDING); tách khỏi ai:invoke
  'ai:assist',
  // [Learning Loop L1] duyệt golden case từ tín hiệu học — SoD trên thước đo
  'ai:eval:curate',
  // [Trục B L0] Quản trị tenant (tầng ②) + tuỳ chọn cá nhân (tầng ③).
  // Đồng bộ với packages/shared/src/index.ts — rbac-matrix.spec đóng đinh hai catalog khớp nhau.
  'user:invite', 'user:deactivate',
  'role:read', 'role:revoke',
  'orgunit:update', 'orgunit:archive',
  'tenant.config:read', 'tenant.config:update',
  'settings.self:read', 'settings.self:update',
  'access.self:read',
  'notify.self:read', 'notify.self:update',
  // [Trục B L4] Impersonation chỉ-đọc — cấp cho tenant_admin, KHÔNG org_admin.
  'user:impersonate',
  // [Trục C L0] Sổ đăng ký dữ liệu — ':read' cho vai quản trị, ':write' CHỈ data_steward.
  'datacatalog:read', 'datacatalog:write',
  // [Trục C L1] Kiểm soát xuất dữ liệu — 'export:confidential' KHÔNG cấp cho vai nào (quyết
  // định của B1 trên từng người); 'exportlog:read' chỉ auditor ở L1, platform_admin ở L2.
  'export:confidential', 'exportlog:read',
];

// ⚠️ NỢ KỸ THUẬT (phát hiện khi làm trục C L0): danh sách trên là BẢN SAO TAY của
// `PERMISSIONS` trong `packages/shared/src/index.ts`. Thêm quyền mà quên một trong hai chỗ
// thì seed ném `permissionId: undefined` ở bước 2 — thông báo lỗi KHÔNG chỉ ra quyền nào
// thiếu, phải dò tay (đã mất một vòng khi thêm datacatalog:*). Nên nhập một mối: seed
// import thẳng từ @ipms/shared. Không làm trong L0 để không trộn refactor vào lát này.
//
// [L1 — trả tiền lần hai, VẪN CHƯA GỘP] Thêm export:confidential + exportlog:read phải sửa
// đúng hai chỗ lần nữa. Không gộp ở L1 vì `packages/db` HIỆN KHÔNG phụ thuộc `@ipms/shared`
// — gộp là thêm một cạnh vào đồ thị build workspace (ảnh hưởng thứ tự prisma generate),
// không phải sửa một dòng import. Việc đó xứng đáng một lát riêng có chạy full suite cho
// mục đích đó, không nhét vào lát export control.

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
  auditor: ['tenant:read', 'audit:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'exportlog:read'],
  exec_viewer: ['tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read'],
  // [Trục C L0] Chủ dữ liệu — B3 (nền tảng, nhật ký) + B5 (tuân thủ). Vai DUY NHẤT được
  // sửa sổ đăng ký dữ liệu. Không kèm quyền nghiệp vụ nào: sổ này quyết định dữ liệu được
  // xử lý thế nào, nên người giữ nó không nên đồng thời là người xử lý dữ liệu đó.
  data_steward: ['tenant:read', 'org:read', 'datacatalog:read', 'datacatalog:write'],
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
