/**
 * Integration [Trục C L1] KIỂM SOÁT XUẤT DỮ LIỆU — cổng ra của lát.
 *
 * Kế hoạch trục C §4 L1 đòi đúng bốn bằng chứng, và spec này đi theo thứ tự đó:
 *   ① mỗi đường xuất sinh một bản ghi `export_log` ĐỦ BỐN THÔNG TIN (mã dữ liệu · mức phân
 *      loại · đích · số bản ghi);
 *   ② route cố tình không khai `@Exported` → 403 (K2, fail-closed — không có "cảnh báo rồi
 *      cho qua"). Chứng minh bằng một controller thăm dò dựng NGAY TRONG spec: không thể
 *      chứng minh bằng route sản phẩm, vì mọi route sản phẩm đều đã khai đủ;
 *   ③ `UPDATE`/`DELETE` trên `export_log` bị DB từ chối (K6);
 *   ④ trần phân loại có hiệu lực THẬT: `data_steward` siết một mã lên `restricted` (L0) thì
 *      đường xuất dùng mã đó ĐÓNG LẠI ngay — sổ đăng ký không phải tài liệu trang trí.
 *
 * Cộng hai ca đối chứng mà kế hoạch dặn ("tránh chặn oan đường hợp lệ"): route thường không
 * bị guard này chạm, và `public`/`internal` đi qua không cần quyền bổ sung.
 */
import { Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { RequirePermission } from '../../src/common/auth/decorators';
import { looksLikeEgress } from '../../src/common/export/export-surface';

jest.setTimeout(180_000);

/**
 * Controller THĂM DÒ — chỉ tồn tại trong test. `GET /probe/export/undeclared` có đường dẫn
 * trông y hệt một đường xuất và KHÔNG khai `@Exported`; `GET /probe/plain` là ca đối chứng
 * (đường dẫn thường, cùng permission) để chứng minh guard không chặn bừa mọi thứ.
 */
@Controller('probe')
class ProbeController {
  @Get('export/undeclared')
  @RequirePermission('tenant:read')
  undeclared() { return { rows: [1, 2, 3] }; }

  @Get('plain')
  @RequirePermission('tenant:read')
  plain() { return { ok: true }; }
}

interface Ctx { id: string; token: string; userId: string }

describe('[Trục C L1] Kiểm soát xuất dữ liệu', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let hr: Ctx;        // hrbp — payroll:export + integration:run
  let admin: Ctx;     // tenant_admin — người CẤP vai `export_officer` (không tự xuất được)
  let emp: Ctx;       // employee — ca đối chứng: có trần mà không có đường xuất
  let auditorC: Ctx;  // auditor — vai DUY NHẤT đọc được sổ vết xuất ở L1
  let steward: Ctx;   // data_steward — siết mức phân loại
  let t2aud: Ctx;     // auditor bên T2 — ca cô lập tenant
  let cycleId: string;
  const cleanups: Array<() => Promise<void>> = [];
  /**
   * `export_log` là APPEND-ONLY (K6) ⇒ KHÔNG dọn được sau mỗi lần chạy, kể cả bằng owner
   * connection. Nghĩa là mọi khẳng định "có đúng N dòng" phải tính từ MỐC đầu phiên, không
   * phải từ 0 — bản đầu của spec này viết `toBe(0)` và xanh đúng một lần rồi đỏ ở lần chạy
   * thứ hai. Chính bất biến của lát này làm test của lát này không được viết theo lối cũ.
   */
  let baselineId = 0n;
  const sinceBaseline = () => ({ id: { gt: baselineId } });

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
    // Cùng lý do như `datacatalog.spec`: spec này siết/nới mức phân loại nên phải tự dựng
    // trạng thái đầu vào, không dựa vào việc DB chưa có override nào của đơn vị.
    await owner.dataAsset.deleteMany({ where: { tenantId: { not: null } } }).catch(() => {});
    hr = await ctxFor('H.01', 'hr@');
    admin = await ctxFor('H.01', 'admin@');
    emp = await ctxFor('H.01', 'emp1@');
    auditorC = await ctxFor('H.01', 'auditor@');
    steward = await ctxFor('H.01', 'steward@');
    t2aud = await ctxFor('T2.TEST', 'auditor@');

    // Kỳ đánh giá riêng của spec này — không dựa vào kỳ do spec khác tạo (thứ tự suite không
    // phải là hợp đồng). Không có review nào bên trong ⇒ xuất 0 bản ghi, vẫn PHẢI ghi vết.
    const cycle = await owner.reviewCycle.create({
      data: {
        id: uuidv7(), tenantId: hr.id, name: 'Kỳ thử export control (L1)',
        period: `EXPORT-L1-${Date.now()}`, status: 'closed',
      },
    });
    cycleId = cycle.id;
    cleanups.push(async () => {
      await owner.reviewCycle.delete({ where: { id: cycle.id } }).catch(() => {});
    });

    const last = await owner.exportLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    baselineId = last?.id ?? 0n;

    const mod = await Test.createTestingModule({
      imports: [AppModule], controllers: [ProbeController],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    // [bài học trục B ③] hoàn nguyên theo thứ tự ngược, mỗi bước tự chịu lỗi
    for (const c of cleanups.reverse()) await c().catch(() => {});
    await owner.dataAsset.deleteMany({ where: { tenantId: { not: null } } }).catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  // ═══════════ ② K2 — fail-closed: không khai thì không xuất ═══════════
  it('[K2] route trông như đường xuất mà KHÔNG khai @Exported → 403, không phải cảnh báo', async () => {
    const r = await api().get('/api/v1/probe/export/undeclared').set(H(hr)).expect(403);
    expect(String(r.body?.error?.message ?? '')).toContain('@Exported');
  });

  it('ĐỐI CHỨNG: route thường (cùng permission) KHÔNG bị ExportGuard chạm → 200', async () => {
    await api().get('/api/v1/probe/plain').set(H(hr)).expect(200);
  });

  // ═══════════ trần theo mức phân loại ═══════════
  /**
   * Đây là ca đắt nhất về mặt quyết định: TRƯỚC lát này `hrbp` xuất được kết quả đánh giá ra
   * hệ lương chỉ vì mang vai hrbp. Nay `review.result` là `confidential` ⇒ cần thêm
   * `export:confidential`, và quyền đó không nằm trong vai nào. Test đỏ ở đây KHÔNG phải lỗi
   * — nó là bằng chứng cổng đã đóng.
   */
  it('xuất `confidential` mà thiếu `export:confidential` → 403 dù RBAC đã cho qua', async () => {
    const r = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(H(hr)).expect(403);
    expect(String(r.body?.error?.message ?? '')).toContain('export:confidential');
  });

  it('KHÔNG ghi vết khi bị chặn — sổ vết không phản ánh lần xuất chưa xảy ra', async () => {
    const rows = await owner.exportLog.findMany({
      where: { tenantId: hr.id, assetCode: 'review.result', ...sinceBaseline() },
    });
    expect(rows.length).toBe(0);
  });

  // ═══════════ ① đường xuất hợp lệ sinh vết đủ bốn thông tin ═══════════
  /**
   * [Trục C L1 — quyết định chủ dự án 30/07 "giữ nguyên + B1 cấp cho 1–2 người"]
   *
   * Nhóm này cấp quyền QUA ĐÚNG ĐƯỜNG SẢN PHẨM — `POST /admin/users/:id/roles` với vai
   * `export_officer` — chứ không dựng vai bằng owner connection. Đó là điểm cốt yếu: nếu chỉ
   * test được bằng cách sửa DB thì quyết định trên KHÔNG thực hiện được trên giao diện, và
   * lát này giao cho B1 một việc họ không làm được.
   */
  describe('sau khi B1 cấp vai `export_officer` cho đúng người (qua API quản trị thật)', () => {
    beforeAll(async () => {
      // Đăng ký thu hồi TRƯỚC khi cấp (bài học trục B ③) — chưa biết userRoleId nên đóng
      // biến để cleanup đọc giá trị mới nhất.
      let userRoleId: string | null = null;
      cleanups.push(async () => {
        if (userRoleId) {
          await request(app.getHttpServer())
            .delete(`/api/v1/admin/users/${hr.userId}/roles/${userRoleId}`).set(H(admin));
        }
      });
      const r = await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${hr.userId}/roles`).set(H(admin))
        .send({ roleCode: 'export_officer', scopeType: 'tenant' })
        .expect(201);
      userRoleId = r.body?.id ?? r.body?.userRoleId ?? null;
      expect(userRoleId).toBeTruthy();
    });

    it('vai vừa cấp hiện trong effective-access của người nhận (B1 kiểm chứng được)', async () => {
      const r = await api().get(`/api/v1/admin/users/${hr.userId}/effective-access`).set(H(admin)).expect(200);
      expect(JSON.stringify(r.body)).toContain('export:confidential');
    });

    it('xuất sang OneOffice: 200 + đúng MỘT bản ghi export_log đủ bốn thông tin', async () => {
      const before = await owner.exportLog.count({ where: { tenantId: hr.id, ...sinceBaseline() } });
      const res = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(H(hr)).expect(200);
      expect(Array.isArray(res.body.records)).toBe(true);

      const rows = await owner.exportLog.findMany({
        where: { tenantId: hr.id, ...sinceBaseline() }, orderBy: { id: 'desc' }, take: 1,
      });
      expect(await owner.exportLog.count({ where: { tenantId: hr.id, ...sinceBaseline() } }))
        .toBe(before + 1);
      expect(rows[0]).toMatchObject({
        assetCode: 'review.result',            // ① dữ liệu nào
        classification: 'confidential',        // ② mức phân loại
        destination: 'oneoffice',              // ③ đi đâu
        destinationKind: 'internal_system',
        recordCount: res.body.records.length,  // ④ bao nhiêu bản ghi
        actorUserId: hr.userId,
      });
      expect(rows[0].route).toContain('/export/payroll');
      expect(rows[0].rule).toBeTruthy();
      // [J11 — chống hồi quy] không phiên đóng vai nào dính vào đường xuất
      expect(rows[0].onBehalfOfUserId).toBeNull();
    });

    it('xuất 0 bản ghi VẪN ghi vết (một truy vấn rỗng cũng là bằng chứng ai đó đã thử lấy gì)', async () => {
      const rows = await owner.exportLog.findMany({
        where: { tenantId: hr.id, assetCode: 'review.result', ...sinceBaseline() },
        orderBy: { id: 'desc' }, take: 1,
      });
      expect(rows.length).toBe(1);
      expect(rows[0].recordCount).toBe(0);   // kỳ do spec tạo không có review nào
    });

    // ═══════════ ③ K6 — append-only ═══════════
    it('[K6] UPDATE và DELETE trên export_log bị DB từ chối, kể cả bằng owner connection', async () => {
      const row = await owner.exportLog.findFirst({ where: { tenantId: hr.id }, orderBy: { id: 'desc' } });
      expect(row).toBeTruthy();
      await expect(
        owner.exportLog.update({ where: { id: row!.id }, data: { recordCount: 999 } }),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.exportLog.delete({ where: { id: row!.id } }),
      ).rejects.toThrow(/append-only/);
    });
  });

  // ═══════════ ngoại lệ J1① cho `export_officer` KHÔNG mở đường leo thang ═══════════
  /**
   * `tenant_admin` gán được vai này dù không giữ `export:confidential`. Ba ca dưới là ba chốt
   * độc lập giữ cho ngoại lệ đó không thành cửa sau — mất một vẫn còn hai.
   */
  describe('ngoại lệ J1① cho vai uỷ nhiệm — ba chốt chống leo thang', () => {
    it('① tenant_admin KHÔNG tự gán vai này cho chính mình (J1③)', async () => {
      const r = await api().post(`/api/v1/admin/users/${admin.userId}/roles`).set(H(admin))
        .send({ roleCode: 'export_officer', scopeType: 'tenant' });
      expect([409, 403]).toContain(r.status);
    });

    it('② sai scope thì KHÔNG được miễn trừ — rơi về J1① như mọi vai khác', async () => {
      const r = await api().post(`/api/v1/admin/users/${emp.userId}/roles`).set(H(admin))
        .send({ roleCode: 'export_officer', scopeType: 'self' })
        .expect(403);
      expect(String(r.body?.error?.message ?? '')).toContain('J1①');
    });

    /**
     * ③ Ca quan trọng nhất: quyền này NÂNG TRẦN, không phải quyền hành động. Người chỉ có nó
     * vẫn không xuất được gì vì mọi đường xuất còn gác một quyền nghiệp vụ. Nếu ngày nào ca
     * này đỏ (emp1 xuất được), nghĩa là ngoại lệ J1① đã thành đường phát năng lực thật.
     */
    it('③ người CHỈ có trần xuất vẫn không xuất được gì — thiếu quyền nghiệp vụ của đường xuất', async () => {
      let userRoleId: string | null = null;
      cleanups.push(async () => {
        if (userRoleId) {
          await request(app.getHttpServer())
            .delete(`/api/v1/admin/users/${emp.userId}/roles/${userRoleId}`).set(H(admin));
        }
      });
      const g = await api().post(`/api/v1/admin/users/${emp.userId}/roles`).set(H(admin))
        .send({ roleCode: 'export_officer', scopeType: 'tenant' })
        .expect(201);
      userRoleId = g.body?.id ?? g.body?.userRoleId ?? null;

      // 403 vì PermissionGuard (thiếu payroll:export) — chặn TRƯỚC cả ExportGuard
      await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(H(emp)).expect(403);
      await api().post('/api/v1/integrations/outbox/dispatch').set(H(emp)).send({}).expect(403);
    });

    it('tenant_admin KHÔNG gán được `hrbp` — không tự dựng được người xuất từ đầu', async () => {
      const r = await api().post(`/api/v1/admin/users/${emp.userId}/roles`).set(H(admin))
        .send({ roleCode: 'hrbp', scopeType: 'tenant' })
        .expect(403);
      expect(String(r.body?.error?.message ?? '')).toContain('J1①');
    });
  });

  // ═══════════ đường xuất `internal` — đối chứng "không chặn oan" ═══════════
  it('`internal` ra hệ ngoài đi được, không đòi quyền bổ sung, vẫn ghi vết', async () => {
    const before = await owner.exportLog.count({
      where: { tenantId: hr.id, assetCode: 'system.log', ...sinceBaseline() },
    });
    await api().post('/api/v1/integrations/outbox/dispatch').set(H(hr)).send({}).expect(201);
    const after = await owner.exportLog.findMany({
      where: { tenantId: hr.id, assetCode: 'system.log', ...sinceBaseline() },
      orderBy: { id: 'desc' },
    });
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({
      classification: 'internal', destinationKind: 'external_service',
      destination: 'integration_connector',
    });
    expect(after[0].recordCount).toBeGreaterThanOrEqual(0);
  });

  // ═══════════ ④ sổ đăng ký (L0) điều khiển được cổng xuất (L1) ═══════════
  /**
   * Ca chứng minh hai lát nối thật vào nhau: không mock, không cờ cấu hình — `data_steward`
   * đi qua API sổ đăng ký siết `system.log` lên `restricted`, và đường xuất đang dùng mã đó
   * đóng lại NGAY request sau. Nếu ExportGuard đọc mức phân loại từ hằng số trong mã (như
   * trước L0) thì ca này xanh giả mà cổng vẫn mở.
   */
  it('[K3] data_steward siết mã lên `restricted` → đường xuất dùng mã đó ĐÓNG ngay', async () => {
    await api().put('/api/v1/data-catalog/system.log').set(H(steward))
      .send({ classification: 'restricted' }).expect(200);

    const r = await api().post('/api/v1/integrations/outbox/dispatch').set(H(hr)).send({}).expect(403);
    expect(String(r.body?.error?.message ?? '')).toContain('K3');

    const rows = await owner.exportLog.findMany({
      where: { tenantId: hr.id, assetCode: 'system.log', ...sinceBaseline() },
      orderBy: { id: 'desc' }, take: 1,
    });
    expect(rows[0]?.classification).not.toBe('restricted');   // bị chặn thì không có vết mới

    // hoàn nguyên: xoá bản riêng của đơn vị → mã trở lại 'internal' của bản chuẩn
    await owner.dataAsset.deleteMany({ where: { tenantId: hr.id, code: 'system.log' } });
    await api().post('/api/v1/integrations/outbox/dispatch').set(H(hr)).send({}).expect(201);
  });

  // ═══════════ đọc sổ vết — phân quyền + cô lập ═══════════
  it('auditor đọc được sổ vết xuất; hrbp (người xuất) KHÔNG đọc được', async () => {
    const r = await api().get('/api/v1/export-log').set(H(auditorC)).expect(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.entries[0]).toHaveProperty('assetCode');
    expect(r.body.entries[0]).toHaveProperty('recordCount');
    await api().get('/api/v1/export-log').set(H(hr)).expect(403);
  });

  it('CÔ LẬP: auditor T2 không thấy một dòng nào của H.01', async () => {
    const r = await api().get('/api/v1/export-log').set(H(t2aud)).expect(200);
    expect(r.body.entries.every((e: any) => e.actorUserId !== hr.userId)).toBe(true);
    const t2Rows = await owner.exportLog.count({ where: { tenantId: t2aud.id } });
    expect(r.body.total).toBe(Math.min(t2Rows, 100));
    // Chống "xanh vì cả hai đều rỗng": bên H.01 CÓ dòng thật mà T2 vẫn không thấy.
    expect(await owner.exportLog.count({ where: { tenantId: hr.id } })).toBeGreaterThan(0);
  });

  // ═══════════ BỀ MẶT XUẤT — lớp fail-closed lúc BUILD ═══════════
  /**
   * Heuristic runtime bắt được route "trông như đường xuất". Nó KHÔNG bắt được route tên vô
   * hại mà vẫn đẩy dữ liệu ra ngoài (`POST /integrations/jobs/morning-todos/run`). Snapshot
   * dưới đây là lớp thứ hai: quét TOÀN BỘ route đã đăng ký của app, và mọi route khớp
   * heuristic đều phải nằm trong danh sách đã rà. Thêm route mới kiểu đó ⇒ test ĐỎ ⇒ có người
   * phải quyết định "đây là đường xuất (khai @Exported) hay không (khai @ExportExempt)".
   */
  const REVIEWED_EGRESS_SURFACE = [
    'GET /api/v1/export/payroll',                 // @Exported review.result → oneoffice
    'POST /api/v1/integrations/outbox/dispatch',  // @Exported system.log → connector ngoài
    'GET /api/v1/export-log',                     // @ExportExempt — đọc chính sổ vết
    'GET /api/v1/probe/export/undeclared',        // controller thăm dò của chính spec này
    // [Trục C L2] @ExportExempt — số đếm hoạt động xuất theo đơn vị cho tầng nền tảng.
    // Dòng này được thêm vì test NÀY đỏ khi L2 tạo route mới: lớp fail-closed build-time hoạt
    // động đúng như thiết kế — route dạng xuất mới không thể lặng lẽ xuất hiện.
    'GET /api/v1/platform/export-activity',
  ].sort();
  // `POST /integrations/import/csv` KHÔNG có trong danh sách này: `INGRESS_MARKERS` loại nó
  // khỏi heuristic trước khi tới đây (dữ liệu VÀO). Nó vẫn khai `@ExportExempt` — dư về mặt
  // runtime, nhưng là chỗ ghi ý định cho lần ai đó nới rộng hint và vô tình quét trúng.

  it('mọi route khớp heuristic egress đều đã được rà (snapshot bề mặt xuất)', () => {
    const server: any = app.getHttpServer();
    const stack: any[] = server?._events?.request?._router?.stack ?? server?._router?.stack ?? [];
    const routes: string[] = [];
    for (const layer of stack) {
      const path = layer?.route?.path;
      if (!path) continue;
      for (const m of Object.keys(layer.route.methods ?? {})) {
        routes.push(`${m.toUpperCase()} ${path}`);
      }
    }
    // Không liệt kê được route ⇒ test này vô nghĩa mà vẫn xanh — chặn đúng cái bẫy đó.
    expect(routes.length).toBeGreaterThan(50);

    const matched = routes.filter((r) => looksLikeEgress(r.split(' ')[1])).sort();
    expect(matched).toEqual(REVIEWED_EGRESS_SURFACE);
  });

  /**
   * `morning-todos/run` KHÔNG khớp heuristic (tên vô hại) nhưng CÓ khai `@Exported` — bằng
   * chứng hành vi cho phần mà snapshot đường dẫn không thể canh.
   */
  it('đường xuất "tên vô hại" vẫn ghi vết: job morning-todos → hệ todo ngoài', async () => {
    const where = { tenantId: hr.id, assetCode: 'objective.kpi', ...sinceBaseline() };
    const before = await owner.exportLog.count({ where });
    const res = await api().post('/api/v1/integrations/jobs/morning-todos/run').set(H(hr)).send({});
    // 201 khi tenant có binding morning_todos, 422 khi chưa cấu hình — chỉ ca 201 mới thực sự
    // có dòng dữ liệu ra, và chỉ khi đó mới đòi có vết. Không ép tenant phải có binding: ca
    // này kiểm HÀNH VI GHI VẾT của đường xuất, không kiểm cấu hình tích hợp.
    if (res.status === 201) {
      expect(await owner.exportLog.count({ where })).toBe(before + 1);
      const rows = await owner.exportLog.findMany({ where, orderBy: { id: 'desc' }, take: 1 });
      expect(rows[0]).toMatchObject({
        classification: 'internal', destination: 'external_todo',
        destinationKind: 'external_service',
      });
    } else {
      expect([422, 404]).toContain(res.status);
      expect(await owner.exportLog.count({ where })).toBe(before);
    }
  });
});
