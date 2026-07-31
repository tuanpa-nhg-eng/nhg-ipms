/**
 * Integration [Trục C — L3] Ngoại lệ chính sách CÓ THỜI HẠN.
 *
 * Cổng ra của kế hoạch §4 L3, dịch thành ca kiểm:
 *   "cấp một ngoại lệ 5 phút → dùng được → chờ hết hạn → mất quyền MÀ KHÔNG cần bất kỳ thao
 *    tác tay nào; người xin bấm tự duyệt → chặn."
 *
 * Ca "chờ hết hạn" ở đây chờ THẬT (vài giây, hạn đặt qua đường DB) thay vì gọi một hàm dọn:
 * gọi hàm dọn rồi khẳng định "quyền đã mất" chỉ chứng minh hàm dọn chạy được — đúng thứ kế
 * hoạch nói KHÔNG được tin. Cái cần chứng minh là quyền tự mất khi KHÔNG ai làm gì cả.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { EXCEPTION_MAX_TTL_HOURS, EXCEPTION_GRANTABLE_PERMISSIONS } from '@ipms/shared';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(240_000);

interface Ctx { id: string; token: string; userId: string; email: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('[Trục C L3] Ngoại lệ chính sách có thời hạn', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let plat: Ctx;      // platform_admin — exception:request (người xin điển hình)
  let steward: Ctx;   // data_steward — exception:approve (người duyệt duy nhất)
  let admin: Ctx;     // tenant_admin — exception:request + read
  let auditor: Ctx;   // auditor — exception:read (rà soát)
  let hr: Ctx;        // hrbp — không dính gì tới ngoại lệ (ca đối chứng 403)

  async function ctxFor(prefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: prefix } },
    });
    if (!user) throw new Error(`User ${prefix} chưa seed`);
    const token = jwt.sign(
      { sub: user.id, tid: tenant!.id, email: user.email, person_id: user.personId ?? undefined },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user.id, email: user.email };
  }

  const H = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());
  const REASON = 'Điều tra sự cố xuất dữ liệu do đơn vị H.01 báo cáo tối qua, cần xem sổ vết chi tiết';

  /** Dọn SẠCH mọi dấu vết ngoại lệ TRƯỚC khi chạy — bài học đắt nhất của L1: spec chạm bảng
   *  trạng thái phải tự dựng đầu vào ở `beforeAll`, không chỉ dọn ở `afterAll`. */
  async function wipe() {
    const t = await owner.tenant.findUnique({ where: { code: 'H.01' } });
    await owner.userRole.deleteMany({ where: { policyExceptionId: { not: null } } });
    await owner.policyException.deleteMany({ where: { tenantId: t!.id } });
    // CỐ Ý không đụng các vai `exception:*` — chúng do SEED dựng (tầng ứng dụng không tạo
    // được vai, xem `findExceptionRole`). Xoá chúng ở đây thì mọi lần duyệt sau đều 422 và
    // lỗi sẽ trông như lỗi nghiệp vụ chứ không như "test tự phá môi trường của mình".
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    plat = await ctxFor('platform@');
    steward = await ctxFor('steward@');
    admin = await ctxFor('admin@');
    auditor = await ctxFor('auditor@');
    hr = await ctxFor('hr@');
    await wipe();

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await wipe();
    await owner.tenant.update({
      where: { id: plat.id },
      data: { settings: {} },
    }).catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  /**
   * [Tự bắt khi chạy thật] `ipms_app` KHÔNG có INSERT trên `role` — tầng ứng dụng không đúc
   * ra vai (bất biến từ Phase 0, cùng họ [F1] feature_flag chỉ-đọc). Nên tập vai mà một
   * ngoại lệ có thể cấp là tập SEED dựng sẵn, và nó phải khớp CHÍNH XÁC allowlist trong mã:
   * thiếu một vai thì đúng quyền đó không nới được (fail-closed nhưng im lặng cho tới khi có
   * người cần); thừa một vai mang hai quyền thì một ngoại lệ cấp nhiều hơn thứ được duyệt.
   */
  it('[nền] seed dựng đủ vai tạm cho MỌI quyền trong allowlist, mỗi vai đúng MỘT quyền', async () => {
    const roles = await owner.role.findMany({
      where: { tenantId: plat.id, code: { startsWith: 'exception:' }, deletedAt: null },
      include: { rolePermissions: { include: { permission: true } } },
    });
    const byCode = new Map(roles.map((r) => [r.code, r]));
    const missing = EXCEPTION_GRANTABLE_PERMISSIONS.filter((p) => !byCode.has(`exception:${p}`));
    expect(missing).toEqual([]);
    const wrong = roles
      .filter((r) => r.rolePermissions.length !== 1
        || r.rolePermissions[0].permission.code !== r.code.slice('exception:'.length))
      .map((r) => r.code);
    expect(wrong).toEqual([]);
    expect(roles.length).toBe(EXCEPTION_GRANTABLE_PERMISSIONS.length);
  });

  it('[nền] vai tạm KHÔNG lọt vào danh mục `GET /admin/roles` — không gán tay được', async () => {
    const r = await api().get('/api/v1/admin/roles').set(H(admin));
    expect(r.status).toBe(200);
    const leaked = r.body.filter((x: any) => String(x.code).startsWith('exception:'));
    expect(leaked).toEqual([]);
  });

  // ═══════════ ① K5 — người xin ≠ người duyệt ═══════════

  describe('[K5] Phân tách người xin / người duyệt', () => {
    it('data_steward KHÔNG xin được (chỉ duyệt) — 403', async () => {
      const r = await api().post('/api/v1/policy-exceptions').set(H(steward)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: REASON, requestedHours: 4,
      });
      expect(r.status).toBe(403);
    });

    it('platform_admin/tenant_admin KHÔNG duyệt được (chỉ xin) — 403', async () => {
      const req0 = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: REASON, requestedHours: 4,
      });
      expect(req0.status).toBe(201);
      for (const c of [admin, plat]) {
        const r = await api().post(`/api/v1/policy-exceptions/${req0.body.id}/decide`).set(H(c))
          .send({ approve: true, hours: 4 });
        expect(r.status).toBe(403);
      }
    });

    it('[K5] người XIN không tự duyệt được, kể cả khi giữ đủ hai quyền', async () => {
      // Dựng đúng tình huống nguy hiểm: cấp tạm `exception:request` cho steward@ để nó vừa
      // xin vừa duyệt được về mặt RBAC. K5 phải chặn ở tầng NGHIỆP VỤ, không dựa vào việc
      // "may mà không ai giữ cả hai quyền" — cấp cả hai chỉ là một lần bấm ở màn Vai trò.
      const t = plat.id;
      const perm = await owner.permission.findFirstOrThrow({ where: { code: 'exception:request' } });
      const role = await owner.role.create({
        data: { id: crypto.randomUUID(), tenantId: t, code: 'zz_l3_dual', nameVi: 'test', nameEn: 'test' },
      });
      await owner.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      const ur = await owner.userRole.create({
        data: {
          id: crypto.randomUUID(), tenantId: t, appUserId: steward.userId, roleId: role.id,
          scopeType: 'tenant',
        },
      });
      try {
        const mine = await api().post('/api/v1/policy-exceptions').set(H(steward)).send({
          granteeUserId: plat.userId, permissionCode: 'exportlog:read',
          reason: REASON, requestedHours: 4,
        });
        expect(mine.status).toBe(201);
        const self = await api().post(`/api/v1/policy-exceptions/${mine.body.id}/decide`)
          .set(H(steward)).send({ approve: true, hours: 4 });
        expect(self.status).toBe(403);
        expect(String(self.body?.error?.message ?? '')).toContain('K5');
        const denied = await owner.auditLog.findFirst({
          where: { tenantId: t, action: 'policy.exception_denied', actorUserId: steward.userId },
          orderBy: { id: 'desc' },
        });
        expect((denied!.after as any).rule).toContain('K5');
      } finally {
        await owner.userRole.deleteMany({ where: { id: ur.id } });
        await owner.rolePermission.deleteMany({ where: { roleId: role.id } });
        await owner.role.deleteMany({ where: { id: role.id } });
      }
    });

    it('[K5] người DUYỆT không tự cấp quyền cho chính mình (đứng tên hộ cũng không lách được)', async () => {
      const asked = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: steward.userId, permissionCode: 'review:read',
        reason: REASON, requestedHours: 2,
      });
      expect(asked.status).toBe(201);
      const r = await api().post(`/api/v1/policy-exceptions/${asked.body.id}/decide`)
        .set(H(steward)).send({ approve: true, hours: 2 });
      expect(r.status).toBe(403);
      expect(String(r.body?.error?.message ?? '')).toContain('chính mình');
    });
  });

  // ═══════════ ② K4 — trần thời hạn + allowlist quyền ═══════════

  describe('[K4] Trần thời hạn và phạm vi quyền nới được', () => {
    it('xin quá trần cứng 72h → 400 ngay ở validator', async () => {
      const r = await api().post('/api/v1/policy-exceptions').set(H(plat)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: REASON, requestedHours: EXCEPTION_MAX_TTL_HOURS + 1,
      });
      expect(r.status).toBe(400);
    });

    it('lý do dưới 20 ký tự → 400 (hàng không lý do là hồ sơ tuân thủ rỗng nghĩa)', async () => {
      const r = await api().post('/api/v1/policy-exceptions').set(H(plat)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: 'cần gấp', requestedHours: 2,
      });
      expect(r.status).toBe(400);
    });

    it('[K3] xin `export:confidential` → 422, không tạo hàng pending nào', async () => {
      const before = await owner.policyException.count({ where: { tenantId: plat.id } });
      const r = await api().post('/api/v1/policy-exceptions').set(H(plat)).send({
        granteeUserId: plat.userId, permissionCode: 'export:confidential',
        reason: REASON, requestedHours: 2,
      });
      expect(r.status).toBe(422);
      expect(await owner.policyException.count({ where: { tenantId: plat.id } })).toBe(before);
    });

    it('[J3] xin `audit:read` → 422 — vết kiểm toán không mở bằng đơn xin', async () => {
      const r = await api().post('/api/v1/policy-exceptions').set(H(plat)).send({
        granteeUserId: plat.userId, permissionCode: 'audit:read',
        reason: REASON, requestedHours: 2,
      });
      expect(r.status).toBe(422);
    });

    it('đơn vị HẠ trần xuống 2h → xin 4h bị 422 (cấu hình xuống được)', async () => {
      const cfg = await api().get('/api/v1/admin/tenant-config').set(H(admin));
      const up = await api().patch('/api/v1/admin/tenant-config').set(H(admin))
        .send({ patch: { exceptionMaxTtlHours: 2 }, version: cfg.body.version });
      expect(up.status).toBe(200);
      try {
        const r = await api().post('/api/v1/policy-exceptions').set(H(plat)).send({
          granteeUserId: plat.userId, permissionCode: 'exportlog:read',
          reason: REASON, requestedHours: 4,
        });
        expect(r.status).toBe(422);
        expect(String(r.body?.error?.message ?? '')).toContain('2');
      } finally {
        const c2 = await api().get('/api/v1/admin/tenant-config').set(H(admin));
        await api().patch('/api/v1/admin/tenant-config').set(H(admin))
          .send({ patch: { exceptionMaxTtlHours: 72 }, version: c2.body.version });
      }
    });

    it('đơn vị KHÔNG nâng được trần lên trên 72h — 422 ở validator cấu hình', async () => {
      const cfg = await api().get('/api/v1/admin/tenant-config').set(H(admin));
      const r = await api().patch('/api/v1/admin/tenant-config').set(H(admin))
        .send({ patch: { exceptionMaxTtlHours: 720 }, version: cfg.body.version });
      expect(r.status).toBe(422);
    });
  });

  // ═══════════ ③ Cổng ra — cấp → dùng → hết hạn → mất quyền ═══════════

  describe('[K4 — CỔNG RA] Vòng đời một ngoại lệ', () => {
    let excId: string;

    it('trước khi có ngoại lệ: platform@ KHÔNG đọc được sổ vết chi tiết (403)', async () => {
      const r = await api().get('/api/v1/export-log').set(H(plat));
      expect(r.status).toBe(403);
    });

    it('xin → pending, chưa có quyền nào được cấp', async () => {
      const r = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: REASON, requestedHours: 4,
      });
      expect(r.status).toBe(201);
      excId = r.body.id;
      expect(r.body.status).toBe('pending');
      // hàng `pending` KHÔNG được materialize thành vai — chờ duyệt nghĩa là chưa có quyền
      expect(await owner.userRole.count({ where: { policyExceptionId: excId, deletedAt: null } })).toBe(0);
      expect((await api().get('/api/v1/export-log').set(H(plat))).status).toBe(403);
    });

    it('data_steward duyệt → vai TẠM có hạn được cấp, kèm vết audit đủ thông tin', async () => {
      const r = await api().post(`/api/v1/policy-exceptions/${excId}/decide`).set(H(steward))
        .send({ approve: true, hours: 4, note: 'Duyệt trong phạm vi điều tra sự cố' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('approved');

      const ur = await owner.userRole.findFirst({ where: { policyExceptionId: excId, deletedAt: null } });
      expect(ur).not.toBeNull();
      expect(ur!.expiresAt).not.toBeNull();
      const hours = (ur!.expiresAt!.getTime() - Date.now()) / 3600_000;
      expect(hours).toBeGreaterThan(3.9);
      expect(hours).toBeLessThanOrEqual(4);

      const a = await owner.auditLog.findFirst({
        where: { tenantId: plat.id, action: 'policy.exception_approved', entityId: excId },
      });
      expect(a).not.toBeNull();
      expect(a!.actorUserId).toBe(steward.userId);          // người DUYỆT, không phải người xin
      expect((a!.after as any).requester_id).toBe(admin.userId);
    });

    it('[cổng ra ①] quyền dùng được NGAY — platform@ đọc được sổ vết chi tiết', async () => {
      const r = await api().get('/api/v1/export-log').set(H(plat));
      expect(r.status).toBe(200);
      expect(r.body).toHaveProperty('entries');
    });

    it('[K4] mỗi lần DÙNG để lại vết + đếm — B0 rà được ngoại lệ nào đang được dùng bao nhiêu', async () => {
      const before = await owner.policyException.findUniqueOrThrow({ where: { id: excId } });
      await api().get('/api/v1/export-log').set(H(plat)).expect(200);
      const after = await owner.policyException.findUniqueOrThrow({ where: { id: excId } });
      expect(after.usedCount).toBeGreaterThan(before.usedCount);
      expect(after.lastUsedAt).not.toBeNull();

      const used = await owner.auditLog.findFirst({
        where: { tenantId: plat.id, action: 'policy.exception_used', entityId: excId },
        orderBy: { id: 'desc' },
      });
      expect(used).not.toBeNull();
      expect(used!.actorUserId).toBe(plat.userId);   // NGƯỜI DÙNG, không phải người duyệt
    });

    it('[K4] quyền KHÔNG lan sang thứ khác — platform@ vẫn 403 ở mọi endpoint nghiệp vụ', async () => {
      // Ngoại lệ nới ĐÚNG MỘT quyền. Ca này canh đúng chỗ dễ hỏng: materialize thành `user_role`
      // là thao tác cấp vai, và cấp nhầm một vai rộng sẽ không lộ ra ở ca "dùng được" phía trên.
      const leaks: string[] = [];
      for (const u of ['/api/v1/reviews', '/api/v1/persons', '/api/v1/goals', '/api/v1/audit-logs']) {
        const r = await api().get(u).set(H(plat));
        if (r.status < 400) leaks.push(`${u} → ${r.status}`);
      }
      expect(leaks).toEqual([]);
    });

    /**
     * [K4 — chốt chặn "72 giờ thành vĩnh viễn"] Gia hạn bị TRIGGER DB chặn, không chỉ bị
     * service từ chối: đây là bất biến phải sống lâu hơn mọi bản deploy.
     */
    it('[K4] KHÔNG gia hạn được — kể cả UPDATE thẳng vào DB', async () => {
      const ur = await owner.userRole.findFirstOrThrow({ where: { policyExceptionId: excId, deletedAt: null } });
      await expect(
        owner.userRole.update({
          where: { id: ur.id },
          data: { expiresAt: new Date(Date.now() + 999 * 3600_000) },
        }),
      ).rejects.toThrow(/không kéo dài/);

      await expect(
        owner.policyException.update({
          where: { id: excId },
          data: { expiresAt: new Date(Date.now() + 999 * 3600_000) },
        }),
      ).rejects.toThrow(/không gia hạn/);
    });

    it('[K4] KHÔNG gỡ được hạn (đặt expires_at = NULL để vai tạm thành vĩnh viễn)', async () => {
      const ur = await owner.userRole.findFirstOrThrow({ where: { policyExceptionId: excId, deletedAt: null } });
      await expect(
        owner.userRole.update({ where: { id: ur.id }, data: { expiresAt: null } }),
      ).rejects.toThrow(/không kéo dài/);
    });

    it('KHÔNG sửa được nội dung đơn sau khi tạo (lý do, quyền, người nhận)', async () => {
      await expect(
        owner.policyException.update({ where: { id: excId }, data: { reason: 'Lý do bịa lại sau khi đã duyệt xong' } }),
      ).rejects.toThrow(/không sửa được/);
      await expect(
        owner.policyException.update({ where: { id: excId }, data: { permissionCode: 'audit:read' } }),
      ).rejects.toThrow(/không sửa được/);
    });

    /**
     * [CỔNG RA — câu quan trọng nhất của lát] "chờ hết hạn → mất quyền mà KHÔNG cần bất kỳ
     * thao tác tay nào". Rút hạn xuống vài giây rồi CHỜ THẬT, và cố ý KHÔNG gọi `/sweep`.
     * Rút ngắn được phép (ngược chiều với gia hạn) nên trigger không cản.
     */
    it('[cổng ra ②] hết hạn → mất quyền NGAY, không job nào chạy, không ai bấm gì', async () => {
      const ur = await owner.userRole.findFirstOrThrow({ where: { policyExceptionId: excId, deletedAt: null } });
      // Rút NGẮN cả hai mốc — `user_role.expires_at` là cái THI HÀNH quyền, còn
      // `policy_exception.expires_at` là cái hồ sơ tuân thủ ghi lại. Chúng luôn được đặt bằng
      // nhau lúc duyệt; chỉnh lệch nhau ở đây sẽ dựng một trạng thái sản phẩm không tồn tại
      // (và đã làm chính ca `sweep` bên dưới đỏ lần chạy đầu — lỗi ở TEST, không ở mã).
      const shortly = new Date(Date.now() + 2500);
      await owner.userRole.update({ where: { id: ur.id }, data: { expiresAt: shortly } });
      await owner.policyException.update({ where: { id: excId }, data: { expiresAt: shortly } });
      await api().get('/api/v1/export-log').set(H(plat)).expect(200);   // còn hạn: vẫn dùng được

      await sleep(3200);

      const r = await api().get('/api/v1/export-log').set(H(plat));
      expect(r.status).toBe(403);
      // và hàng `user_role` VẪN CÒN ĐÓ, chưa ai dọn — bằng chứng quyền mất ở CỬA chứ không
      // do một job nào đã kịp xoá nó
      const still = await owner.userRole.findUnique({ where: { id: ur.id } });
      expect(still!.deletedAt).toBeNull();
    });

    it('job dọn CHỈ đóng sổ (quyền đã mất từ trước) — đơn chuyển `expired`', async () => {
      const r = await api().post('/api/v1/policy-exceptions/sweep').set(H(steward)).send({});
      expect(r.status).toBe(201);
      const exc = await owner.policyException.findUniqueOrThrow({ where: { id: excId } });
      expect(exc.status).toBe('expired');
    });
  });

  // ═══════════ ④ Thu hồi sớm + rà soát ═══════════

  describe('Thu hồi sớm và rà soát', () => {
    let excId: string;

    beforeAll(async () => {
      const req0 = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: plat.userId, permissionCode: 'exportlog:read',
        reason: REASON, requestedHours: 8,
      });
      excId = req0.body.id;
      await api().post(`/api/v1/policy-exceptions/${excId}/decide`).set(H(steward))
        .send({ approve: true, hours: 8 });
    });

    it('thu hồi sớm → quyền mất NGAY, không chờ hết hạn', async () => {
      await api().get('/api/v1/export-log').set(H(plat)).expect(200);
      const r = await api().post(`/api/v1/policy-exceptions/${excId}/revoke`).set(H(steward))
        .send({ note: 'Sự cố đã đóng, không cần quyền nữa' });
      expect(r.status).toBe(201);
      expect((await api().get('/api/v1/export-log').set(H(plat))).status).toBe(403);
    });

    it('đơn đã thu hồi không quyết định lại được (409) — trạng thái đi một chiều', async () => {
      const r = await api().post(`/api/v1/policy-exceptions/${excId}/decide`).set(H(steward))
        .send({ approve: true, hours: 8 });
      expect(r.status).toBe(409);
    });

    it('auditor rà được MỌI đơn, kể cả đơn mình không xin không duyệt', async () => {
      const r = await api().get('/api/v1/policy-exceptions').set(H(auditor));
      expect(r.status).toBe(200);
      expect(r.body.seesAll).toBe(true);
      expect(r.body.entries.length).toBeGreaterThan(0);
      const found = r.body.entries.find((e: any) => e.id === excId);
      expect(found).toBeDefined();
      expect(found.requester.email).toBe(admin.email);
      expect(found.approver.email).toBe(steward.email);
    });

    it('người không dính gì tới ngoại lệ (hrbp) → 403 ở cả danh sách', async () => {
      const r = await api().get('/api/v1/policy-exceptions').set(H(hr));
      expect(r.status).toBe(403);
    });

    it('người xin (không có quyền duyệt) chỉ thấy đơn của mình, không thấy bản đồ toàn đơn vị', async () => {
      const r = await api().get('/api/v1/policy-exceptions').set(H(admin));
      expect(r.status).toBe(200);
      expect(r.body.seesAll).toBe(false);
      const mine = r.body.entries.every(
        (e: any) => e.requester.id === admin.userId || e.grantee.id === admin.userId,
      );
      expect(mine).toBe(true);
      expect(r.body.entries.length).toBeGreaterThan(0);
    });

    it('[đối chứng] `effective-access` hiện vai tạm kèm hạn — truy được "vai lạ ở đâu ra"', async () => {
      const fresh = await api().post('/api/v1/policy-exceptions').set(H(admin)).send({
        granteeUserId: plat.userId, permissionCode: 'review:read',
        reason: REASON, requestedHours: 3,
      });
      await api().post(`/api/v1/policy-exceptions/${fresh.body.id}/decide`).set(H(steward))
        .send({ approve: true, hours: 3 });

      const r = await api().get(`/api/v1/admin/users/${plat.userId}/effective-access`).set(H(admin));
      expect(r.status).toBe(200);
      const tmp = r.body.roles.find((x: any) => x.policyExceptionId === fresh.body.id);
      expect(tmp).toBeDefined();
      expect(tmp.expiresAt).not.toBeNull();
      expect(tmp.expired).toBe(false);
      expect(r.body.permissions).toContain('review:read');

      await api().post(`/api/v1/policy-exceptions/${fresh.body.id}/revoke`).set(H(steward)).send({});
    });
  });
});
