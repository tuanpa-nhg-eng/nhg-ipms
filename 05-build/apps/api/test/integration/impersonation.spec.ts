/**
 * Integration [Trục B — L4] Impersonation CHỈ ĐỌC có kiểm soát — "cho phép NHÌN THẤY cái
 * người dùng thấy, không cho phép LÀM thay họ".
 *
 * Trọng tâm kiểm chứng theo đúng bất biến J11–J13 của kế hoạch:
 *  - [J11] token đóng vai đọc ĐÚNG những gì target đọc được (ca đối chứng — không chặn
 *    oan) NHƯNG mọi hành động GHI mà target thật sự giữ quyền đều bị chặn 403
 *  - [J12] 4 lớp: không đóng vai người có quyền mình không có · không đóng vai người giữ
 *    audit:read · không tự đóng vai chính mình · không đóng vai lồng nhau
 *  - [J13] danh tính kép (act ⟂ sub) · TTL cứng · "ai đã đóng vai tôi" minh bạch hai chiều ·
 *    "Thoát" có hiệu lực NGAY (token cũ không dùng lại được, không đợi TTL tự nhiên)
 *  - org_admin không có user:impersonate (chỉ tenant_admin)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string; personId: string; email: string }

describe('[Trục B L4] Impersonation chỉ-đọc có kiểm soát', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;      // tenant_admin — có user:impersonate
  let orgadmin: Ctx;   // org_admin — KHÔNG có user:impersonate
  let hrUser: Ctx;     // hrbp — giữ quyền admin@ KHÔNG có (kpi:write…) → J12①
  let auditorUser: Ctx; // auditor — giữ audit:read → J12②
  let execUser: Ctx;   // exec_viewer — perm set ⊆ tenant_admin (ca thành công thuần đọc)

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
    hrUser = await ctxFor('H.01', 'hr@');
    auditorUser = await ctxFor('H.01', 'auditor@');
    execUser = await ctxFor('H.01', 'exec@');

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

  const as = (c: { token: string; id: string }) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const asToken = (token: string, tenantId: string) => ({ Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId });
  const api = () => request(app.getHttpServer());
  const REASON = 'Hỗ trợ điều tra sự cố người dùng báo cáo qua kênh hỗ trợ nội bộ';

  describe('POST /admin/impersonation', () => {
    it('org_admin → 403 (KHÔNG có user:impersonate)', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(orgadmin)).send({
        targetUserId: execUser.userId, reason: REASON,
      });
      expect(r.status).toBe(403);
    });

    it('reason < 20 ký tự → 400 (validator tầng API, cùng khuôn mọi DTO khác trong app)', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: execUser.userId, reason: 'test',
      });
      expect(r.status).toBe(400);
    });

    it('[J12③] tự đóng vai chính mình → 403', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: admin.userId, reason: REASON,
      });
      expect(r.status).toBe(403);
    });

    it('[J12②] đóng vai người giữ audit:read → 403 + audit denied', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: auditorUser.userId, reason: REASON,
      });
      expect(r.status).toBe(403);
      const incident = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.impersonation_denied', actorUserId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect(incident).not.toBeNull();
      expect((incident!.after as any).rule).toContain('J12②');
    });

    it('[J12①] đóng vai người giữ quyền mình không có (hrbp giữ kpi:write, admin không có) → 403', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: hrUser.userId, reason: REASON,
      });
      expect(r.status).toBe(403);
      const incident = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.impersonation_denied', actorUserId: admin.userId },
        orderBy: { id: 'desc' },
      });
      expect((incident!.after as any).rule).toContain('J12①');
    });

    it('thành công: đóng vai exec_viewer (⊆ quyền admin) → 201, ghi session + audit', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: execUser.userId, reason: REASON,
      });
      expect(r.status).toBe(201);
      expect(r.body.token).toBeDefined();
      expect(r.body.targetEmail).toBe(execUser.email);

      const session = await owner.impersonationSession.findFirst({
        where: { actorUserId: admin.userId, targetUserId: execUser.userId },
        orderBy: { startedAt: 'desc' },
      });
      expect(session).not.toBeNull();
      expect(session!.reason).toBe(REASON);
      expect(session!.endedAt).toBeNull();
      // [J13] TTL cứng ~30 phút — không phải 8h như token thường
      const ttlMin = (session!.expiresAt.getTime() - session!.startedAt.getTime()) / 60000;
      expect(ttlMin).toBeGreaterThan(29);
      expect(ttlMin).toBeLessThanOrEqual(30);

      const startAudit = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.impersonation_started', entityId: session!.id },
      });
      expect(startAudit).not.toBeNull();
      expect(startAudit!.actorUserId).toBe(admin.userId); // [J13] actor THẬT, không phải target
    });
  });

  describe('[J11 + đối chứng] Token đóng vai — đọc đúng, chặn ghi', () => {
    let impToken: string;
    let impTid: string;
    let sessionId: string;

    beforeAll(async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        // dùng org_admin làm target — org_admin giữ CẢ đọc lẫn GHI thật (user:write,
        // person:write, role:assign…), và toàn bộ quyền org_admin ⊆ quyền admin@ (J12① qua)
        // → đây là ca duy nhất chứng minh được J11 THỰC SỰ tước một quyền ghi CÓ THẬT,
        // không phải tước một quyền target chưa từng có (ca exec@ ở trên toàn quyền đọc).
        targetUserId: orgadmin.userId, reason: REASON,
      });
      expect(r.status).toBe(201);
      impToken = r.body.token;
      impTid = admin.id;
      sessionId = r.body.sessionId;
    });

    it('[đối chứng KHÔNG chặn oan] đọc được ĐÚNG cái org_admin đọc được: GET /admin/users → 200', async () => {
      const r = await api().get('/api/v1/admin/users').set(asToken(impToken, impTid));
      expect(r.status).toBe(200);
      expect(r.body.entries.length).toBeGreaterThan(0);
    });

    it('[J11] GHI bị chặn dù target THẬT SỰ giữ quyền: PATCH /admin/users/:id (user:write) → 403', async () => {
      const r = await api().patch(`/api/v1/admin/users/${orgadmin.userId}`).set(asToken(impToken, impTid)).send({
        fullName: 'Bị đổi trong lúc đóng vai — PHẢI KHÔNG xảy ra', version: 1,
      });
      expect(r.status).toBe(403);
    });

    it('[J11] GET /me/access báo ĐÚNG bộ quyền đã lọc — không hiện quyền ghi target thật sự giữ', async () => {
      const r = await api().get('/api/v1/me/access').set(asToken(impToken, impTid));
      expect(r.status).toBe(200);
      expect(r.body.permissions).toContain('user:read');
      expect(r.body.permissions).not.toContain('user:write'); // org_admin CÓ quyền này thật
      expect(r.body.permissions).not.toContain('person:write');
    });

    it('[J12④ phòng tuyến] token đang đóng vai không mở được phiên MỚI (chặn ở tầng guard vì user:impersonate không trong whitelist)', async () => {
      const r = await api().post('/api/v1/admin/impersonation').set(asToken(impToken, impTid)).send({
        targetUserId: execUser.userId, reason: REASON,
      });
      expect(r.status).toBe(403);
    });

    it('[J13] "ai đã đóng vai tôi" — org_admin (bị đóng vai) xem được minh bạch', async () => {
      const r = await api().get('/api/v1/me/access').set(as(orgadmin));
      expect(r.status).toBe(200);
      expect(r.body.impersonatedBy.length).toBeGreaterThan(0);
      const entry = r.body.impersonatedBy.find((x: any) => x.actorEmail === admin.email);
      expect(entry).toBeDefined();
      expect(entry.reason).toBe(REASON);
    });

    it('DELETE /admin/impersonation/current — luôn gọi được (miễn trừ permission), kết thúc đúng phiên', async () => {
      const r = await api().delete('/api/v1/admin/impersonation/current').set(asToken(impToken, impTid));
      expect(r.status).toBe(200);

      const session = await owner.impersonationSession.findFirst({ where: { id: sessionId } });
      expect(session!.endedAt).not.toBeNull();
      expect(session!.endedReason).toBe('manual');

      const endAudit = await owner.auditLog.findFirst({
        where: { tenantId: admin.id, action: 'admin.impersonation_ended', entityId: sessionId },
      });
      expect(endAudit).not.toBeNull();
      expect(endAudit!.actorUserId).toBe(admin.userId); // [J13] actor thật, không phải org_admin
    });

    it('[Tự bắt — "Thoát" có hiệu lực NGAY] token cũ (đã kết thúc phiên) dùng lại → 401, không phải chờ TTL', async () => {
      const r = await api().get('/api/v1/admin/users').set(asToken(impToken, impTid));
      expect(r.status).toBe(401);
    });

    it('DELETE /admin/impersonation/current lần 2 (phiên đã kết thúc) — vẫn 200 (idempotent), KHÔNG ghi audit trùng', async () => {
      // [Chủ đích] Đường thoát miễn trừ CẢ status(J8) lẫn sessionLive — chỉ đòi JWT có
      // imp_sid, đúng tinh thần "luôn gọi được". Gọi lại một phiên đã kết thúc là vô hại
      // (updateMany where endedAt=null khớp 0 dòng) — không phải lỗi, không tạo thêm audit.
      const before = await owner.auditLog.count({
        where: { tenantId: admin.id, action: 'admin.impersonation_ended', entityId: sessionId },
      });
      const r = await api().delete('/api/v1/admin/impersonation/current').set(asToken(impToken, impTid));
      expect(r.status).toBe(200);
      const after = await owner.auditLog.count({
        where: { tenantId: admin.id, action: 'admin.impersonation_ended', entityId: sessionId },
      });
      expect(after).toBe(before); // không nhân bản audit cho một lần kết thúc đã xảy ra
    });
  });

  describe('DELETE /admin/impersonation/current — ngoài phiên đóng vai', () => {
    it('token THƯỜNG (không có imp_sid) gọi endpoint thoát → 403', async () => {
      const r = await api().delete('/api/v1/admin/impersonation/current').set(as(admin));
      expect(r.status).toBe(403);
    });
  });

  describe('GET /admin/impersonation — nhật ký phiên', () => {
    it('admin (KHÔNG có audit:read sau L0) → 403 — J3 áp lại cho impersonation', async () => {
      const r = await api().get('/api/v1/admin/impersonation').set(as(admin));
      expect(r.status).toBe(403);
    });

    it('auditor (có audit:read) đọc được nhật ký, thấy đúng phiên vừa tạo', async () => {
      const r = await api().get('/api/v1/admin/impersonation').set(as(auditorUser));
      expect(r.status).toBe(200);
      expect(r.body.length).toBeGreaterThan(0);
      const found = r.body.find((s: any) => s.actor.email === admin.email && s.target.email === orgadmin.email);
      expect(found).toBeDefined();
      expect(found.status).toBe('ended');
    });
  });

  describe('[target_disabled] khoá tài khoản target đang bị đóng vai → tự kết thúc phiên', () => {
    it('disable org_admin trong lúc CÓ một phiên active nhắm vào org_admin → phiên tự ended', async () => {
      const start = await api().post('/api/v1/admin/impersonation').set(as(admin)).send({
        targetUserId: orgadmin.userId, reason: REASON,
      });
      expect(start.status).toBe(201);
      const sid = start.body.sessionId;

      // [F189 — Reviewer đối kháng] disable/enable giờ đòi optimistic lock (version app_user)
      const v1 = (await owner.appUser.findUniqueOrThrow({ where: { id: orgadmin.userId } })).version;
      const dis = await api().post(`/api/v1/admin/users/${orgadmin.userId}/disable`).set(as(admin)).send({ version: v1 });
      expect(dis.status).toBe(201);

      const session = await owner.impersonationSession.findFirst({ where: { id: sid } });
      expect(session!.endedAt).not.toBeNull();
      expect(session!.endedReason).toBe('target_disabled');

      // dọn lại — mở khoá để không ảnh hưởng test khác chạy sau trong cùng tiến trình
      const v2 = (await owner.appUser.findUniqueOrThrow({ where: { id: orgadmin.userId } })).version;
      await api().post(`/api/v1/admin/users/${orgadmin.userId}/enable`).set(as(admin)).send({ version: v2 });
    });
  });
});
