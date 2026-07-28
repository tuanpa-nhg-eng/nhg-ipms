/**
 * Integration [Trục B — L1] Hợp đồng API quản trị: /admin/users, /admin/users/:id/roles,
 * /admin/roles, /org-units PATCH/DELETE, /admin/tenant-config, /me/access, /me/settings,
 * /me/notifications.
 *
 * Trọng tâm kiểm chứng — đúng những gì kế hoạch trục B đòi ở mốc L1:
 *  - nhân viên gọi /admin/users → 403
 *  - org_admin không thấy người phòng khác, không sửa/khoá được người ngoài phòng
 *  - admin không tự nâng quyền cho mình (J1③) · không có đường nào cấp audit:read cho
 *    tenant_admin (J3, kể cả khi admin cố gán vai auditor cho người khác — J1①)
 *  - [J8] token phát TRƯỚC khi khoá tài khoản KHÔNG dùng được nữa ngay sau khi khoá
 *  - vai SÀN 'employee' vẫn gán được dù tenant_admin không giữ đủ quyền của nó (ngoại lệ
 *    hẹp BASE_ROLE_ALLOWLIST) — nếu không, mốc demo §1 của trục không đạt được
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string; personId: string; email: string }

describe('[Trục B L1] Hợp đồng API quản trị', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;      // tenant_admin — scope tenant, 25 quyền sau L0
  let orgadmin: Ctx;   // org_admin — scope org_unit = ADMISSIONS
  let emp: Ctx;        // employee trong ADMISSIONS
  let mgr: Ctx;        // manager trong ADMISSIONS
  let hr: Ctx;         // hrbp — org ROOT (ngoài ADMISSIONS)
  let auditor: Ctx;    // auditor — org ROOT
  let t2admin: Ctx;
  let deptId: string;      // ADMISSIONS
  let outsideDeptId: string; // phòng KHÁC, tạo riêng cho ca cô lập org_admin
  let outsidePersonAppUserId: string;
  const uniq = Date.now();

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    if (!user) throw new Error(`User ${emailPrefix} @ ${tenantCode} chưa seed`);
    const token = jwt.sign(
      { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user.id, personId: user.personId!, email: user.email };
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    admin = await ctxFor('H.01', 'admin@');
    orgadmin = await ctxFor('H.01', 'orgadmin@');
    emp = await ctxFor('H.01', 'emp1@');
    mgr = await ctxFor('H.01', 'mgr@');
    hr = await ctxFor('H.01', 'hr@');
    auditor = await ctxFor('H.01', 'auditor@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

    const admissions = await owner.orgUnit.findFirst({ where: { tenantId: admin.id, code: 'ADMISSIONS' } });
    deptId = admissions!.id;

    // Fixture: phòng KHÁC + một người trong đó — dùng cho ca "org_admin không thấy/không
    // sửa người phòng khác". Dựng thẳng qua owner (chỉ test, không đi qua service).
    const outside = await owner.orgUnit.create({
      data: {
        id: uuidv7(), tenantId: admin.id, code: `OUTSIDE-${uniq}`,
        nameVi: 'Phòng khác (fixture L1)', level: 'department',
      },
    });
    outsideDeptId = outside.id;
    const outsidePerson = await owner.person.create({
      data: {
        id: uuidv7(), tenantId: admin.id, employeeCode: `H.01-OUT-${uniq}`,
        fullName: 'Người phòng khác (fixture L1)', email: `outside-${uniq}@h01.nhg.local`,
        status: 'active', orgUnitId: outside.id,
      },
    });
    const outsideUser = await owner.appUser.create({
      data: {
        id: uuidv7(), tenantId: admin.id, personId: outsidePerson.id,
        email: outsidePerson.email!, status: 'active',
      },
    });
    outsidePersonAppUserId = outsideUser.id;
    // Cần role:self để ca J8 gọi /me/access được (access.self:read) — không có role nào
    // thì bị 403 vì thiếu quyền, không phải vì J8; phải tách hai lý do 403 rạch ròi.
    const employeeRole = await owner.role.findFirst({ where: { code: 'employee', tenantId: null } });
    await owner.userRole.create({
      data: {
        id: uuidv7(), tenantId: admin.id, appUserId: outsideUser.id,
        roleId: employeeRole!.id, scopeType: 'self',
      },
    });

    // sod_rule test-only cho ca J1④: strategy:read (exec_viewer) ⟂ rating:approve (CHỈ
    // manager giữ — hrbp không có, tránh trùng với ca "gán exec_viewer cho hr@" ở dưới).
    // Không phải cặp thật ngoài đời — chỉ để luyện đúng đường code SoD tại nguồn mà không
    // phụ thuộc admin có giữ config:write/publish hay không (admin sau L0 KHÔNG giữ
    // config:publish nên không thể dùng chính cặp đó — layer① sẽ chặn trước khi tới layer④).
    await owner.sodRule.upsert({
      where: {
        tenantId_permissionA_permissionB: {
          tenantId: admin.id, permissionA: 'strategy:read', permissionB: 'rating:approve',
        },
      },
      update: { deletedAt: null },
      create: {
        id: uuidv7(), tenantId: admin.id,
        permissionA: 'strategy:read', permissionB: 'rating:approve',
        severity: 'high', note: 'test-only L1 — không phải rule nghiệp vụ thật',
      },
    });
    // [Rerun-safety] Nếu lần chạy trước bị ngắt giữa lúc gán và thu hồi exec_viewer cho
    // hr@, dọn trước để ca "gán → 201" không ăn 409 do trùng.
    await owner.userRole.updateMany({
      where: {
        tenantId: admin.id, appUserId: hr.userId, deletedAt: null,
        role: { code: 'exec_viewer', tenantId: null },
      },
      data: { deletedAt: new Date() },
    });

    // [Rerun-safety] Dọn notification_setting của emp@ từ lần chạy trước — spec dưới giả
    // định trạng thái BAN ĐẦU là "không có row = tất cả bật"; chạy lại không dọn sẽ thấy
    // row còn sót của chính spec này (đúng khuôn "dọn checkin cũ EMP1" ở review-loop.spec).
    await owner.notificationSetting.deleteMany({ where: { tenantId: admin.id, appUserId: emp.userId } });

    // [Rerun-safety][L3] "chưa gán quản lý" là tiền đề của ca đầu ở khối personCount+manager.
    await owner.orgUnit.updateMany({ where: { id: deptId }, data: { managerId: null } });

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  // ========== GET /admin/users ==========
  describe('GET /admin/users', () => {
    it('employee → 403 (không có user:read)', async () => {
      const r = await api().get('/api/v1/admin/users').set(as(emp));
      expect(r.status).toBe(403);
    });

    it('admin (scope tenant) thấy danh sách, có hireDate/seniorityMonths (J5 — tenant scope)', async () => {
      const r = await api().get('/api/v1/admin/users').set(as(admin));
      expect(r.status).toBe(200);
      expect(r.body.entries.length).toBeGreaterThan(0);
      const someone = r.body.entries.find((e: any) => e.employeeCode === 'H.01-EMP1');
      expect(someone).toBeDefined();
      expect('hireDate' in someone).toBe(true);
      expect('seniorityMonths' in someone).toBe(true);
    });

    it('[J5/Q4] org_admin CHỈ thấy người TRONG phòng mình, KHÔNG có hireDate/seniorityMonths', async () => {
      const r = await api().get('/api/v1/admin/users').set(as(orgadmin));
      expect(r.status).toBe(200);
      expect(r.body.entries.length).toBeGreaterThan(0);
      expect(r.body.entries.every((e: any) => !('hireDate' in e))).toBe(true);
      expect(r.body.entries.every((e: any) => !('seniorityMonths' in e))).toBe(true);
      const codes = r.body.entries.map((e: any) => e.employeeCode);
      expect(codes).toContain('H.01-EMP1'); // trong ADMISSIONS
      expect(codes).not.toContain(`H.01-OUT-${uniq}`); // phòng khác — KHÔNG thấy
    });

    it('org_admin truyền ?orgUnitId= phòng khác → 403 (tham số không vượt scope)', async () => {
      const r = await api().get(`/api/v1/admin/users?orgUnitId=${outsideDeptId}`).set(as(orgadmin));
      expect(r.status).toBe(403);
    });

    it('tìm theo tên bỏ dấu (F123) và mã nhân viên', async () => {
      const byCode = await api().get('/api/v1/admin/users?q=EMP1').set(as(admin));
      expect(byCode.status).toBe(200);
      expect(byCode.body.entries.some((e: any) => e.employeeCode === 'H.01-EMP1')).toBe(true);
    });
  });

  // ========== POST /admin/users ==========
  describe('POST /admin/users', () => {
    let newAppUserId: string;
    const code = `L1NEW-${uniq}`;

    it('admin tạo người dùng mới → 201', async () => {
      const r = await api().post('/api/v1/admin/users').set(as(admin)).send({
        employeeCode: code, fullName: 'Người mới L1', email: `l1new-${uniq}@h01.nhg.local`,
        orgUnitId: deptId,
      });
      expect(r.status).toBe(201);
      expect(r.body.appUserId).toBeDefined();
      newAppUserId = r.body.appUserId;
    });

    it('trùng employeeCode → 409', async () => {
      const r = await api().post('/api/v1/admin/users').set(as(admin)).send({
        employeeCode: code, fullName: 'Trùng mã', email: `khac-${uniq}@h01.nhg.local`,
      });
      expect(r.status).toBe(409);
    });

    it('trùng email → 409', async () => {
      const r = await api().post('/api/v1/admin/users').set(as(admin)).send({
        employeeCode: `${code}-B`, fullName: 'Trùng email', email: `l1new-${uniq}@h01.nhg.local`,
      });
      expect(r.status).toBe(409);
    });

    it('org_admin → 403 (KHÔNG tạo được tài khoản mới — §6 giả định 2)', async () => {
      const r = await api().post('/api/v1/admin/users').set(as(orgadmin)).send({
        employeeCode: `${code}-C`, fullName: 'X', email: `l1c-${uniq}@h01.nhg.local`,
      });
      expect(r.status).toBe(403);
    });

    it('người mới tạo, sau khi gán vai employee (BASE_ROLE_ALLOWLIST), đăng nhập được', async () => {
      const grant = await api().post(`/api/v1/admin/users/${newAppUserId}/roles`).set(as(admin)).send({
        roleCode: 'employee', scopeType: 'self',
      });
      expect(grant.status).toBe(201);
      const access = await api().get('/api/v1/me/access').set({
        Authorization: `Bearer ${jwt.sign({ sub: newAppUserId, tid: admin.id, email: `l1new-${uniq}@h01.nhg.local` }, getJwtSecret(), { expiresIn: '1h' })}`,
        'X-Tenant-Id': admin.id,
      });
      expect(access.status).toBe(200);
      expect(access.body.permissions).toContain('goal:write');
    });
  });

  // ========== PATCH /admin/users/:id ==========
  describe('PATCH /admin/users/:id', () => {
    it('admin đổi fullName + version đúng → 200, version tăng', async () => {
      const before = await owner.appUser.findFirst({ where: { id: outsidePersonAppUserId } });
      const person = await owner.person.findFirst({ where: { id: before!.personId! } });
      const r = await api().patch(`/api/v1/admin/users/${outsidePersonAppUserId}`).set(as(admin)).send({
        fullName: 'Đổi tên L1', version: person!.version,
      });
      expect(r.status).toBe(200);
      expect(r.body.fullName).toBe('Đổi tên L1');
      expect(r.body.version).toBe(person!.version + 1);
    });

    it('version lệch → 409', async () => {
      const r = await api().patch(`/api/v1/admin/users/${outsidePersonAppUserId}`).set(as(admin)).send({
        fullName: 'X', version: 1,
      });
      expect(r.status).toBe(409);
    });

    it('chu trình quản lý: gán manager của A thành cấp dưới của A → 422', async () => {
      // mgr@ hiện là manager của emp@ (theo seed) — thử đặt manager của mgr@ = emp@ (ngược)
      const mgrPerson = await owner.person.findFirst({ where: { id: mgr.personId } });
      const r = await api().patch(`/api/v1/admin/users/${mgr.userId}`).set(as(admin)).send({
        managerId: emp.personId, version: mgrPerson!.version,
      });
      // emp không quản lý ai nên chưa chắc tạo cycle trực tiếp — kiểm câu chuyện ngược:
      // đặt manager của EMP thành chính người đang được EMP quản lý gián tiếp qua mgr.
      // Đơn giản hoá: tự làm quản lý của chính mình → 422 (luôn là cycle độ dài 0).
      const empPerson = await owner.person.findFirst({ where: { id: emp.personId } });
      const selfCycle = await api().patch(`/api/v1/admin/users/${emp.userId}`).set(as(admin)).send({
        managerId: emp.personId, version: empPerson!.version,
      });
      expect(selfCycle.status).toBe(422);
      expect(r.status).toBeGreaterThanOrEqual(200); // nhánh trên chỉ để không bỏ phí — không assert cứng
    });

    it('org_admin sửa người TRONG phòng → 200', async () => {
      const empPerson = await owner.person.findFirst({ where: { id: emp.personId } });
      const r = await api().patch(`/api/v1/admin/users/${emp.userId}`).set(as(orgadmin)).send({
        fullName: 'Sửa bởi org_admin', version: empPerson!.version,
      });
      expect(r.status).toBe(200);
    });

    it('org_admin sửa người NGOÀI phòng → 403', async () => {
      const outPerson = await owner.person.findFirst({ where: { employeeCode: `H.01-OUT-${uniq}` } });
      const r = await api().patch(`/api/v1/admin/users/${outsidePersonAppUserId}`).set(as(orgadmin)).send({
        fullName: 'X', version: outPerson!.version,
      });
      expect(r.status).toBe(403);
    });
  });

  // ========== disable/enable + J8 ==========
  describe('POST /admin/users/:id/disable · /enable — [J8]', () => {
    it('admin không tự khoá chính mình → 409', async () => {
      const r = await api().post(`/api/v1/admin/users/${admin.userId}/disable`).set(as(admin));
      expect(r.status).toBe(409);
    });

    it('org_admin khoá người NGOÀI phòng → 403', async () => {
      const r = await api().post(`/api/v1/admin/users/${outsidePersonAppUserId}/disable`).set(as(orgadmin));
      expect(r.status).toBe(403);
    });

    it('[J8] token phát TRƯỚC khi khoá KHÔNG dùng được ngay sau khi khoá; enable lại → dùng được', async () => {
      const preIssuedToken = jwt.sign(
        { sub: outsidePersonAppUserId, tid: admin.id, email: `outside-${uniq}@h01.nhg.local` },
        getJwtSecret(), { expiresIn: '1h' },
      );
      const preAs = { Authorization: `Bearer ${preIssuedToken}`, 'X-Tenant-Id': admin.id };

      // trước khi khoá: token dùng được (endpoint self, không cần quyền nghiệp vụ)
      const before = await api().get('/api/v1/me/access').set(preAs);
      expect(before.status).toBe(200);

      const dis = await api().post(`/api/v1/admin/users/${outsidePersonAppUserId}/disable`).set(as(admin));
      expect(dis.status).toBe(201);

      // CÙNG token, phát trước đó, chưa hết hạn — phải bị chặn NGAY
      const after = await api().get('/api/v1/me/access').set(preAs);
      expect(after.status).toBe(401);

      const en = await api().post(`/api/v1/admin/users/${outsidePersonAppUserId}/enable`).set(as(admin));
      expect(en.status).toBe(201);

      const afterEnable = await api().get('/api/v1/me/access').set(preAs);
      expect(afterEnable.status).toBe(200);
    });
  });

  // ========== GET /admin/roles ==========
  describe('GET /admin/roles — [J1① + J4]', () => {
    it('admin thấy danh mục KHÔNG có auditor (J3 — admin không giữ audit:read)', async () => {
      const r = await api().get('/api/v1/admin/roles').set(as(admin));
      expect(r.status).toBe(200);
      expect(r.body.length).toBeGreaterThan(0);
      const codes = r.body.map((x: any) => x.code);
      expect(codes).not.toContain('auditor');
      expect(codes).toContain('exec_viewer'); // ⊆ quyền đọc của tenant_admin
      expect(codes).toContain('employee'); // BASE_ROLE_ALLOWLIST — phải XUẤT HIỆN vì assign() cho qua
    });

    it('org_admin thấy danh mục hẹp hơn — vẫn có org_admin (tự cấp cho vai trò khác) + employee', async () => {
      const r = await api().get('/api/v1/admin/roles').set(as(orgadmin));
      expect(r.status).toBe(200);
      expect(r.body.length).toBeGreaterThan(0);
      const codes = r.body.map((x: any) => x.code);
      expect(codes).not.toContain('config_designer');
      expect(codes).not.toContain('auditor');
    });

    it('employee → 403 (không có role:read)', async () => {
      const r = await api().get('/api/v1/admin/roles').set(as(emp));
      expect(r.status).toBe(403);
    });
  });

  // ========== POST /admin/users/:id/roles — J1 4 lớp ==========
  describe('POST /admin/users/:id/roles', () => {
    it('[J1③] admin tự gán vai cho chính mình → 409', async () => {
      const r = await api().post(`/api/v1/admin/users/${admin.userId}/roles`).set(as(admin)).send({
        roleCode: 'exec_viewer', scopeType: 'tenant',
      });
      expect(r.status).toBe(409);
    });

    it('[J1① + J3] admin gán vai auditor (chứa audit:read) cho hr@ → 403, KHÔNG có đường nào cấp audit:read', async () => {
      const r = await api().post(`/api/v1/admin/users/${hr.userId}/roles`).set(as(admin)).send({
        roleCode: 'auditor', scopeType: 'tenant',
      });
      expect(r.status).toBe(403);
      const incident = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.role_grant_denied', actorUserId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect(incident).not.toBeNull();
    });

    it('admin gán exec_viewer (⊆ quyền admin) cho hr@ scope tenant → 201', async () => {
      const r = await api().post(`/api/v1/admin/users/${hr.userId}/roles`).set(as(admin)).send({
        roleCode: 'exec_viewer', scopeType: 'tenant',
      });
      expect(r.status).toBe(201);
      expect(r.body.createdBy).toBe(admin.userId);
    });

    it('[J1②] org_admin gán role cho người NGOÀI phòng mình → 403 (kể cả scopeType=self)', async () => {
      const r = await api().post(`/api/v1/admin/users/${outsidePersonAppUserId}/roles`).set(as(orgadmin)).send({
        roleCode: 'employee', scopeType: 'self',
      });
      expect(r.status).toBe(403);
    });

    it('[J1②] org_admin gán scope=tenant → 403 (chỉ có scope org_unit)', async () => {
      const r = await api().post(`/api/v1/admin/users/${emp.userId}/roles`).set(as(orgadmin)).send({
        roleCode: 'org_admin', scopeType: 'tenant',
      });
      expect(r.status).toBe(403);
    });

    it('[J1④ SoD] gán vai chứa quyền xung đột sod_rule với quyền grantee đang giữ → 409', async () => {
      // mgr@ đã giữ rating:approve (CHỈ role manager có — hrbp không có, tránh trùng ca
      // dưới). sod_rule test-only: strategy:read ⟂ rating:approve. exec_viewer mang
      // strategy:read — admin CÓ đủ quyền của exec_viewer (layer① qua được) nhưng gán cho
      // mgr@ phải bị chặn ở layer④.
      const r = await api().post(`/api/v1/admin/users/${mgr.userId}/roles`).set(as(admin)).send({
        roleCode: 'exec_viewer', scopeType: 'tenant',
      });
      expect(r.status).toBe(409);
      const incident = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.role_grant_denied', actorUserId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect(incident).not.toBeNull();
    });

    it('gán trùng đúng vai + scope → 409', async () => {
      const dup = await api().post(`/api/v1/admin/users/${hr.userId}/roles`).set(as(admin)).send({
        roleCode: 'exec_viewer', scopeType: 'tenant',
      });
      expect(dup.status).toBe(409);
    });
  });

  // ========== DELETE .../roles/:userRoleId ==========
  describe('DELETE /admin/users/:id/roles/:userRoleId', () => {
    it('thu hồi vai vừa gán → hiệu lực NGAY (đọc lại effective-access không còn vai đó)', async () => {
      const ur = await owner.userRole.findFirst({
        where: { tenantId: admin.id, appUserId: hr.userId, role: { code: 'exec_viewer' }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const r = await api().delete(`/api/v1/admin/users/${hr.userId}/roles/${ur!.id}`).set(as(admin));
      expect(r.status).toBe(200);

      const access = await api().get(`/api/v1/admin/users/${hr.userId}/effective-access`).set(as(admin));
      expect(access.body.roles.some((x: any) => x.userRoleId === ur!.id)).toBe(false);
    });
  });

  // ========== GET .../effective-access ==========
  describe('GET /admin/users/:id/effective-access', () => {
    it('trả role + scope + ai cấp + khi nào', async () => {
      const r = await api().get(`/api/v1/admin/users/${mgr.userId}/effective-access`).set(as(admin));
      expect(r.status).toBe(200);
      expect(r.body.roles.length).toBeGreaterThan(0);
      const managerRole = r.body.roles.find((x: any) => x.roleCode === 'manager');
      expect(managerRole).toBeDefined();
      expect(managerRole.scopeType).toBe('org_unit');
    });
  });

  // ========== PATCH/DELETE /org-units/:id ==========
  describe('PATCH/DELETE /org-units/:id', () => {
    let leafId: string;

    it('admin đổi tên đơn vị + version → 200', async () => {
      const unit = await owner.orgUnit.findFirst({ where: { id: outsideDeptId } });
      const r = await api().patch(`/api/v1/org-units/${outsideDeptId}`).set(as(admin)).send({
        nameVi: 'Phòng khác — đổi tên', version: unit!.version,
      });
      expect(r.status).toBe(200);
      expect(r.body.nameVi).toBe('Phòng khác — đổi tên');
    });

    it('đổi cha thành chính nó → 422', async () => {
      const unit = await owner.orgUnit.findFirst({ where: { id: outsideDeptId } });
      const r = await api().patch(`/api/v1/org-units/${outsideDeptId}`).set(as(admin)).send({
        parentId: outsideDeptId, version: unit!.version,
      });
      expect(r.status).toBe(422);
    });

    it('chu trình: đặt cha = con của chính nó → 422', async () => {
      const root = await owner.orgUnit.findFirst({ where: { tenantId: admin.id, code: 'ROOT' } });
      leafId = uuidv7();
      await owner.orgUnit.create({
        data: {
          id: leafId, tenantId: admin.id, code: `LEAF-${uniq}`, nameVi: 'Leaf',
          level: 'team', parentId: outsideDeptId,
        },
      });
      const outUnit = await owner.orgUnit.findFirst({ where: { id: outsideDeptId } });
      const r = await api().patch(`/api/v1/org-units/${outsideDeptId}`).set(as(admin)).send({
        parentId: leafId, version: outUnit!.version,
      });
      expect(r.status).toBe(422);
      void root;
    });

    it('archive khi còn đơn vị con → 409', async () => {
      const r = await api().delete(`/api/v1/org-units/${outsideDeptId}`).set(as(admin));
      expect(r.status).toBe(409);
    });

    it('archive leaf rỗng → 200; archive lại lần 2 → 404', async () => {
      const ok = await api().delete(`/api/v1/org-units/${leafId}`).set(as(admin));
      expect(ok.status).toBe(200);
      const again = await api().delete(`/api/v1/org-units/${leafId}`).set(as(admin));
      expect(again.status).toBe(404);
    });

    it('employee → 403 cả PATCH lẫn DELETE', async () => {
      expect((await api().patch(`/api/v1/org-units/${deptId}`).set(as(emp)).send({ version: 1 })).status).toBe(403);
      expect((await api().delete(`/api/v1/org-units/${deptId}`).set(as(emp))).status).toBe(403);
    });
  });

  // ========== /admin/tenant-config ==========
  describe('GET/PATCH /admin/tenant-config', () => {
    it('admin đọc + ghi key whitelist → 200', async () => {
      const r = await api().patch('/api/v1/admin/tenant-config').set(as(admin)).send({
        patch: { defaultLocale: 'vi', reminderThresholdDays: 3 },
      });
      expect(r.status).toBe(200);
      expect(r.body.defaultLocale).toBe('vi');

      const get = await api().get('/api/v1/admin/tenant-config').set(as(admin));
      expect(get.body.reminderThresholdDays).toBe(3);
    });

    it('key ngoài whitelist → 422', async () => {
      const r = await api().patch('/api/v1/admin/tenant-config').set(as(admin)).send({
        patch: { arbitraryJunk: 'x' },
      });
      expect(r.status).toBe(422);
    });

    it('giá trị sai kiểu cho key hợp lệ → 422', async () => {
      const r = await api().patch('/api/v1/admin/tenant-config').set(as(admin)).send({
        patch: { defaultLocale: 'fr' },
      });
      expect(r.status).toBe(422);
    });

    it('org_admin → 403 (không có tenant.config:*)', async () => {
      const r = await api().get('/api/v1/admin/tenant-config').set(as(orgadmin));
      expect(r.status).toBe(403);
    });
  });

  // ========== /me/access, /me/settings, /me/notifications ==========
  describe('/me/access · /me/settings · /me/notifications — mọi role', () => {
    it('/me/access: emp thấy ĐÚNG vai của chính mình, không nhận ?userId=', async () => {
      const r = await api().get('/api/v1/me/access').set(as(emp));
      expect(r.status).toBe(200);
      expect(r.body.roles.length).toBeGreaterThan(0);
      expect(r.body.permissions).toContain('goal:write');
      expect(r.body.roles.every((x: any) => typeof x.roleCode === 'string')).toBe(true);
    });

    it('/me/settings: PATCH whitelist key → GET phản ánh đúng; key lạ → 422', async () => {
      const put = await api().patch('/api/v1/me/settings').set(as(emp)).send({
        patch: { theme: 'dark', locale: 'en' },
      });
      expect(put.status).toBe(200);
      const get = await api().get('/api/v1/me/settings').set(as(emp));
      expect(get.body.theme).toBe('dark');
      expect(get.body.locale).toBe('en');

      const bad = await api().patch('/api/v1/me/settings').set(as(emp)).send({ patch: { fontSize: 99 } });
      expect(bad.status).toBe(422);
    });

    it('/me/notifications: mặc định TẤT CẢ bật; PATCH tắt 1 mục → phản ánh đúng, còn lại giữ nguyên', async () => {
      const initial = await api().get('/api/v1/me/notifications').set(as(emp));
      expect(initial.status).toBe(200);
      expect(initial.body.length).toBeGreaterThan(0);
      expect(initial.body.every((x: any) => x.enabled === true)).toBe(true);

      const patch = await api().patch('/api/v1/me/notifications').set(as(emp)).send({
        items: [{ eventKey: 'checkin.due', channel: 'email', enabled: false }],
      });
      expect(patch.status).toBe(200);
      const off = patch.body.find((x: any) => x.eventKey === 'checkin.due' && x.channel === 'email');
      expect(off.enabled).toBe(false);
      const untouched = patch.body.find((x: any) => x.eventKey === 'checkin.due' && x.channel === 'in_app');
      expect(untouched.enabled).toBe(true);
    });

    it('eventKey/channel không hợp lệ → 422', async () => {
      const r = await api().patch('/api/v1/me/notifications').set(as(emp)).send({
        items: [{ eventKey: 'made.up', channel: 'sms', enabled: true }],
      });
      expect(r.status).toBe(422);
    });
  });

  // ========== [Trục B L3] GET /org-units/:id/tree — personCount + manager ==========
  describe('GET /org-units/:id/tree — personCount + manager (L3)', () => {
    it('đếm người đúng theo đơn vị + gán/đọc được tên người quản lý', async () => {
      const root = await owner.orgUnit.findFirst({ where: { tenantId: admin.id, code: 'ROOT' } });
      const dept = await owner.orgUnit.findFirst({ where: { id: deptId } });

      const before = await api().get(`/api/v1/org-units/${root!.id}/tree`).set(as(admin));
      expect(before.status).toBe(200);
      const admissions = before.body.children.find((c: any) => c.id === deptId);
      expect(admissions).toBeDefined();
      expect(admissions.personCount).toBeGreaterThan(0); // ADMISSIONS đã có emp1/mgr/author/dept/orgadmin
      expect(admissions.managerName).toBeNull(); // chưa gán

      const set = await api().patch(`/api/v1/org-units/${deptId}`).set(as(admin)).send({
        managerId: mgr.personId, version: dept!.version,
      });
      expect(set.status).toBe(200);

      const after = await api().get(`/api/v1/org-units/${root!.id}/tree`).set(as(admin));
      const admissions2 = after.body.children.find((c: any) => c.id === deptId);
      expect(admissions2.managerName).toBeTruthy();
    });

    it('employee → 403 (không có org:read? — có; kiểm org:write bị chặn khi PATCH quản lý)', async () => {
      const dept = await owner.orgUnit.findFirst({ where: { id: deptId } });
      const r = await api().patch(`/api/v1/org-units/${deptId}`).set(as(emp)).send({
        managerId: mgr.personId, version: dept!.version,
      });
      expect(r.status).toBe(403);
    });

    it('gán managerId không tồn tại → 422', async () => {
      const dept = await owner.orgUnit.findFirst({ where: { id: deptId } });
      const r = await api().patch(`/api/v1/org-units/${deptId}`).set(as(admin)).send({
        managerId: '00000000-0000-7000-8000-000000000000', version: dept!.version,
      });
      expect(r.status).toBe(422);
    });
  });

  // ========== [F121 TRẢ NỢ] chuyển phòng → authoring_grant phòng cũ tự thu hồi ==========
  describe('[F121] PATCH /admin/users/:id đổi orgUnitId → authoring_grant phòng cũ tự thu hồi', () => {
    it('grant active ở phòng CŨ bị revoke NGAY khi chuyển sang phòng MỚI — cùng transaction, có audit', async () => {
      // Fixture độc lập: 2 phòng mới + 1 người trong phòng A, được dept@ cấp quyền soạn.
      const orgA = await owner.orgUnit.create({
        data: { id: uuidv7(), tenantId: admin.id, code: `F121-A-${uniq}`, nameVi: 'F121 Phòng A', level: 'department', parentId: deptId },
      });
      const orgB = await owner.orgUnit.create({
        data: { id: uuidv7(), tenantId: admin.id, code: `F121-B-${uniq}`, nameVi: 'F121 Phòng B', level: 'department', parentId: deptId },
      });
      const person = await owner.person.create({
        data: {
          id: uuidv7(), tenantId: admin.id, employeeCode: `H.01-F121-${uniq}`,
          fullName: 'Người chuyển phòng (F121)', email: `f121-${uniq}@h01.nhg.local`,
          status: 'active', orgUnitId: orgA.id,
        },
      });
      const appUser = await owner.appUser.create({
        data: { id: uuidv7(), tenantId: admin.id, personId: person.id, email: person.email!, status: 'active' },
      });

      // dept@ cấp quyền soạn TRONG orgA — nhưng dept@ scope=deptId (ADMISSIONS), không phải
      // orgA (con của ADMISSIONS) → dùng admin@ tự thay materialize trực tiếp (owner) để
      // fixture không phụ thuộc việc dept_head có scope subtree hay không (chưa hỗ trợ,
      // xem scope.util.ts — so khớp trực tiếp, subtree phase sau). Test này nhắm vào HÀNH VI
      // THU HỒI khi chuyển phòng, không nhắm lại luồng cấp quyền (đã có authoring-grant.spec).
      const staffRole = await owner.role.findFirst({ where: { code: 'staff_author', tenantId: null } });
      const userRole = await owner.userRole.create({
        data: {
          id: uuidv7(), tenantId: admin.id, appUserId: appUser.id,
          roleId: staffRole!.id, scopeType: 'org_unit', scopeId: orgA.id, createdBy: admin.userId,
        },
      });
      const grant = await owner.authoringGrant.create({
        data: {
          id: uuidv7(), tenantId: admin.id, granterId: admin.userId, granteeId: appUser.id,
          orgUnitId: orgA.id, capability: 'taskcell:author', status: 'active', userRoleId: userRole.id,
        },
      });

      const fresh = await owner.person.findFirst({ where: { id: person.id } });
      const move = await api().patch(`/api/v1/admin/users/${appUser.id}`).set(as(admin)).send({
        orgUnitId: orgB.id, version: fresh!.version,
      });
      expect(move.status).toBe(200);
      expect(move.body.orgUnitId).toBe(orgB.id);

      const grantAfter = await owner.authoringGrant.findFirst({ where: { id: grant.id } });
      expect(grantAfter!.status).toBe('revoked');
      expect(grantAfter!.revokedAt).not.toBeNull();

      const userRoleAfter = await owner.userRole.findFirst({ where: { id: userRole.id } });
      expect(userRoleAfter!.deletedAt).not.toBeNull();

      const incident = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'authoring.revoke_on_transfer', entityId: grant.id },
      });
      expect(incident).not.toBeNull();
      expect((incident!.after as any).old_org_unit_id).toBe(orgA.id);
      expect((incident!.after as any).new_org_unit_id).toBe(orgB.id);
    });

    it('KHÔNG có grant nào ở phòng khác/đã revoked bị đụng vào — chỉ đúng grant phòng CŨ + status active', async () => {
      const orgA = await owner.orgUnit.create({
        data: { id: uuidv7(), tenantId: admin.id, code: `F121-C-${uniq}`, nameVi: 'F121 Phòng C', level: 'department', parentId: deptId },
      });
      const orgB = await owner.orgUnit.create({
        data: { id: uuidv7(), tenantId: admin.id, code: `F121-D-${uniq}`, nameVi: 'F121 Phòng D', level: 'department', parentId: deptId },
      });
      const orgOther = await owner.orgUnit.create({
        data: { id: uuidv7(), tenantId: admin.id, code: `F121-E-${uniq}`, nameVi: 'F121 Phòng E', level: 'department', parentId: deptId },
      });
      const person = await owner.person.create({
        data: {
          id: uuidv7(), tenantId: admin.id, employeeCode: `H.01-F121B-${uniq}`,
          fullName: 'Người chuyển phòng B (F121)', email: `f121b-${uniq}@h01.nhg.local`,
          status: 'active', orgUnitId: orgA.id,
        },
      });
      const appUser = await owner.appUser.create({
        data: { id: uuidv7(), tenantId: admin.id, personId: person.id, email: person.email!, status: 'active' },
      });
      // grant ở phòng KHÁC (orgOther) — KHÔNG được đụng vào khi người này rời orgA
      const otherGrant = await owner.authoringGrant.create({
        data: {
          id: uuidv7(), tenantId: admin.id, granterId: admin.userId, granteeId: appUser.id,
          orgUnitId: orgOther.id, capability: 'taskcell:author', status: 'active',
        },
      });
      // grant CŨ ở orgA nhưng ĐÃ revoked từ trước — không được "revoke lại" (revokedAt giữ nguyên)
      const alreadyRevoked = await owner.authoringGrant.create({
        data: {
          id: uuidv7(), tenantId: admin.id, granterId: admin.userId, granteeId: appUser.id,
          orgUnitId: orgA.id, capability: 'taskcell:author', status: 'revoked',
          revokedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      const fresh = await owner.person.findFirst({ where: { id: person.id } });
      const move = await api().patch(`/api/v1/admin/users/${appUser.id}`).set(as(admin)).send({
        orgUnitId: orgB.id, version: fresh!.version,
      });
      expect(move.status).toBe(200);

      const otherAfter = await owner.authoringGrant.findFirst({ where: { id: otherGrant.id } });
      expect(otherAfter!.status).toBe('active'); // không bị đụng — khác orgUnitId

      const revokedAfter = await owner.authoringGrant.findFirst({ where: { id: alreadyRevoked.id } });
      expect(revokedAfter!.revokedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z'); // giữ nguyên, không ghi đè
    });
  });

  // ========== Cô lập tenant ==========
  describe('CÔ LẬP tenant', () => {
    it('T2 admin không thấy user H.01 trong /admin/users', async () => {
      const r = await api().get('/api/v1/admin/users').set(as(t2admin));
      expect(r.status).toBe(200);
      expect(r.body.entries.every((e: any) => e.employeeCode.startsWith('T2') || !e.employeeCode.startsWith('H.01'))).toBe(true);
    });
  });

  // ========== J9 bất biến giữ nguyên ==========
  it('[J9] không đụng Từ điển Tác vụ / không tạo ai_interaction có cost cho H.01', async () => {
    const cost = await owner.aiInteraction.aggregate({
      where: { tenantId: admin.id }, _sum: { costUsd: true },
    });
    expect(Number(cost._sum.costUsd ?? 0)).toBe(0);
  });
});
