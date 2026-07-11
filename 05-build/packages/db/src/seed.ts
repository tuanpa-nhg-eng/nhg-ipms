/**
 * Seed Phase 0 — chạy bằng OWNER connection (bypass RLS như table owner).
 * Tạo: catalog permission + role toàn cục · tenant H.01 (pilot) · tenant T2 (test cô lập)
 * · org unit · person · app_user admin mỗi tenant.
 * Idempotent: upsert theo khóa tự nhiên.
 */
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { KPI_DICTIONARY } from './kpi-dictionary.data';

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
];

// Role toàn cục (tenant_id = null) + permission mặc định
const GLOBAL_ROLES: Record<string, string[]> = {
  employee: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write',
    'checkin:read', 'checkin:write', 'review:read', 'review:write',
  ],
  manager: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read',
    'goal:read', 'goal:write', 'evidence:read', 'evidence:write', 'evidence:verify',
    'checkin:read', 'checkin:write', 'checkin:review', 'review:read', 'review:write', 'rating:approve',
  ],
  hrbp: [
    'tenant:read', 'org:read', 'org:write', 'person:read', 'person:write', 'user:read',
    'kpi:read', 'kpi:write', 'kpi:approve', 'scorecard:read', 'scorecard:write',
    'strategy:read', 'strategy:write', 'goal:read', 'goal:write',
    'evidence:read', 'evidence:write', 'evidence:verify', 'integration:run',
    'checkin:read', 'checkin:review', 'review:read', 'review:write', 'review:manage',
    'calibration:run', 'payroll:export',
  ],
  tenant_admin: PERMISSIONS.filter((p) => p !== 'audit:read'),
  // Config Studio §12 — SoD Designer (sửa) ⟂ Approver (duyệt)
  config_designer: [
    'tenant:read', 'org:read', 'person:read',
    'config:read', 'config:write', 'brand:write', 'org:design', 'derivation:run',
    'taskcell:read', 'taskcell:write', 'kpi:read', 'scorecard:read', 'flag:read',
    'process:design',
    // lát 4a: designer dùng MCP tools + chạy eval (mock) — approver KHÔNG có (SoD giữ nguyên)
    'ai:invoke', 'ai:eval',
  ],
  config_approver: ['tenant:read', 'org:read', 'config:read', 'config:publish', 'scorecard:read', 'kpi:read'],
  // BU Authoring Gate §4 — SoD: soạn (bu_author) ⟂ duyệt/publish (library_curator)
  bu_author: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read',
    'taskcell:author', 'kpi:propose', 'library:submit', 'library:import',
    'ai:invoke', // AI soạn nháp (human-in-the-loop)
  ],
  library_curator: [
    'tenant:read', 'org:read', 'person:read', 'kpi:read', 'taskcell:read', 'config:read',
    'library:curate', 'library:publish', 'library:deprecate',
    'library:import', 'library:import:canonical',
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
  ],
  auditor: ['tenant:read', 'audit:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read'],
  exec_viewer: ['tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read'],
};

// [Go-live Từ điển Tác vụ] Tra cứu Từ điển canonical là tài nguyên tham chiếu TOÀN HÀNG
// (read-only) — MỌI vai trò đọc được. Cấp taskdict:read cho từng role một cách tường minh.
for (const perms of Object.values(GLOBAL_ROLES)) {
  if (!perms.includes('taskdict:read')) perms.push('taskdict:read');
}

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
    ) {
      const p = await prisma.person.upsert({
        where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode: `${code}-${prefix.toUpperCase()}` } },
        update: {},
        create: {
          id: uuidv7(), tenantId: tenant.id, employeeCode: `${code}-${prefix.toUpperCase()}`,
          fullName: `${roleCode} (${code})`,
          email: `${prefix}@${code.toLowerCase().replace('.', '')}.nhg.local`,
          status: 'active', orgUnitId: root.id,
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
    for (const k of KPI_DICTIONARY) {
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
