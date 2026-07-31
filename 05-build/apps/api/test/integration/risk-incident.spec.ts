/**
 * Integration [Trục C — L4] Cờ rủi ro sinh tự động (K8) + luồng sự cố.
 *
 * Cổng ra của kế hoạch §4 L4:
 *   "tạo một vi phạm phân tách nhiệm vụ THẬT → cờ xuất hiện trên cả bốn đường, không cần ai
 *    nhập tay."
 *
 * Ca chính dưới đây làm đúng thế: nó KHÔNG chèn một dòng `risk_flag` nào, cũng không gọi bộ
 * sinh trực tiếp. Nó gây ra một vi phạm thật qua API (gán vai vượt quyền → J1① chặn), rồi
 * kiểm cờ hiện ra ở cả bốn bề mặt đọc. Một test chèn thẳng dữ liệu vào bảng cờ sẽ xanh y hệt
 * mà không chứng minh được điều đáng chứng minh nhất: dây nối từ sự kiện tới dashboard.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { RISK_KINDS } from '@ipms/shared';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(240_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('[Trục C L4] Cờ rủi ro + luồng sự cố', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let steward: Ctx;   // data_steward — B5: đọc chi tiết + mở/đóng sự cố
  let auditor: Ctx;   // auditor — B0: đọc chi tiết + đọc sự cố, KHÔNG xử lý
  let exec: Ctx;      // exec_viewer — V1: chỉ bản tổng hợp
  let plat: Ctx;      // platform_admin — B3: số đếm xuyên đơn vị
  let admin: Ctx;     // tenant_admin — người gây ra vi phạm trong ca cổng ra
  let hr: Ctx;

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

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    steward = await ctxFor('steward@');
    auditor = await ctxFor('auditor@');
    exec = await ctxFor('exec@');
    plat = await ctxFor('platform@');
    admin = await ctxFor('admin@');
    hr = await ctxFor('hr@');

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

  // ═══════════ CỔNG RA — một vi phạm thật, bốn đường đọc ═══════════

  describe('[K8 — CỔNG RA] Vi phạm thật → cờ hiện trên cả bốn đường, không ai nhập tay', () => {
    let flagId: string;

    it('gây một vi phạm THẬT: tenant_admin gán vai `hrbp` (vượt quyền) → 403 (J1①)', async () => {
      const r = await api().post(`/api/v1/admin/users/${hr.userId}/roles`).set(H(admin))
        .send({ roleCode: 'hrbp', scopeType: 'tenant' });
      expect(r.status).toBe(403);
      // vết gốc phải tồn tại — cờ chỉ là lớp SUY RA từ nó, không phải nguồn sự thật thứ hai
      const src = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.role_grant_denied', actorUserId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect(src).not.toBeNull();
    });

    it('[đường ①: B5 tuân thủ] `GET /risk` — cờ hiện NGAY, không cần gọi bộ sinh', async () => {
      const r = await api().get('/api/v1/risk?severity=high').set(H(steward));
      expect(r.status).toBe(200);
      const f = r.body.entries.find((e: any) => e.kind === 'privilege_escalation_blocked');
      expect(f).toBeDefined();
      expect(f.actor.email).toBe(admin.email);
      expect(f.incidentId).toBeNull();
      flagId = f.id;
    });

    it('[đường ②: B0 kiểm toán] auditor đọc được cùng cờ đó', async () => {
      const r = await api().get('/api/v1/risk').set(H(auditor));
      expect(r.status).toBe(200);
      expect(r.body.entries.some((e: any) => e.id === flagId)).toBe(true);
    });

    it('[đường ③: V1 điều hành] `GET /risk/summary` — chỉ SỐ ĐẾM, không chi tiết', async () => {
      const r = await api().get('/api/v1/risk/summary').set(H(exec));
      expect(r.status).toBe(200);
      expect(r.body.bySeverity.high).toBeGreaterThan(0);
      expect(r.body.byKind.privilege_escalation_blocked).toBeGreaterThan(0);
      // Không có bất kỳ trường chi tiết nào lọt vào bản tổng hợp
      const blob = JSON.stringify(r.body);
      expect(blob).not.toContain(admin.email);
      expect(blob).not.toContain(flagId);
      // hiện ĐỦ mọi nhóm, kể cả nhóm đang bằng 0
      for (const k of RISK_KINDS) expect(r.body.byKind).toHaveProperty(k);
    });

    it('[đường ④: B3 nền tảng] `/platform/risk` — số đếm theo đơn vị, không đọc được nội dung', async () => {
      await api().post('/api/v1/platform/snapshot/refresh').set(H(plat)).send({}).expect(201);
      const r = await api().get('/api/v1/platform/risk').set(H(plat));
      expect(r.status).toBe(200);
      const h01 = r.body.entries.find((e: any) => e.code === 'H.01');
      expect(h01).toBeDefined();
      expect(h01.high).toBeGreaterThan(0);
      expect(JSON.stringify(r.body)).not.toContain(admin.email);
    });

    it('[K1] B3 KHÔNG đọc được cờ chi tiết, V1 cũng không — hai quyền tách nhau thật', async () => {
      expect((await api().get('/api/v1/risk').set(H(plat))).status).toBe(403);
      expect((await api().get('/api/v1/risk').set(H(exec))).status).toBe(403);
    });

    it('[K8] chạy bộ sinh lần nữa KHÔNG nhân bản cờ (idempotent theo nguồn)', async () => {
      const before = await owner.riskFlag.count({ where: { tenantId: admin.id } });
      const r1 = await api().post('/api/v1/risk/refresh').set(H(steward)).send({});
      expect(r1.status).toBe(201);
      const r2 = await api().post('/api/v1/risk/refresh').set(H(steward)).send({});
      expect(r2.body.created).toBe(0);
      const after = await owner.riskFlag.count({ where: { tenantId: admin.id } });
      expect(after).toBe(before);
    });
  });

  // ═══════════ Nguồn cờ mới của lát này ═══════════

  /**
   * [Lỗ tự bắt khi rà nguồn] Tới hết L3, một lần xuất BỊ CHẶN không để lại vết nào — `export_log`
   * chỉ ghi lần thành công. Lát này thêm audit `export.blocked` ở `ExportGuard`, và ca dưới
   * chứng minh dây nối chạy đủ: chặn → vết → cờ mức `high`.
   */
  it('[nguồn mới] xuất dữ liệu bị chặn để lại vết và sinh cờ `export_blocked`', async () => {
    const cycles = await api().get('/api/v1/review-cycles').set(H(hr));
    const cid = (cycles.body?.entries ?? cycles.body ?? [])[0]?.id
      ?? '00000000-0000-0000-0000-000000000000';
    // hrbp có `payroll:export` nhưng thiếu `export:confidential` ⇒ ExportGuard chặn (L1)
    const blocked = await api().get(`/api/v1/export/payroll?cycle=${cid}`).set(H(hr));
    expect(blocked.status).toBe(403);

    const trail = await owner.auditLog.findFirst({
      where: { tenantId: hr.id, action: 'export.blocked' },
      orderBy: { id: 'desc' },
    });
    expect(trail).not.toBeNull();
    expect((trail!.after as any).reason).toContain('export:confidential');

    const r = await api().get('/api/v1/risk?kind=export_blocked').set(H(steward));
    expect(r.status).toBe(200);
    expect(r.body.entries.length).toBeGreaterThan(0);
    expect(r.body.entries[0].severity).toBe('high');
  });

  it('[đối chứng] lần xuất THÀNH CÔNG không sinh cờ — chỉ lần bị chặn mới là tín hiệu', async () => {
    const before = await owner.riskFlag.count({ where: { tenantId: hr.id, kind: 'export_blocked' } });
    const ok = await api().post('/api/v1/integrations/outbox/dispatch').set(H(hr)).send({});
    expect([200, 201]).toContain(ok.status);
    await api().post('/api/v1/risk/refresh').set(H(steward)).send({});
    const after = await owner.riskFlag.count({ where: { tenantId: hr.id, kind: 'export_blocked' } });
    expect(after).toBe(before);
  });

  // ═══════════ K8 — cờ không tắt được bằng tay ═══════════

  it('[K8] nội dung cờ BẤT BIẾN — không hạ mức, không sửa mô tả, kể cả UPDATE thẳng DB', async () => {
    const f = await owner.riskFlag.findFirstOrThrow({ where: { tenantId: admin.id, severity: 'high' } });
    await expect(
      owner.riskFlag.update({ where: { id: f.id }, data: { severity: 'low' } }),
    ).rejects.toThrow(/sự kiện đã xảy ra/);
    await expect(
      owner.riskFlag.update({ where: { id: f.id }, data: { summary: 'không có gì đâu' } }),
    ).rejects.toThrow(/sự kiện đã xảy ra/);
  });

  // ═══════════ Luồng sự cố ═══════════

  describe('Luồng sự cố: mở → điều tra → khắc phục → đóng', () => {
    let incidentId: string;
    let version: number;

    it('B0 (auditor) KHÔNG mở được sự cố — người soát không phải người xử lý', async () => {
      const r = await api().post('/api/v1/incidents').set(H(auditor))
        .send({ title: 'Thử mở bởi kiểm toán', severity: 'high' });
      expect(r.status).toBe(403);
    });

    it('B5 mở sự cố và gắn cờ vào — cờ chuyển sang trạng thái đã gắn', async () => {
      const flags = await api().get('/api/v1/risk?severity=high&linked=false').set(H(steward));
      const ids = flags.body.entries.slice(0, 2).map((e: any) => e.id);
      expect(ids.length).toBeGreaterThan(0);

      const r = await api().post('/api/v1/incidents').set(H(steward)).send({
        title: 'Rà soát chuỗi cảnh báo leo thang quyền',
        severity: 'high', assigneeUserId: steward.userId,
        flagIds: ids,
      });
      expect(r.status).toBe(201);
      expect(r.body.linkedFlags).toBe(ids.length);
      incidentId = r.body.id;

      const linked = await api().get('/api/v1/risk?linked=true').set(H(steward));
      expect(linked.body.entries.some((e: any) => e.incidentId === incidentId)).toBe(true);
    });

    it('B0 ĐỌC được sự cố (minh bạch hai chiều) kèm số cờ đã gắn', async () => {
      const r = await api().get('/api/v1/incidents').set(H(auditor));
      expect(r.status).toBe(200);
      const inc = r.body.entries.find((e: any) => e.id === incidentId);
      expect(inc).toBeDefined();
      expect(inc.flagCount).toBeGreaterThan(0);
      version = inc.version;
    });

    it('chuyển open → investigating → remediating', async () => {
      const r1 = await api().patch(`/api/v1/incidents/${incidentId}`).set(H(steward))
        .send({ status: 'investigating', version });
      expect(r1.status).toBe(200);
      const r2 = await api().patch(`/api/v1/incidents/${incidentId}`).set(H(steward))
        .send({ status: 'remediating', version: version + 1 });
      expect(r2.status).toBe(200);
      version += 2;
    });

    it('KHÔNG lùi trạng thái được (remediating → open) — 422', async () => {
      const r = await api().patch(`/api/v1/incidents/${incidentId}`).set(H(steward))
        .send({ status: 'open', version });
      expect(r.status).toBe(422);
    });

    it('KHÔNG đóng được qua PATCH — đóng phải đi đường riêng có nguyên nhân', async () => {
      const r = await api().patch(`/api/v1/incidents/${incidentId}`).set(H(steward))
        .send({ status: 'closed', version });
      expect(r.status).toBe(422);
      expect(String(r.body?.error?.message ?? '')).toContain('nguyên nhân');
    });

    it('đóng mà nguyên nhân quá ngắn → 400 ("đã xong" không phải một nguyên nhân)', async () => {
      const r = await api().post(`/api/v1/incidents/${incidentId}/close`).set(H(steward))
        .send({ rootCause: 'đã xong', version });
      expect(r.status).toBe(400);
    });

    it('đóng với nguyên nhân gốc đầy đủ → 201, ghi người đóng + mốc đóng', async () => {
      const r = await api().post(`/api/v1/incidents/${incidentId}/close`).set(H(steward)).send({
        rootCause: 'Vai hrbp được gán nhầm phạm vi trong đợt onboard, đã chuẩn hoá lại quy trình cấp vai',
        version,
      });
      expect(r.status).toBe(201);
      const row = await owner.incident.findUniqueOrThrow({ where: { id: incidentId } });
      expect(row.status).toBe('closed');
      expect(row.closedBy).toBe(steward.userId);
      expect(row.closedAt).not.toBeNull();
    });

    it('sự cố đã đóng KHÔNG mở lại được — kể cả UPDATE thẳng DB (phải là sự cố MỚI)', async () => {
      const r = await api().patch(`/api/v1/incidents/${incidentId}`).set(H(steward))
        .send({ status: 'investigating', version: version + 1 });
      expect(r.status).toBe(409);
      await expect(
        owner.incident.update({ where: { id: incidentId }, data: { status: 'open' } }),
      ).rejects.toThrow(/đã đóng|một chiều/);
    });

    it('[DB] không đóng được sự cố mà bỏ trống nguyên nhân, kể cả đi thẳng vào DB', async () => {
      const fresh = await api().post('/api/v1/incidents').set(H(steward))
        .send({ title: 'Sự cố thử ràng buộc DB', severity: 'low' });
      const id = fresh.body.id;
      await expect(
        owner.incident.update({
          where: { id },
          data: { status: 'closed', closedAt: new Date(), closedBy: steward.userId },
        }),
      ).rejects.toThrow();
    });
  });
});
