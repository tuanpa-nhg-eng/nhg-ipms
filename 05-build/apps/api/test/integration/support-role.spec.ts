/**
 * Integration [Trục C — L2b] Vai `support` chỉ-đọc + J12① siết theo QUYỀN HỮU HIỆU.
 *
 * Vì sao lát này tồn tại: driver sống trục B đo được rằng đóng vai (xây ở B L4) KHÔNG phục
 * vụ được mục đích nó sinh ra. J12① bản đầu đòi actor ⊇ TOÀN BỘ quyền target; L0 lại tước
 * sạch quyền ghi nghiệp vụ khỏi `tenant_admin` (J2). Giao hai điều đó lại: `admin@` chỉ đóng
 * vai được người không có quyền nào — người mà đọc gì cũng 403.
 *
 * Kiểm chứng ở đây, theo đúng cổng ra của kế hoạch §4 L2b:
 *  - [K11] `support@` TỰ NÓ không ghi được gì: ca quét toàn bộ bề mặt mutation → 403
 *  - [J12①] `support@` đóng vai được emp1 · mgr · hr · exec (bốn persona nghiệp vụ)
 *  - [J11] trong phiên: đọc 200, mọi hành động ghi mà target THẬT SỰ giữ quyền → 403
 *  - [J12②] không đóng vai `auditor@` · [J12④] không lồng phiên · [J12⑤] scope phải là tenant
 *  - [J1⑤] SoD cấp vai: `support` không kiêm `tenant_admin`/`org_admin`, kiểm CẢ HAI CHIỀU
 *  - [đối chứng ngược] bản vá J12① giải đúng vấn đề: `admin@` nay đóng vai được `emp1@`
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(240_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('[Trục C L2b] Vai `support` chỉ-đọc', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let support: Ctx;
  let admin: Ctx;
  let emp1: Ctx;
  let mgr: Ctx;
  let hr: Ctx;
  let exec: Ctx;
  let auditor: Ctx;
  let orgadmin: Ctx;

  /** [J12⑤] danh tính dựng riêng cho ca scope hẹp — dọn sạch ở afterAll. */
  const scoped = { roleId: '', userId: '', userRoleId: '', token: '' };

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
    return { id: tenant!.id, token, userId: user.id, email: user.email };
  }

  const H = (c: { token: string; id: string }) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const HT = (token: string, tenantId: string) => ({ Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId });
  const api = () => request(app.getHttpServer());
  const REASON = 'Người dùng báo lỗi không thấy mục tiêu của mình — hỗ trợ kiểm tra giao diện';

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    support = await ctxFor('H.01', 'support@');
    admin = await ctxFor('H.01', 'admin@');
    emp1 = await ctxFor('H.01', 'emp1@');
    mgr = await ctxFor('H.01', 'mgr@');
    hr = await ctxFor('H.01', 'hr@');
    exec = await ctxFor('H.01', 'exec@');
    auditor = await ctxFor('H.01', 'auditor@');
    orgadmin = await ctxFor('H.01', 'orgadmin@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // [J12⑤] Một người giữ ĐÚNG `user:impersonate` nhưng ở scope org_unit. Không seed sẵn
    // (thiết kế không có vai nào như vậy) — dựng tại chỗ chính là cách chứng minh phòng tuyến
    // này chặn được thứ chưa tồn tại trong seed, tức nó bảo vệ trước một lần cấp sai trong
    // tương lai chứ không chỉ mô tả hiện trạng.
    const dept = await owner.orgUnit.findFirst({ where: { tenantId: support.id, deletedAt: null, parentId: { not: null } } });
    const perms = await owner.permission.findMany({ where: { code: { in: ['user:impersonate', 'tenant:read'] } } });
    const role = await owner.role.create({
      data: { id: uuidv7(), code: 'zz_l2b_scoped_impersonator', tenantId: support.id, nameVi: 'test', nameEn: 'test' },
    });
    scoped.roleId = role.id;
    for (const p of perms) await owner.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    const u = await owner.appUser.create({
      data: {
        id: uuidv7(), tenantId: support.id, email: 'zz-l2b-scoped@h01.nhg.local', status: 'active',
      },
    });
    scoped.userId = u.id;
    const ur = await owner.userRole.create({
      data: {
        id: uuidv7(), tenantId: support.id, appUserId: u.id, roleId: role.id,
        scopeType: 'org_unit', scopeId: dept!.id,
      },
    });
    scoped.userRoleId = ur.id;
    scoped.token = jwt.sign(
      { sub: u.id, tid: support.id, email: u.email }, getJwtSecret(), { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await owner.userRole.deleteMany({ where: { id: scoped.userRoleId } }).catch(() => {});
    await owner.appUser.deleteMany({ where: { id: scoped.userId } }).catch(() => {});
    await owner.rolePermission.deleteMany({ where: { roleId: scoped.roleId } }).catch(() => {});
    await owner.role.deleteMany({ where: { id: scoped.roleId } }).catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════ ① K11 — support TỰ NÓ không ghi được gì ═══════════

  /**
   * Ca đối chứng bắt buộc của kế hoạch ("support@ tự nó gọi mọi endpoint ghi đều 403").
   * Danh sách quét theo MODULE, không theo cảm tính: mỗi controller có bề mặt mutation đều
   * có ít nhất một đại diện. `me/settings` + `me/notifications` cố ý KHÔNG có mặt — chúng là
   * ghi trên CHÍNH MÌNH (đổi ngôn ngữ, tắt thông báo), mọi vai đều có kể cả `auditor`; coi
   * chúng là "quyền ghi" thì K11 vô nghĩa. `POST /admin/impersonation` cũng không có mặt: đó
   * là năng lực ĐỊNH NGHĨA vai này, có ca riêng ngay dưới.
   */
  it('[K11] support@ bị 403 ở MỌI bề mặt ghi của sản phẩm', async () => {
    const endpoints: Array<[string, string]> = [
      ['post', '/api/v1/goals'], ['patch', '/api/v1/goals/00000000-0000-0000-0000-000000000000/progress'],
      ['post', '/api/v1/checkins'], ['post', '/api/v1/checkins/00000000-0000-0000-0000-000000000000/review'],
      ['post', '/api/v1/evidence'], ['post', '/api/v1/evidence/00000000-0000-0000-0000-000000000000/verify'],
      ['post', '/api/v1/reviews'], ['post', '/api/v1/review-cycles'],
      ['post', '/api/v1/reviews/00000000-0000-0000-0000-000000000000/finalize'],
      ['post', '/api/v1/calibration-sessions'],
      ['post', '/api/v1/kpis'], ['post', '/api/v1/kpis/00000000-0000-0000-0000-000000000000/approve'],
      ['post', '/api/v1/scorecards'], ['post', '/api/v1/objectives'],
      ['post', '/api/v1/org-units'], ['patch', '/api/v1/org-units/00000000-0000-0000-0000-000000000000'],
      ['delete', '/api/v1/org-units/00000000-0000-0000-0000-000000000000'],
      ['post', '/api/v1/persons'],
      ['post', '/api/v1/admin/users'],
      ['patch', '/api/v1/admin/users/00000000-0000-0000-0000-000000000000'],
      ['post', '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/disable'],
      ['post', '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/roles'],
      ['patch', '/api/v1/admin/tenant-config'],
      ['post', '/api/v1/config-versions'],
      ['post', '/api/v1/config-versions/00000000-0000-0000-0000-000000000000/publish'],
      ['put', '/api/v1/brand-kit'], ['put', '/api/v1/canvas-layout/org'],
      ['post', '/api/v1/policies'], ['post', '/api/v1/processes'],
      ['post', '/api/v1/library/contributions'], ['post', '/api/v1/library/templates'],
      ['post', '/api/v1/authoring/grants'],
      ['post', '/api/v1/task-cells/00000000-0000-0000-0000-000000000000/claim'],
      ['post', '/api/v1/task-cells/00000000-0000-0000-0000-000000000000/feedback'],
      ['post', '/api/v1/integrations/connections'], ['post', '/api/v1/integrations/outbox/dispatch'],
      ['post', '/api/v1/integrations/jobs/morning-todos/run'],
      ['post', '/api/v1/derivation/run'],
      ['post', '/api/v1/ai/chat'], ['post', '/api/v1/ai/eval/suites'],
      ['post', '/api/v1/ai/golden/harvest'], ['put', '/api/v1/ai/egress-policies'],
      ['post', '/api/v1/mcp/tools/list_kpis/invoke'],
      ['put', '/api/v1/data-catalog/objective.kpi'],
      ['post', '/api/v1/platform/tenants'], ['put', '/api/v1/platform/flags/test.l2b.x'],
    ];
    const leaks: string[] = [];
    for (const [method, url] of endpoints) {
      const res = await (api() as any)[method](url).set(H(support)).send({});
      // 403 = chặn đúng. 404 chấp nhận (route/tài nguyên không tồn tại). 2xx là LỖ THẬT.
      if (res.status < 400) leaks.push(`${method.toUpperCase()} ${url} → ${res.status}`);
    }
    expect(endpoints.length).toBeGreaterThan(40);
    expect(leaks).toEqual([]);
  });

  it('[K11 — đối chứng KHÔNG chặn oan] support@ đọc được các màn nghiệp vụ', async () => {
    const reads = [
      '/api/v1/goals', '/api/v1/checkins', '/api/v1/evidence', '/api/v1/reviews',
      '/api/v1/kpis', '/api/v1/scorecards', '/api/v1/persons', '/api/v1/org-units',
      '/api/v1/admin/users', '/api/v1/data-catalog', '/api/v1/task-cells',
    ];
    // Chỉ 401/403 mới tính là "chặn". 422 (`/task-cells` đòi versionId) nghĩa là đã QUA cổng
    // quyền rồi mới vướng tham số — đúng thứ ca này muốn thấy; gộp mọi mã ≥400 lại sẽ biến
    // một ràng buộc payload thành báo động quyền giả.
    const blocked: string[] = [];
    for (const url of reads) {
      const res = await api().get(url).set(H(support));
      if (res.status === 401 || res.status === 403) blocked.push(`${url} → ${res.status}`);
    }
    expect(reads.length).toBeGreaterThan(5);
    expect(blocked).toEqual([]);
  });

  it('[J3] support@ KHÔNG đọc được hồ sơ giám sát (audit-logs, export-log, nhật ký đóng vai)', async () => {
    await api().get('/api/v1/audit-logs').set(H(support)).expect(403);
    await api().get('/api/v1/export-log').set(H(support)).expect(403);
    await api().get('/api/v1/admin/impersonation').set(H(support)).expect(403);
  });

  // ═══════════ ② J12① — đóng vai được persona nghiệp vụ thật ═══════════

  it('[J12①] support@ mở được phiên với CẢ BỐN persona nghiệp vụ (cổng ra của lát)', async () => {
    const targets = [
      ['emp1', emp1], ['mgr', mgr], ['hr', hr], ['exec', exec],
    ] as Array<[string, Ctx]>;
    const refused: string[] = [];
    for (const [name, t] of targets) {
      const r = await api().post('/api/v1/admin/impersonation').set(H(support))
        .send({ targetUserId: t.userId, reason: REASON });
      if (r.status !== 201) refused.push(`${name} → ${r.status} ${JSON.stringify(r.body?.error?.message ?? '')}`);
      else {
        // dọn ngay: không để phiên treo ảnh hưởng ca sau (mỗi ca tự dựng trạng thái đầu vào)
        await api().delete('/api/v1/admin/impersonation/current').set(HT(r.body.token, support.id));
      }
    }
    expect(targets.length).toBe(4);
    expect(refused).toEqual([]);
  });

  it('[J12②] support@ KHÔNG đóng vai được auditor@ — không có đường vòng đọc vết', async () => {
    const r = await api().post('/api/v1/admin/impersonation').set(H(support))
      .send({ targetUserId: auditor.userId, reason: REASON });
    expect(r.status).toBe(403);
    const denied = await owner.auditLog.findFirst({
      where: { tenantId: support.id, action: 'admin.impersonation_denied', actorUserId: support.userId },
      orderBy: { id: 'desc' },
    });
    expect((denied!.after as any).rule).toContain('J12②');
  });

  it('[J12⑤] giữ `user:impersonate` ở scope org_unit → 403, không mở được phiên nào', async () => {
    const r = await api().post('/api/v1/admin/impersonation').set(HT(scoped.token, support.id))
      .send({ targetUserId: exec.userId, reason: REASON });
    expect(r.status).toBe(403);
    expect(String(r.body?.error?.message ?? '')).toContain('J12⑤');
  });

  // ═══════════ ③ J11 — trong phiên: đọc được, ghi không ═══════════

  describe('[J11] Phiên đóng vai hr@ — hr THẬT SỰ giữ quyền ghi', () => {
    let impToken: string;
    let sessionId: string;

    beforeAll(async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(H(support))
        .send({ targetUserId: hr.userId, reason: REASON });
      expect(r.status).toBe(201);
      impToken = r.body.token;
      sessionId = r.body.sessionId;
    });

    afterAll(async () => {
      await api().delete('/api/v1/admin/impersonation/current').set(HT(impToken, support.id)).catch(() => {});
    });

    it('đọc được đúng cái hr@ đọc: GET /persons → 200', async () => {
      const r = await api().get('/api/v1/persons').set(HT(impToken, support.id));
      expect(r.status).toBe(200);
    });

    it('[J11] mọi quyền GHI hr@ thật sự giữ đều bị cắt trong phiên', async () => {
      const writes: Array<[string, string]> = [
        ['post', '/api/v1/kpis'],                    // kpi:write — hr CÓ
        ['post', '/api/v1/persons'],                 // person:write — hr CÓ
        ['post', '/api/v1/calibration-sessions'],    // calibration:run — hr CÓ
        ['post', '/api/v1/checkins/00000000-0000-0000-0000-000000000000/review'], // checkin:review — hr CÓ
      ];
      const leaks: string[] = [];
      for (const [m, url] of writes) {
        const res = await (api() as any)[m](url).set(HT(impToken, support.id)).send({});
        if (res.status !== 403) leaks.push(`${m.toUpperCase()} ${url} → ${res.status}`);
      }
      expect(leaks).toEqual([]);
    });

    it('[K3/L1] đường XUẤT dữ liệu của hr@ (payroll:export) không dùng được trong phiên', async () => {
      const r = await api().get('/api/v1/export/payroll?cycle=00000000-0000-0000-0000-000000000000')
        .set(HT(impToken, support.id));
      expect(r.status).toBe(403);
    });

    it('[J11] GET /me/access báo đúng bộ quyền ĐÃ LỌC — không hiện quyền ghi của hr@', async () => {
      const r = await api().get('/api/v1/me/access').set(HT(impToken, support.id));
      expect(r.status).toBe(200);
      expect(r.body.permissions).toContain('person:read');
      expect(r.body.permissions).not.toContain('person:write');
      expect(r.body.permissions).not.toContain('payroll:export');
      expect(r.body.permissions).not.toContain('user:impersonate');
    });

    it('[J12④] token đóng vai của support KHÔNG mở được phiên lồng nhau', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(HT(impToken, support.id))
        .send({ targetUserId: exec.userId, reason: REASON });
      expect(r.status).toBe(403);
    });

    it('[J13] hr@ xem được ai đã đóng vai mình — minh bạch hai chiều', async () => {
      const r = await api().get('/api/v1/me/access').set(H(hr));
      expect(r.status).toBe(200);
      const entry = r.body.impersonatedBy.find((x: any) => x.actorEmail === support.email);
      expect(entry).toBeDefined();
    });

    it('[J13] auditor@ đọc được nhật ký phiên, thấy đúng actor là support@ (không phải hr@)', async () => {
      const r = await api().get('/api/v1/admin/impersonation').set(H(auditor));
      expect(r.status).toBe(200);
      const found = r.body.find((s: any) => s.id === sessionId);
      expect(found).toBeDefined();
      expect(found.actor.email).toBe(support.email);
      expect(found.target.email).toBe(hr.email);
    });
  });

  // ═══════════ ④ J1⑤ — SoD cấp vai ═══════════

  describe('[J1⑤] SoD cấp vai — support ⟂ tenant_admin/org_admin', () => {
    it('gán `tenant_admin` cho người ĐANG giữ `support` → 409', async () => {
      const r = await api().post(`/api/v1/admin/users/${support.userId}/roles`).set(H(admin))
        .send({ roleCode: 'tenant_admin', scopeType: 'tenant' });
      expect(r.status).toBe(409);
      expect(String(r.body?.error?.message ?? '')).toContain('J1⑤');
    });

    it('[chiều ngược] gán `support` cho người ĐANG giữ `org_admin` → 409', async () => {
      const r = await api().post(`/api/v1/admin/users/${orgadmin.userId}/roles`).set(H(admin))
        .send({ roleCode: 'support', scopeType: 'tenant' });
      expect(r.status).toBe(409);
      expect(String(r.body?.error?.message ?? '')).toContain('J1⑤');
    });

    /**
     * Đối chứng KHÔNG chặn oan, và đồng thời là bằng chứng `support` KHÔNG cần ngoại lệ J1①
     * nào: quyền của nó là tập con của `tenant_admin`, nên B1 gán được từ giao diện.
     */
    it('gán `support` cho người không xung đột (exec@) → 201, rồi thu hồi lại', async () => {
      const r = await api().post(`/api/v1/admin/users/${exec.userId}/roles`).set(H(admin))
        .send({ roleCode: 'support', scopeType: 'tenant' });
      expect(r.status).toBe(201);
      const del = await api().delete(`/api/v1/admin/users/${exec.userId}/roles/${r.body.id}`).set(H(admin));
      expect(del.status).toBe(200);
    });
  });

  // ═══════════ ⑤ đối chứng ngược — bản vá J12① giải đúng vấn đề ═══════════

  /**
   * Trước lát này, ca dưới trả 403: `emp1` giữ `goal:write`/`checkin:write`… mà `tenant_admin`
   * không có sau L0 (J2). Đó là lý do tính năng đóng vai không dùng được cho ai. Giữ ca này
   * làm mốc: nếu ai đó hoàn nguyên J12① về "so toàn bộ quyền target", nó đỏ ngay.
   */
  it('[đối chứng] admin@ nay đóng vai được emp1@ — quyền ghi của emp1 không còn chặn oan', async () => {
    const r = await api().post('/api/v1/admin/impersonation').set(H(admin))
      .send({ targetUserId: emp1.userId, reason: REASON });
    expect(r.status).toBe(201);
    // và trong phiên đó vẫn KHÔNG ghi được (J11 giữ nguyên)
    const w = await api().post('/api/v1/goals').set(HT(r.body.token, admin.id)).send({});
    expect(w.status).toBe(403);
    await api().delete('/api/v1/admin/impersonation/current').set(HT(r.body.token, admin.id));
  });
});
