/**
 * Integration [Trục C L2] QUẢN TRỊ NỀN TẢNG — B3 vận hành toàn hệ mà KHÔNG đọc được nội dung.
 *
 * Cạm bẫy lớn nhất của lát này: `platform_admin` lặng lẽ trở thành god-account MỚI — đúng thứ
 * trục B vừa đập bỏ. Nên spec này viết theo hướng **chứng minh điều KHÔNG xảy ra** trước, rồi
 * mới chứng minh tính năng chạy:
 *
 *   ① K9 — quét MỌI endpoint nghiệp vụ bằng token platform@ → 403 hết, không ngoại lệ;
 *   ② K1 — bán kính nổ của GUC `app.platform_read` đo được: bên trong `withPlatform`, mọi
 *      bảng nghiệp vụ trả 0 dòng (vì `app.tenant_id` cố ý không set);
 *   ③ read model chỉ chứa SỐ ĐẾM — quét toàn bộ metrics, không giá trị nào trông giống PII;
 *   ④ đường GHI snapshot không thể ghi cho đơn vị khác (policy ghi tenant-bound);
 *   ⑤ rồi mới tới: B3 thấy đủ hai đơn vị, biết chi phí AI, bật/tắt được cờ, tạo được đơn vị.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7, withPlatform } from '@ipms/db';
import { PLATFORM_ADMIN_PERMISSIONS, isBusinessPermission, PERMISSIONS } from '@ipms/shared';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string }

describe('[Trục C L2] Quản trị nền tảng — B3', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let plat: Ctx;   // platform_admin — danh tính ở H.01, vai toàn hệ
  let admin: Ctx;  // tenant_admin H.01 — ca đối chứng chiều ngược
  let hr: Ctx;
  const createdTenantIds: string[] = [];

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
    return { id: tenant!.id, token, userId: user.id };
  }

  const H = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    plat = await ctxFor('H.01', 'platform@');
    admin = await ctxFor('H.01', 'admin@');
    hr = await ctxFor('H.01', 'hr@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    for (const id of createdTenantIds) {
      await owner.platformSnapshot.deleteMany({ where: { tenantId: id } }).catch(() => {});
      await owner.tenant.delete({ where: { id } }).catch(() => {});
    }
    await owner.featureFlag.deleteMany({ where: { key: { startsWith: 'test.l2.' } } }).catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════ ① K9 — KHÔNG một quyền nghiệp vụ nào ═══════════
  it('[K9] allowlist trong mã và vai trong DB KHỚP NHAU — không thừa, không thiếu', async () => {
    const role = await owner.role.findFirst({
      where: { code: 'platform_admin', tenantId: null },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(role).toBeTruthy();
    const SELF = ['taskdict:read', 'settings.self:read', 'settings.self:update',
      'access.self:read', 'notify.self:read', 'notify.self:update'];
    const inDb = role!.rolePermissions.map((rp) => rp.permission.code)
      .filter((p) => !SELF.includes(p)).sort();
    expect(inDb).toEqual([...PLATFORM_ADMIN_PERMISSIONS].sort());
  });

  it('[K9] không quyền nào của platform_admin là quyền NGHIỆP VỤ', () => {
    const business = PLATFORM_ADMIN_PERMISSIONS.filter((p) => isBusinessPermission(p));
    expect(business).toEqual([]);
    // chống "assert chạy 0 lần": hàm phân loại phải thật sự nhận diện được quyền nghiệp vụ
    expect((PERMISSIONS as readonly string[]).filter(isBusinessPermission).length).toBeGreaterThan(30);
  });

  /**
   * Ca đối chứng bắt buộc của kế hoạch: "driver quét platform_admin qua toàn bộ endpoint
   * nghiệp vụ → 403 tất cả". Danh sách phủ cả 5 loại dữ liệu mà K9 nêu đích danh (review,
   * điểm scorecard, nội dung evidence, PII trong person) cộng các bề mặt quản trị của đơn vị.
   */
  it('[K9] platform@ bị 403 ở MỌI endpoint nghiệp vụ — kể cả của chính đơn vị chứa nó', async () => {
    const endpoints: Array<[string, string]> = [
      ['get', '/api/v1/reviews'], ['get', '/api/v1/review-cycles'],
      ['get', '/api/v1/goals'], ['get', '/api/v1/checkins'],
      ['get', '/api/v1/evidence'], ['get', '/api/v1/persons'],
      ['get', '/api/v1/org-units'], ['get', '/api/v1/kpis'],
      ['get', '/api/v1/scorecards'], ['get', '/api/v1/objectives'],
      ['get', '/api/v1/admin/users'], ['get', '/api/v1/admin/roles'],
      ['get', '/api/v1/admin/tenant-config'], ['get', '/api/v1/audit-logs'],
      ['get', '/api/v1/data-catalog'], ['get', '/api/v1/export-log'],
      ['get', '/api/v1/task-cells'], ['get', '/api/v1/policies'],
      ['get', '/api/v1/exec/overview'], ['get', '/api/v1/ai/economics'],
      ['post', '/api/v1/goals'], ['post', '/api/v1/reviews'],
      ['post', '/api/v1/integrations/outbox/dispatch'],
      ['get', '/api/v1/export/payroll?cycle=00000000-0000-0000-0000-000000000000'],
    ];
    const leaks: string[] = [];
    for (const [method, url] of endpoints) {
      const res = await (api() as any)[method](url).set(H(plat)).send({});
      // 403 = chặn đúng. 404 cũng chấp nhận (route không tồn tại) nhưng 2xx là RÒ.
      if (res.status < 400) leaks.push(`${method.toUpperCase()} ${url} → ${res.status}`);
    }
    expect(endpoints.length).toBeGreaterThan(20);
    expect(leaks).toEqual([]);
  });

  /**
   * [Tự bắt ở L2 — vé nội bộ, không phải Reviewer] Bản đầu cấp `exportlog:read` cho
   * `platform_admin`, đúng như chữ trong kế hoạch. Ca quét K9 ở trên bắt được ngay:
   * `GET /export-log` — sổ vết CHI TIẾT trong phạm vi đơn vị, gác đúng quyền đó — trả 200 cho
   * `platform@`, tức B3 đọc được ai xuất dữ liệu gì đi đâu của H.01. Trùng tên quyền giữa hai
   * tầng là đường rò không nhìn thấy khi đọc mã. Đã tách `exportlog:read_metadata`.
   */
  it('[K1] hai quyền sổ vết TÁCH nhau: platform@ chỉ thấy SỐ ĐẾM, auditor@ thấy chi tiết', async () => {
    // platform@ KHÔNG đọc được sổ vết chi tiết của đơn vị…
    await api().get('/api/v1/export-log').set(H(plat)).expect(403);
    // …nhưng đọc được số đếm toàn hệ
    const counts = await api().get('/api/v1/platform/export-activity').set(H(plat)).expect(200);
    expect(Array.isArray(counts.body.entries)).toBe(true);

    // đối chứng: auditor của đơn vị VẪN đọc được chi tiết (không chặn oan B0)
    const auditorCtx = await ctxFor('H.01', 'auditor@');
    const detail = await api().get('/api/v1/export-log').set(H(auditorCtx)).expect(200);
    expect(detail.body).toHaveProperty('entries');
  });

  it('[K9] ĐỐI CHỨNG chiều ngược: tenant_admin KHÔNG vào được bề mặt nền tảng', async () => {
    for (const url of ['/api/v1/platform/tenants', '/api/v1/platform/health',
      '/api/v1/platform/ai-usage', '/api/v1/platform/flags']) {
      await api().get(url).set(H(admin)).expect(403);
    }
    await api().post('/api/v1/platform/tenants').set(H(admin))
      .send({ code: 'X.99', nameVi: 'thử', type: 'opco' }).expect(403);
  });

  // ═══════════ ② K1 — bán kính nổ của GUC đo được ═══════════
  /**
   * Đây là ca chứng minh vì sao KHÔNG cần BYPASSRLS. `withPlatform` bật GUC đọc nhưng cố ý
   * không set `app.tenant_id` ⇒ policy của mọi bảng nghiệp vụ so với NULL ⇒ 0 dòng. Nếu ai đó
   * sau này "tiện tay" thêm `app.tenant_id` vào `withPlatform`, hoặc thêm policy platform_read
   * cho một bảng nghiệp vụ, ca này đỏ ngay.
   */
  it('[K1] trong withPlatform: bảng nghiệp vụ trả 0 dòng, chỉ tenant + snapshot đọc được', async () => {
    const appClient = createPrismaClient(process.env.DATABASE_URL);
    try {
      const r = await withPlatform(appClient, async (tx) => ({
        tenants: await tx.tenant.count({ where: { deletedAt: null } }),
        snapshots: await tx.platformSnapshot.count(),
        reviews: await tx.review.count(),
        persons: await tx.person.count(),
        evidence: await tx.evidence.count(),
        users: await tx.appUser.count(),
        auditLogs: await tx.auditLog.count(),
        exportLogs: await tx.exportLog.count(),
        scorecards: await tx.scorecard.count(),
      }));
      expect(r.tenants).toBeGreaterThanOrEqual(2);   // metadata: thấy
      expect(r.reviews).toBe(0);                      // nội dung: KHÔNG
      expect(r.persons).toBe(0);
      expect(r.evidence).toBe(0);
      expect(r.users).toBe(0);
      expect(r.auditLogs).toBe(0);
      expect(r.exportLogs).toBe(0);
      expect(r.scorecards).toBe(0);
    } finally {
      await appClient.$disconnect();
    }
  });

  it('[K1] đối chứng: cùng dữ liệu đó ĐỌC ĐƯỢC khi có tenant context hợp lệ', async () => {
    const rows = await owner.person.count({ where: { tenantId: plat.id, deletedAt: null } });
    expect(rows).toBeGreaterThan(0);   // dữ liệu CÓ thật — ca trên rỗng vì RLS, không vì DB rỗng
  });

  // ═══════════ ⑤ tính năng: làm mới + đọc toàn hệ ═══════════
  it('làm mới snapshot: chạy được, phủ mọi đơn vị', async () => {
    const r = await api().post('/api/v1/platform/snapshot/refresh').set(H(plat)).send({}).expect(201);
    expect(r.body.refreshed).toBeGreaterThanOrEqual(2);
    expect(r.body.results.every((x: any) => !x.error)).toBe(true);
  });

  it('B3 thấy ĐỦ các đơn vị (xuyên đơn vị thật) kèm trạng thái', async () => {
    const r = await api().get('/api/v1/platform/tenants').set(H(plat)).expect(200);
    expect(r.body.total).toBeGreaterThanOrEqual(2);
    const codes = r.body.entries.map((e: any) => e.code);
    expect(codes).toContain('H.01');
    expect(codes).toContain('T2.TEST');
    for (const e of r.body.entries) {
      expect(['ok', 'warn', 'alert', 'unknown']).toContain(e.health);
    }
  });

  // ═══════════ ③ read model CHỈ số đếm ═══════════
  /**
   * Bất biến khó giữ nhất về lâu dài: ai đó thêm "tên đơn vị đang cháy" hay "email người phụ
   * trách" vào metrics cho tiện hiển thị. Quét giá trị thay vì tin quy ước.
   */
  it('[K1] metrics chỉ chứa SỐ ĐẾM — không chuỗi nào trông giống PII', async () => {
    const r = await api().get('/api/v1/platform/tenants').set(H(plat)).expect(200);
    const withMetrics = r.body.entries.filter((e: any) => e.metrics);
    expect(withMetrics.length).toBeGreaterThan(0);
    const PII = /@|[A-Za-zÀ-ỹ]{2,}\s+[A-Za-zÀ-ỹ]{2,}/;   // email, hoặc "Họ Tên"
    const offenders: string[] = [];
    for (const e of withMetrics) {
      for (const [k, v] of Object.entries(e.metrics as Record<string, unknown>)) {
        if (typeof v === 'number' || v === null) continue;
        if (typeof v === 'string') {
          // chuỗi hợp lệ duy nhất: dấu thời gian ISO
          if (!Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v)) continue;
          if (PII.test(v)) { offenders.push(`${e.code}.${k} = ${v}`); continue; }
          offenders.push(`${e.code}.${k} là chuỗi không phải dấu thời gian: ${v}`);
        } else {
          offenders.push(`${e.code}.${k} không phải số/chuỗi: ${JSON.stringify(v)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('chi phí AI theo đơn vị: có số, không có một dòng hội thoại nào', async () => {
    const r = await api().get('/api/v1/platform/ai-usage').set(H(plat)).expect(200);
    expect(typeof r.body.totalCostUsd).toBe('number');
    expect(r.body.entries.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(r.body)).not.toMatch(/prompt|completion|message|content/i);
  });

  it('sức khoẻ toàn hệ + trạng thái tích hợp + số lần xuất: trả về số, không nội dung', async () => {
    const h = await api().get('/api/v1/platform/health').set(H(plat)).expect(200);
    expect(['ok', 'warn', 'alert']).toContain(h.body.overall);
    expect(h.body.tenants).toBeGreaterThanOrEqual(2);

    const i = await api().get('/api/v1/platform/integrations').set(H(plat)).expect(200);
    expect(Array.isArray(i.body.entries)).toBe(true);

    const e = await api().get('/api/v1/platform/export-activity').set(H(plat)).expect(200);
    expect(Array.isArray(e.body.entries)).toBe(true);
    // KHÔNG có chi tiết từng lần xuất — đó là hồ sơ của B0
    expect(JSON.stringify(e.body)).not.toMatch(/assetCode|destination|actorUserId/);
  });

  // ═══════════ ④ đường ghi tenant-bound ═══════════
  it('[K1] policy ghi snapshot là tenant-bound — không ghi được cho đơn vị khác', async () => {
    const appClient = createPrismaClient(process.env.DATABASE_URL);
    const t2 = await owner.tenant.findUnique({ where: { code: 'T2.TEST' } });
    try {
      // đang trong tenant context H.01 mà cố ghi dòng của T2 → RLS chặn
      await expect(
        appClient.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${plat.id}, true)`;
          await tx.platformSnapshot.create({
            data: { id: uuidv7(), tenantId: t2!.id, metrics: {}, health: 'ok' },
          });
        }),
      ).rejects.toThrow();
    } finally {
      await appClient.$disconnect();
    }
  });

  // ═══════════ hai hành động vận hành ═══════════
  it('bật/tắt cờ tính năng TOÀN CỤC — bề mặt duy nhất ghi được hàng global', async () => {
    const key = `test.l2.${Date.now()}`;
    const a = await api().put(`/api/v1/platform/flags/${key}`).set(H(plat))
      .send({ enabled: true }).expect(200);
    expect(a.body).toMatchObject({ key, enabled: true, scope: 'global', created: true });

    const list = await api().get('/api/v1/platform/flags').set(H(plat)).expect(200);
    const found = list.body.entries.find((f: any) => f.key === key);
    expect(found).toMatchObject({ enabled: true, scope: 'global' });

    const b = await api().put(`/api/v1/platform/flags/${key}`).set(H(plat))
      .send({ enabled: false }).expect(200);
    expect(b.body).toMatchObject({ enabled: false, created: false });
  });

  it('khoá cờ không hợp lệ → 422 (không lọt vào bảng global)', async () => {
    await api().put('/api/v1/platform/flags/KHONG HOP LE').set(H(plat))
      .send({ enabled: true }).expect(422);
  });

  it('tạo đơn vị mới — và đơn vị đó hiện ngay trong danh sách toàn hệ', async () => {
    const code = `TL2.${String(Date.now()).slice(-6)}`;
    const r = await api().post('/api/v1/platform/tenants').set(H(plat))
      .send({ code, nameVi: 'Đơn vị thử L2', type: 'opco' }).expect(201);
    expect(r.body.code).toBe(code);
    createdTenantIds.push(r.body.tenantId);

    const list = await api().get('/api/v1/platform/tenants').set(H(plat)).expect(200);
    expect(list.body.entries.map((e: any) => e.code)).toContain(code);
    // đơn vị mới chưa có snapshot ⇒ phải nói ra, không im lặng hiển thị 'ok'
    const fresh = list.body.entries.find((e: any) => e.code === code);
    expect(fresh.health).toBe('unknown');
    expect(list.body.staleWarning).toBeTruthy();
  });

  it('mã đơn vị trùng → 409; mã sai định dạng → 422', async () => {
    await api().post('/api/v1/platform/tenants').set(H(plat))
      .send({ code: 'H.01', nameVi: 'trùng', type: 'opco' }).expect(409);
    await api().post('/api/v1/platform/tenants').set(H(plat))
      .send({ code: 'sai thường', nameVi: 'x', type: 'opco' }).expect(422);
    await api().post('/api/v1/platform/tenants').set(H(plat))
      .send({ code: 'OK.1', nameVi: 'x', type: 'khong-hop-le' }).expect(422);
  });

  // ═══════════ phòng tuyến thứ hai của K9 ═══════════
  /**
   * Guard RBAC chặn theo permission, nên nếu ai đó CẤP THÊM quyền nghiệp vụ cho vai
   * `platform_admin` trong DB thì guard vẫn cho qua — quyền có thật mà. Chỉ phép so với
   * allowlist trong mã bắt được. Ca này dựng đúng tình huống đó rồi hoàn nguyên.
   */
  it('[K9] cấp lén một quyền nghiệp vụ cho platform_admin → bề mặt nền tảng TỰ KHOÁ (409)', async () => {
    const role = await owner.role.findFirst({ where: { code: 'platform_admin', tenantId: null } });
    const perm = await owner.permission.findFirst({ where: { code: 'review:read' } });
    await owner.rolePermission.create({ data: { roleId: role!.id, permissionId: perm!.id } });
    try {
      const r = await api().get('/api/v1/platform/tenants').set(H(plat)).expect(409);
      expect(String(r.body?.error?.message ?? '')).toContain('review:read');
    } finally {
      await owner.rolePermission.delete({
        where: { roleId_permissionId: { roleId: role!.id, permissionId: perm!.id } },
      });
    }
    // hoàn nguyên xong phải hoạt động lại — chứng minh ca trên không để lại hư hại
    await api().get('/api/v1/platform/tenants').set(H(plat)).expect(200);
  });

  it('hrbp (vai nghiệp vụ mạnh) cũng KHÔNG vào được bề mặt nền tảng', async () => {
    await api().get('/api/v1/platform/tenants').set(H(hr)).expect(403);
    await api().get('/api/v1/platform/ai-usage').set(H(hr)).expect(403);
  });
});
