/**
 * Integration Phase 1 lát 4: Evidence Hub — manual create, verify human-in-the-loop,
 * bulk connector idempotent theo (source, external_id), cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(60_000);

describe('Evidence Hub (integration)', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let h01: { id: string; token: string };
  let t2: { id: string; token: string };
  const uniq = Date.now();
  const SRC = `csv-test-${uniq}`;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(code: string) {
      const tenant = await owner.tenant.findUnique({ where: { code } });
      const user = await owner.appUser.findFirst({ where: { tenantId: tenant!.id } });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token };
    }
    h01 = await ctxFor('H.01');
    t2 = await ctxFor('T2.TEST');

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

  const h01Req = () => ({ Authorization: `Bearer ${h01.token}`, 'X-Tenant-Id': h01.id });
  const t2Req = () => ({ Authorization: `Bearer ${t2.token}`, 'X-Tenant-Id': t2.id });
  const api = () => request(app.getHttpServer());

  let evidenceId: string;

  it('tạo evidence manual → pending', async () => {
    // [F22] Bằng chứng thuộc về NGƯỜI KHÁC (emp1), không phải chính người sẽ xác minh —
    // trước bản vá test này tạo cho chính admin rồi để admin tự xác minh, tức là test
    // đang KHOÁ LẠI đúng cái lỗ SoD. Nay dựng đúng luồng thật: nhân viên nộp bằng chứng,
    // người có thẩm quyền khác xác minh.
    const emp = await owner.person.findFirst({
      where: { tenantId: h01.id, employeeCode: { endsWith: '-EMP1' }, deletedAt: null },
    });
    const res = await api().post('/api/v1/evidence').set(h01Req())
      .send({
        type: 'document', uri: 'https://example.local/report.pdf',
        payload: { note: 'BC tháng 6' }, ownerId: emp!.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.sourceSystem).toBe('manual');
    evidenceId = res.body.id;
  });

  it('verify human-in-the-loop: pending → verified, chống verify lặp (409)', async () => {
    const ok = await api().post(`/api/v1/evidence/${evidenceId}/verify`).set(h01Req())
      .send({ decision: 'verified' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('verified');
    expect(ok.body.reviewerId).toBeTruthy();

    const again = await api().post(`/api/v1/evidence/${evidenceId}/verify`).set(h01Req())
      .send({ decision: 'rejected' });
    expect(again.status).toBe(409);
  });

  it('[F22] KHÔNG tự xác minh bằng chứng của chính mình — kể cả admin (SoD)', async () => {
    // admin tạo bằng chứng cho CHÍNH MÌNH (ownerId mặc định = person của người gọi)
    const mine = await api().post('/api/v1/evidence').set(h01Req())
      .send({ type: 'metric', payload: { value: 999, note: 'tự cấp cho mình' } });
    expect(mine.status).toBe(201);

    const selfVerify = await api().post(`/api/v1/evidence/${mine.body.id}/verify`).set(h01Req())
      .send({ decision: 'verified' });
    expect(selfVerify.status).toBe(409);

    // vẫn còn pending — không bị lật trạng thái
    const still = await owner.evidence.findFirst({ where: { id: mine.body.id } });
    expect(still!.status).toBe('pending');
    await owner.evidence.deleteMany({ where: { id: mine.body.id } });
  });

  it('[F22] KHÔNG xác minh bằng chứng ngoài phạm vi phụ trách', async () => {
    // dept@ có scope org_unit; bằng chứng thuộc người ở đơn vị KHÁC (approver ở ROOT)
    const dept = await owner.appUser.findFirst({
      where: { tenantId: h01.id, email: { startsWith: 'dept@' }, status: 'active' },
    });
    const outsider = await owner.person.findFirst({
      where: { tenantId: h01.id, employeeCode: { endsWith: '-APPROVER' }, deletedAt: null },
    });
    if (!dept || !outsider) return;
    // Cấp tạm quyền verify cho dept@ để cô lập đúng biến số SCOPE (không phải permission).
    // LƯU Ý: person của dept@ nằm ở ROOT nhưng PHẠM VI PHỤ TRÁCH là ADMISSIONS — phải lấy
    // scope từ chính user_role dept_head, KHÔNG lấy theo org_unit của person, nếu không sẽ
    // vô tình cấp phạm vi ROOT (chứa cả người "ngoài phòng") và test mất ý nghĩa.
    const role = await owner.role.findFirst({ where: { code: 'manager', tenantId: null } });
    const deptHeadRole = await owner.userRole.findFirst({
      where: { tenantId: h01.id, appUserId: dept.id, scopeType: 'org_unit', deletedAt: null },
    });
    if (!deptHeadRole?.scopeId) return;
    // outsider phải nằm NGOÀI phạm vi đó
    const outsiderPerson = await owner.person.findFirst({ where: { id: outsider.id } });
    if (outsiderPerson?.orgUnitId === deptHeadRole.scopeId) return;
    const tmp = await owner.userRole.create({
      data: {
        id: require('@ipms/db').uuidv7(), tenantId: h01.id, appUserId: dept.id,
        roleId: role!.id, scopeType: 'org_unit', scopeId: deptHeadRole.scopeId,
      },
    });
    try {
      const ev = await api().post('/api/v1/evidence').set(h01Req())
        .send({ type: 'metric', payload: { value: 1 }, ownerId: outsider.id });
      expect(ev.status).toBe(201);

      const deptToken = jwt.sign(
        { sub: dept.id, tid: h01.id, email: dept.email, person_id: dept.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      const res = await api().post(`/api/v1/evidence/${ev.body.id}/verify`)
        .set({ Authorization: `Bearer ${deptToken}`, 'X-Tenant-Id': h01.id })
        .send({ decision: 'verified' });
      expect(res.status).toBe(403);

      await owner.evidence.deleteMany({ where: { id: ev.body.id } });
    } finally {
      await owner.userRole.deleteMany({ where: { id: tmp.id } });
    }
  });

  it('bulk sync idempotent: chạy 2 lần cùng external_id → lần 1 created, lần 2 updated (không nhân bản)', async () => {
    const payload = {
      sourceSystem: SRC,
      records: [
        { externalId: 'ROW-1', type: 'metric', payload: { value: 120 } },
        { externalId: 'ROW-2', type: 'task', payload: { done: true } },
      ],
    };
    const first = await api().post('/api/v1/evidence/bulk').set(h01Req()).send(payload);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(2);
    expect(first.body.updated).toBe(0);

    const second = await api().post('/api/v1/evidence/bulk').set(h01Req()).send({
      ...payload,
      records: payload.records.map((r) => ({ ...r, payload: { ...r.payload, rerun: true } })),
    });
    expect(second.body.created).toBe(0);
    expect(second.body.updated).toBe(2);

    const rows = await owner.evidence.findMany({ where: { tenantId: h01.id, sourceSystem: SRC } });
    expect(rows).toHaveLength(2); // không nhân bản
    expect((rows[0].payload as any).rerun).toBe(true); // đã cập nhật
  });

  it('[F13] bulk đè record ĐÃ VERIFIED → reset về pending + xoá reviewer (phải duyệt lại)', async () => {
    // verify ROW-1
    const rows = await api().get('/api/v1/evidence').set(h01Req());
    const row1 = rows.body.find((e: any) => e.sourceSystem === SRC && e.externalId === 'ROW-1');
    const v = await api().post(`/api/v1/evidence/${row1.id}/verify`).set(h01Req())
      .send({ decision: 'verified' });
    expect(v.body.status).toBe('verified');

    // connector sync lại với nội dung MỚI
    await api().post('/api/v1/evidence/bulk').set(h01Req()).send({
      sourceSystem: SRC,
      records: [{ externalId: 'ROW-1', type: 'metric', payload: { value: 999, tampered: true } }],
    });

    const after = await owner.evidence.findFirst({ where: { id: row1.id } });
    expect(after!.status).toBe('pending'); // bằng chứng thay đổi sau duyệt → duyệt lại
    expect(after!.reviewerId).toBeNull();
    expect((after!.payload as any).value).toBe(999);
  });

  it('bulk: KPI code không tồn tại → vào failed[], không chặn record khác', async () => {
    const res = await api().post('/api/v1/evidence/bulk').set(h01Req()).send({
      sourceSystem: SRC,
      records: [
        { externalId: 'ROW-3', type: 'metric', relatedKpiCode: 'KHONG-TON-TAI' },
        { externalId: 'ROW-4', type: 'metric' },
      ],
    });
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toHaveLength(1);
    expect(res.body.failed[0].externalId).toBe('ROW-3');
  });

  it('CÔ LẬP: T2 không thấy evidence H.01; cùng external_id ở T2 tạo dòng riêng', async () => {
    const list = await api().get('/api/v1/evidence').set(t2Req());
    expect(list.body.map((e: any) => e.id)).not.toContain(evidenceId);

    // T2 dùng cùng (source, external_id) → không đụng dữ liệu H.01 (unique có tenant_id)
    const res = await api().post('/api/v1/evidence/bulk').set(t2Req()).send({
      sourceSystem: SRC,
      records: [{ externalId: 'ROW-1', type: 'metric' }],
    });
    expect(res.body.created).toBe(1);

    const h01Rows = await owner.evidence.count({ where: { tenantId: h01.id, sourceSystem: SRC, externalId: 'ROW-1' } });
    const t2Rows = await owner.evidence.count({ where: { tenantId: t2.id, sourceSystem: SRC, externalId: 'ROW-1' } });
    expect(h01Rows).toBe(1);
    expect(t2Rows).toBe(1);
  });
});
