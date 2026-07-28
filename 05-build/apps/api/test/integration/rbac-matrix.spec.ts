/**
 * Integration [Trục B — L0] Ma trận role→permission ĐÓNG ĐINH (bất biến J2: không god-account).
 *
 * Vì sao đọc từ DB chứ không từ khai báo trong seed.ts: cái có hiệu lực lúc chạy là hàng
 * trong `role_permission`, không phải mảng trong mã nguồn. Seed dùng upsert (chỉ THÊM) nên
 * một DB đã seed từ trước hoàn toàn có thể vẫn giữ god-account trong khi mã nguồn trông
 * đã sạch — đúng loại sai lệch mà test đọc-khai-báo không bao giờ bắt được.
 *
 * Thêm/bớt quyền của bất kỳ role toàn cục nào sẽ làm ĐỎ test này. Đó là chủ đích: mọi thay
 * đổi quyền phải là một chỉnh sửa TƯỜNG MINH có người rà, không phải hệ quả phụ của việc
 * thêm một permission mới vào catalog.
 */
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { PERMISSIONS } from '@ipms/shared';

jest.setTimeout(120_000);

/** Quyền cá nhân — mọi role đều có; liệt kê riêng cho gọn bảng snapshot bên dưới. */
const SELF = [
  'access.self:read',
  'notify.self:read', 'notify.self:update',
  'settings.self:read', 'settings.self:update',
  'taskdict:read',
];

/**
 * SNAPSHOT — nguồn đối chiếu duy nhất. Không sinh ra từ seed (nếu sinh ra từ chính thứ
 * đang kiểm thì test chỉ chứng minh "seed bằng chính nó").
 */
const EXPECTED: Record<string, string[]> = {
  employee: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write',
    'checkin:read', 'checkin:write', 'review:read', 'review:write', 'task:feedback',
  ],
  manager: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write', 'evidence:verify',
    'checkin:read', 'checkin:write', 'checkin:review', 'review:read', 'review:write',
    'rating:approve', 'task:feedback',
  ],
  hrbp: [
    'tenant:read', 'org:read', 'org:write', 'person:read', 'person:write', 'user:read',
    'kpi:read', 'kpi:write', 'kpi:approve', 'scorecard:read', 'scorecard:write',
    'strategy:read', 'strategy:write', 'goal:read', 'goal:write',
    'evidence:read', 'evidence:write', 'evidence:verify', 'integration:run',
    'checkin:read', 'checkin:review', 'review:read', 'review:write', 'review:manage',
    'calibration:run', 'payroll:export',
  ],
  // [J2] Đây là hàng quan trọng nhất của cả trục B: tenant_admin quản trị NGƯỜI + CƠ CẤU
  // + CẤU HÌNH ĐƠN VỊ, cộng quyền ĐỌC. Không một quyền ghi nghiệp vụ nào.
  tenant_admin: [
    'tenant:read',
    'user:read', 'user:write', 'user:invite', 'user:deactivate',
    'role:read', 'role:assign', 'role:revoke',
    'person:read', 'person:write',
    'org:read', 'org:write', 'orgunit:update', 'orgunit:archive',
    'tenant.config:read', 'tenant.config:update',
    'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'evidence:read',
    'checkin:read', 'review:read', 'config:read', 'taskcell:read', 'flag:read',
    'task:feedback',
    'user:impersonate',
  ],
  org_admin: [
    'tenant:read', 'org:read', 'person:read', 'person:write',
    'user:read', 'user:write',
    'role:read', 'role:assign', 'role:revoke',
    'kpi:read', 'scorecard:read', 'goal:read', 'checkin:read', 'review:read',
    'task:feedback',
  ],
  config_designer: [
    'tenant:read', 'org:read', 'person:read',
    'config:read', 'config:write', 'brand:write', 'org:design', 'derivation:run',
    'taskcell:read', 'taskcell:write', 'kpi:read', 'scorecard:read', 'flag:read',
    'process:design', 'ai:invoke', 'ai:eval', 'ai:assist',
    'integration:connect', 'integration:bind',
  ],
  config_approver: [
    'tenant:read', 'org:read', 'config:read', 'config:publish', 'scorecard:read', 'kpi:read',
  ],
  bu_author: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:author', 'kpi:propose', 'library:submit', 'library:import',
    'ai:invoke', 'ai:assist',
  ],
  library_curator: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read', 'config:read',
    'library:curate', 'library:publish', 'library:deprecate',
    'library:import', 'library:import:canonical', 'ai:assist', 'ai:eval:curate',
  ],
  staff_author: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:author', 'library:submit', 'task:feedback',
  ],
  dept_head: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
    'library:curate', 'ai:assist',
  ],
  auditor: [
    'tenant:read', 'audit:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read',
    'strategy:read', 'goal:read',
  ],
  exec_viewer: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read',
  ],
};

/** Quyền tước khỏi tenant_admin ở L0 — mỗi mục kèm vai GIỮ THAY (OWNER_DIGEST trục B L0). */
const STRIPPED_FROM_TENANT_ADMIN: Array<[string, string]> = [
  ['rating:approve', 'manager / hrbp'],
  ['payroll:export', 'hrbp'],
  ['calibration:run', 'hrbp'],
  ['review:write', 'employee / manager'],
  ['review:manage', 'hrbp'],
  ['checkin:review', 'manager / hrbp'],
  ['checkin:write', 'employee'],
  ['evidence:verify', 'manager / hrbp'],
  ['evidence:write', 'employee'],
  ['goal:write', 'employee / manager'],
  ['kpi:write', 'hrbp'],
  ['kpi:approve', 'hrbp'],
  ['scorecard:write', 'hrbp'],
  ['strategy:write', 'hrbp'],
  ['config:write', 'config_designer'],
  ['config:publish', 'config_approver'],
  ['brand:write', 'config_designer'],
  ['org:design', 'config_designer'],
  ['derivation:run', 'config_designer'],
  ['process:design', 'config_designer'],
  ['taskcell:write', 'config_designer'],
  ['taskcell:author', 'bu_author / staff_author'],
  ['taskcell:delegate', 'dept_head'],
  ['taskcell:approve', 'dept_head'],
  ['task:reopen', 'dept_head'],
  ['kpi:propose', 'bu_author'],
  ['library:submit', 'bu_author'],
  ['library:curate', 'library_curator / dept_head'],
  ['library:publish', 'library_curator'],
  ['library:deprecate', 'library_curator'],
  ['library:import', 'bu_author / library_curator'],
  ['library:import:canonical', 'library_curator'],
  ['integration:run', 'hrbp'],
  ['integration:connect', 'config_designer'],
  ['integration:bind', 'config_designer'],
  ['ai:invoke', 'config_designer / bu_author'],
  ['ai:eval', 'config_designer'],
  ['ai:assist', 'config_designer / bu_author / library_curator / dept_head'],
  ['ai:eval:curate', 'library_curator'],
  ['flag:write', 'KHÔNG AI — tầng ① Platform Admin, lộ trình B1'],
  ['audit:read', 'auditor (J3 — quản trị không đọc vết của chính mình)'],
];

describe('[Trục B L0] Ma trận role→permission — J2 không god-account', () => {
  let owner: PrismaClient;
  let actual: Record<string, Set<string>> = {};

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    const roles = await owner.role.findMany({
      where: { tenantId: null },
      include: { rolePermissions: { include: { permission: true } } },
    });
    for (const r of roles) {
      actual[r.code] = new Set(r.rolePermissions.map((rp) => rp.permission.code));
    }
  });

  afterAll(async () => { await owner.$disconnect(); });

  it('có đủ role toàn cục mong đợi, không thừa role lạ', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  describe.each(Object.keys(EXPECTED))('role %s', (code) => {
    it('khớp CHÍNH XÁC snapshot (không thừa, không thiếu)', () => {
      const expected = [...new Set([...EXPECTED[code], ...SELF])].sort();
      expect(actual[code]).toBeDefined();
      expect([...actual[code]].sort()).toEqual(expected);
    });
  });

  it('[J2] tenant_admin KHÔNG còn giữ bất kỳ quyền nào đã tước — có vai giữ thay', () => {
    expect(STRIPPED_FROM_TENANT_ADMIN.length).toBeGreaterThan(0);
    const stillHeld = STRIPPED_FROM_TENANT_ADMIN
      .filter(([p]) => actual['tenant_admin'].has(p))
      .map(([p]) => p);
    expect(stillHeld).toEqual([]);
  });

  it('[J2] mỗi quyền đã tước vẫn có ít nhất một role khác giữ — trừ các mục ghi rõ KHÔNG AI', () => {
    const orphans: string[] = [];
    for (const [perm, holder] of STRIPPED_FROM_TENANT_ADMIN) {
      if (holder.startsWith('KHÔNG AI')) continue;
      const holders = Object.entries(actual).filter(([, ps]) => ps.has(perm)).map(([r]) => r);
      if (holders.length === 0) orphans.push(perm);
    }
    // Tước quyền mà không giao lại = làm chết tính năng một cách âm thầm.
    expect(orphans).toEqual([]);
  });

  it('[J3] KHÔNG role nào ngoài auditor giữ audit:read', () => {
    const holders = Object.entries(actual).filter(([, ps]) => ps.has('audit:read')).map(([r]) => r);
    expect(holders).toEqual(['auditor']);
  });

  /**
   * Hệ có HAI loại SoD, và trộn hai loại vào một test là cách chắc chắn để người sau
   * "sửa cho xanh" bằng cách tước một quyền hoàn toàn hợp lệ:
   *
   * ① SoD cấp ROLE — không ai được giữ cả hai vế, vì chỉ cần giữ là đã sai. Kiểm ở đây.
   * ② SoD cấp BẢN GHI — giữ cả hai vế là bình thường và cần thiết (trưởng phòng PHẢI vừa
   *    viết đánh giá vừa duyệt hạng — cho cấp dưới), cái bị cấm là làm cả hai TRÊN CÙNG
   *    MỘT đối tượng. Thực thi ở service, không ở ma trận quyền:
   *      - review:write ⟂ rating:approve  → review.service.ts (F26/F30: không tự chấm mình)
   *      - ai:assist ⟂ ai:eval:curate     → golden.service.ts (F166: không tự duyệt tín hiệu
   *        của chính mình, chặn cả admin, fail-closed khi thiếu actor)
   *    Hành vi hai cặp này đã có spec riêng (review-loop.spec, ai-golden.spec) — không kiểm lại ở đây.
   */
  it('[J2] không role nào giữ đồng thời hai vế của một cặp SoD CẤP ROLE', () => {
    const SOD_PAIRS: Array<[string, string]> = [
      ['config:write', 'config:publish'],
      ['library:submit', 'library:publish'],
      ['taskcell:author', 'taskcell:approve'],
    ];
    const violations: string[] = [];
    for (const [a, b] of SOD_PAIRS) {
      for (const [role, ps] of Object.entries(actual)) {
        if (ps.has(a) && ps.has(b)) violations.push(`${role}: ${a} + ${b}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('[J2] không role nào giữ audit:read cùng bất kỳ quyền GHI nào', () => {
    // Quyền `*.self:*` là ghi trên CHÍNH MÌNH (đổi ngôn ngữ, bật/tắt thông báo) — mọi role
    // đều có, kể cả auditor. Coi chúng là "quyền ghi" thì bất biến này vô nghĩa.
    const isWrite = (p: string) =>
      !p.includes('.self:')
      && (/:(write|approve|publish|verify|export|assign|revoke|invite|deactivate|curate|import|reopen|run|bind|connect|delegate|propose|submit|design|update|archive|impersonate)$/.test(p)
        || p === 'library:import:canonical');
    const violations: string[] = [];
    for (const [role, ps] of Object.entries(actual)) {
      if (!ps.has('audit:read')) continue;
      const writes = [...ps].filter(isWrite);
      if (writes.length) violations.push(`${role}: ${writes.join(', ')}`);
    }
    expect(violations).toEqual([]);
  });

  it('catalog @ipms/shared và bảng permission trong DB khớp nhau (chống drift 2 nguồn)', async () => {
    const rows = await owner.permission.findMany({ select: { code: true } });
    const inDb = rows.map((r) => r.code).sort();
    expect(inDb).toEqual([...PERMISSIONS].sort());
  });

  it('mọi quyền trong snapshot đều tồn tại trong catalog (bắt lỗi gõ sai)', () => {
    const known = new Set<string>(PERMISSIONS as readonly string[]);
    const unknown = [...new Set(Object.values(EXPECTED).flat().concat(SELF))]
      .filter((p) => !known.has(p));
    expect(unknown).toEqual([]);
  });
});
