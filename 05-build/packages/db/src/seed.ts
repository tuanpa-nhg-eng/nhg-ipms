/**
 * Seed Phase 0 — chạy bằng OWNER connection (bypass RLS như table owner).
 * Tạo: catalog permission + role toàn cục · tenant H.01 (pilot) · tenant T2 (test cô lập)
 * · org unit · person · app_user admin mỗi tenant.
 * Idempotent: upsert theo khóa tự nhiên.
 */
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

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
  auditor: ['tenant:read', 'audit:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read'],
  exec_viewer: ['tenant:read', 'org:read', 'person:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read'],
};

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
    return tenant;
  }

  const h01 = await seedTenant('H.01', 'NHG H.01 (Pilot)', 'opco');
  const t2 = await seedTenant('T2.TEST', 'Tenant kiểm thử cô lập', 'opco');

  // 4. Feature flags mặc định (global, tắt)
  for (const key of ['config_studio', 'ai_gateway', 'integration_hub']) {
    const found = await prisma.featureFlag.findFirst({ where: { tenantId: null, key } });
    if (!found) {
      await prisma.featureFlag.create({ data: { id: uuidv7(), tenantId: null, key, enabled: false } });
    }
  }

  console.log(`Seed OK — tenants: ${h01.code} (${h01.id}), ${t2.code} (${t2.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
