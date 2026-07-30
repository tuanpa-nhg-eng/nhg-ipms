/**
 * Integration Phase 2 — TRỌN VÒNG: F6 scope → Check-in → Review (self/manager) →
 * compute-score (system KPI từ evidence verified, snapshot formula version) →
 * Calibration (rationale bắt buộc) → Finalize (HITL + optimistic lock + governance)
 * → Export OneOffice. + cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';
import { grantExtraPermission } from '../helpers/grant-permission';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; personId: string; userId: string }

describe('Phase 2 — Review loop E2E', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  // [Trục B L0] Cả vòng đánh giá trước đây chạy bằng admin@ — một tài khoản vừa dựng KPI,
  // vừa chấm, vừa cân chỉnh, vừa chốt hạng. Đó chính là god-account mà L0 đập bỏ. Nay tách
  // đúng vai nghiệp vụ: hrbp quản trị vòng (kpi/scorecard/cycle/review/calibration/export),
  // manager chốt hạng (rating:approve) — hrbp KHÔNG có rating:approve, và đó là chủ đích.
  let hr: Ctx;      // H.01 hrbp (scope tenant)
  let mgr: Ctx;     // H.01 manager (scope org_unit) — vai DUY NHẤT finalize được
  let emp: Ctx;     // H.01 employee (scope self)
  let t2hr: Ctx;    // T2 hrbp — dùng cho ca cô lập tenant
  const uniq = Date.now();
  /** [Trục C L1] hàm hoàn nguyên các lần cấp `export:confidential` — gọi ở afterAll. */
  const exportGrants: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);

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
      return { id: tenant!.id, token, personId: user.personId!, userId: user.id };
    }
    hr = await ctxFor('H.01', 'hr@');
    mgr = await ctxFor('H.01', 'mgr@');
    emp = await ctxFor('H.01', 'emp1@');
    t2hr = await ctxFor('T2.TEST', 'hr@');

    // [Trục C L1] Từ lát export control, `GET /export/payroll` xuất `review.result`
    // (confidential) ⇒ đòi thêm `export:confidential`, và quyền đó CỐ Ý không nằm trong bộ
    // mặc định của vai nào — kể cả hrbp đang giữ `payroll:export`. Vòng đánh giá vẫn chạy
    // nguyên vẹn; chỉ bước MANG DỮ LIỆU RA là cần một lần cấp tường minh. Cấp ở đây đúng
    // động tác mà B1 sẽ làm trên màn Người dùng & Vai trò, và thu lại ở afterAll.
    exportGrants.push(await grantExtraPermission(owner, hr.id, hr.userId, 'export:confidential'));
    exportGrants.push(await grantExtraPermission(owner, t2hr.id, t2hr.userId, 'export:confidential'));

    // dọn checkin cũ của EMP1 để test rerun được (owner — chỉ trong test)
    await owner.checkinGoalUpdate.deleteMany({ where: { tenantId: hr.id } }).catch(() => {});
    await owner.checkin.deleteMany({ where: { tenantId: hr.id, personId: emp.personId } }).catch(() => {});

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    for (const undo of exportGrants) await undo().catch(() => {});
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  let empGoal: string;
  let kpiManual: string;   // evidenceRequired
  let kpiSystem: string;   // method=system
  let scorecardId: string;
  let cycleId: string;
  let reviewId: string;

  // ========== F6 SCOPE ==========
  it('[F6] employee (scope self) KHÔNG tạo goal cho người khác (403)', async () => {
    const res = await api().post('/api/v1/goals').set(as(emp))
      .send({ nameVi: 'goal lậu', period: '2026', ownerId: hr.personId });
    expect(res.status).toBe(403);
  });

  it('[F6] employee tạo goal CHO MÌNH → 201; sửa goal người khác → 403', async () => {
    const mine = await api().post('/api/v1/goals').set(as(emp))
      .send({ nameVi: 'Goal của EMP1', period: '2026', ownerId: emp.personId });
    expect(mine.status).toBe(201);
    empGoal = mine.body.id;

    const adminGoal = await api().post('/api/v1/goals').set(as(hr))
      .send({ nameVi: 'Goal của HRBP', period: '2026', ownerId: hr.personId });
    const hack = await api().patch(`/api/v1/goals/${adminGoal.body.id}/progress`).set(as(emp))
      .send({ progressPct: 1 });
    expect(hack.status).toBe(403);
  });

  // ========== CHECK-IN ==========
  it('check-in monthly: nộp → goal health cập nhật; nộp lặp → 409; periodKey sai → 422', async () => {
    // [F37] format sai → 422
    const bad = await api().post('/api/v1/checkins').set(as(emp)).send({
      cadence: 'monthly', periodKey: '2026-7',
      goalUpdates: [{ goalId: empGoal, progressPct: 75 }],
    });
    expect(bad.status).toBe(422);

    const res = await api().post('/api/v1/checkins').set(as(emp)).send({
      cadence: 'monthly', periodKey: '2026-07',
      progressNote: 'Tháng ổn', goalUpdates: [{ goalId: empGoal, progressPct: 75 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('submitted');

    const goal = await owner.goal.findFirst({ where: { id: empGoal } });
    expect(Number(goal!.healthScore)).toBe(75); // [F34] cùng transaction — đã cập nhật

    const dup = await api().post('/api/v1/checkins').set(as(emp)).send({
      cadence: 'monthly', periodKey: '2026-07',
      goalUpdates: [{ goalId: empGoal, progressPct: 80 }],
    });
    expect(dup.status).toBe(409);
  });

  it('employee KHÔNG có checkin:review (403); hrbp review được', async () => {
    const list = await api().get('/api/v1/checkins').set(as(emp));
    const ck = list.body.find((c: any) => c.personId === emp.personId);

    const deny = await api().post(`/api/v1/checkins/${ck.id}/review`).set(as(emp))
      .send({ managerComment: 'tự khen' });
    expect(deny.status).toBe(403);

    const ok = await api().post(`/api/v1/checkins/${ck.id}/review`).set(as(hr))
      .send({ managerComment: 'Tiến độ tốt, chú ý kênh THPT' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('reviewed');
  });

  // ========== REVIEW LOOP ==========
  it('setup: KPI manual (evidenceRequired) + KPI system + scorecard + cycle + review', async () => {
    const tiers = [
      { minPct: 100, score: 25 }, { minPct: 90, score: 22 },
      { minPct: 80, score: 19 }, { minPct: 70, score: 16 },
    ];
    const m = await api().post('/api/v1/kpis').set(as(hr)).send({
      code: `RV-MANUAL-${uniq}`, nameVi: 'KPI thủ công', method: 'manual',
      direction: 'forward', frequency: 'quarterly', scoreTiers: tiers,
    });
    kpiManual = m.body.id;
    const s = await api().post('/api/v1/kpis').set(as(hr)).send({
      code: `RV-SYSTEM-${uniq}`, nameVi: 'KPI hệ thống', method: 'system',
      direction: 'forward', frequency: 'quarterly', scoreTiers: tiers, dataSource: 'csv',
    });
    kpiSystem = s.body.id;

    // [F26] target SERVER-SIDE trên scorecard item
    const sc = await api().post('/api/v1/scorecards').set(as(hr)).send({
      nameVi: `SC Review ${uniq}`,
      items: [
        { kpiId: kpiManual, weight: 50, target: 100 },
        { kpiId: kpiSystem, weight: 50, target: 100 },
      ],
    });
    scorecardId = sc.body.id;

    // [F29] cycle bắt buộc có khung kỳ
    const noDates = await api().post('/api/v1/review-cycles').set(as(hr))
      .send({ name: `Cycle ${uniq}`, period: '2026-H2' });
    expect(noDates.status).toBe(400); // thiếu startDate/endDate

    const cy = await api().post('/api/v1/review-cycles').set(as(hr))
      .send({ name: `Cycle ${uniq}`, period: '2026-H2', startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(cy.status).toBe(201);
    cycleId = cy.body.id;

    // [F31] employee KHÔNG tạo được cycle/review (review:manage)
    expect((await api().post('/api/v1/review-cycles').set(as(emp))
      .send({ name: 'x', period: '2026', startDate: '2026-01-01', endDate: '2026-12-31' })).status).toBe(403);
    expect((await api().post('/api/v1/reviews').set(as(emp))
      .send({ cycleId, revieweeId: emp.personId, scorecardId })).status).toBe(403);

    const rv = await api().post('/api/v1/reviews').set(as(hr))
      .send({ cycleId, revieweeId: emp.personId, scorecardId });
    expect(rv.status).toBe(201);
    reviewId = rv.body.id;
  });

  it('[F27] employee đọc review NGƯỜI KHÁC → 403; đọc review CỦA MÌNH → 200', async () => {
    // tạo review cho hr person để thử đọc chéo
    const rvAdmin = await api().post('/api/v1/reviews').set(as(hr))
      .send({ cycleId, revieweeId: hr.personId, scorecardId });
    expect(rvAdmin.status).toBe(201);

    const denied = await api().get(`/api/v1/reviews/${rvAdmin.body.id}`).set(as(emp));
    expect(denied.status).toBe(403);

    const own = await api().get(`/api/v1/reviews/${reviewId}`).set(as(emp));
    expect(own.status).toBe(200);
  });

  it('self: chỉ reviewee; hrbp tự self review của EMP1 → 409', async () => {
    const deny = await api().post(`/api/v1/reviews/${reviewId}/self`).set(as(hr))
      .send({ selfReflection: 'giả mạo' });
    expect(deny.status).toBe(409);

    const ok = await api().post(`/api/v1/reviews/${reviewId}/self`).set(as(emp))
      .send({ selfReflection: 'Hoàn thành 2 kênh tuyển sinh, còn vướng CRM' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('self_done');
  });

  it('manager assessment → manager_done', async () => {
    const ok = await api().post(`/api/v1/reviews/${reviewId}/manager`).set(as(hr))
      .send({ managerAssessment: 'Đạt kỳ vọng', proposedRating: 'B' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('manager_done');
  });

  it('[F26] reviewee KHÔNG tự compute-score (409); client không gửi được target', async () => {
    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(emp))
      .send({ manualActuals: [{ kpiId: kpiManual, actual: 9999 }] });
    expect(res.status).toBe(409); // SoD — reviewee tự chấm bị chặn
  });

  it('compute-score: system KPI CHƯA có evidence verified trong kỳ → 422', async () => {
    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(hr))
      .send({ manualActuals: [{ kpiId: kpiManual, actual: 95 }] });
    expect(res.status).toBe(422);
  });

  it('[F29] evidence NGOÀI KỲ không được tính', async () => {
    // evidence occurredAt 2025 (ngoài cycle 2026) — verified nhưng phải bị bỏ qua
    await api().post('/api/v1/evidence/bulk').set(as(hr)).send({
      sourceSystem: `rv-old-${uniq}`,
      records: [{
        externalId: 'OLD-1', type: 'metric', payload: { value: 100 },
        occurredAt: '2025-06-01T00:00:00Z',
        relatedKpiCode: `RV-SYSTEM-${uniq}`, ownerEmployeeCode: 'H.01-EMP1',
      }],
    });
    const evs = await api().get(`/api/v1/evidence?kpiId=${kpiSystem}`).set(as(hr));
    const old = evs.body.find((e: any) => e.externalId === 'OLD-1');
    await api().post(`/api/v1/evidence/${old.id}/verify`).set(as(hr)).send({ decision: 'verified' });

    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(hr))
      .send({ manualActuals: [{ kpiId: kpiManual, actual: 95 }] });
    expect(res.status).toBe(422); // vẫn thiếu evidence TRONG kỳ
  });

  it('nạp evidence metric (bulk) + verify → compute-score OK, LƯU snapshot', async () => {
    await api().post('/api/v1/evidence/bulk').set(as(hr)).send({
      sourceSystem: `rv-${uniq}`,
      records: [{
        externalId: 'M-1', type: 'metric', payload: { value: 85 },
        occurredAt: '2026-06-15T00:00:00Z', // TRONG kỳ 2026
        relatedKpiCode: `RV-SYSTEM-${uniq}`, ownerEmployeeCode: 'H.01-EMP1',
      }],
    });
    const evs = await api().get(`/api/v1/evidence?kpiId=${kpiSystem}`).set(as(hr));
    const m1 = evs.body.find((e: any) => e.externalId === 'M-1');
    await api().post(`/api/v1/evidence/${m1.id}/verify`).set(as(hr))
      .send({ decision: 'verified' });

    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(hr))
      .send({ manualActuals: [{ kpiId: kpiManual, actual: 95 }] });
    expect(res.status).toBe(201);
    // manual 95%→tier22→88 ×50% = 44 · system 85%→tier19→76 ×50% = 38 → 82 → A
    expect(Number(res.body.review.finalScore)).toBe(82);
    expect(res.body.review.ipcGrade).toBe('A');

    const scores = await owner.reviewItemScore.findMany({
      where: { reviewId, deletedAt: null },
    });
    expect(scores).toHaveLength(2);
    const sys = scores.find((s) => s.source === 'system')!;
    expect(Number(sys.actualValue)).toBe(85);
    expect(Number(sys.targetValue)).toBe(100); // [F38] snapshot target đã lưu
  });

  it('calibration: rationale bắt buộc + version (F28); decide → calibrated + audit cùng transaction', async () => {
    const ss = await api().post('/api/v1/calibration-sessions').set(as(hr)).send({ cycleId });
    const rv = await api().get(`/api/v1/reviews/${reviewId}`).set(as(hr));

    const short = await api().post('/api/v1/calibration-decisions').set(as(hr))
      .send({ sessionId: ss.body.id, reviewId, ratingAfter: 'A', rationale: 'ngắn', version: rv.body.version });
    expect(short.status).toBe(400); // rationale < 10 ký tự

    // [F28] version lệch → 409
    const stale = await api().post('/api/v1/calibration-decisions').set(as(hr))
      .send({ sessionId: ss.body.id, reviewId, ratingAfter: 'A', rationale: 'Evidence vượt trội so với mặt bằng', version: 999 });
    expect(stale.status).toBe(409);

    const ok = await api().post('/api/v1/calibration-decisions').set(as(hr))
      .send({ sessionId: ss.body.id, reviewId, ratingAfter: 'A', rationale: 'Evidence vượt trội so với mặt bằng phòng Tuyển sinh', version: rv.body.version });
    expect(ok.status).toBe(201);
    expect(ok.body.ratingBefore).toBe('B');

    const audits = await owner.auditLog.findMany({
      where: { tenantId: hr.id, action: 'calibration.decide', entityId: reviewId },
    });
    expect(audits.length).toBe(1);
  });

  it('finalize: governance evidence check → version lệch 409 → đúng version OK + audit rating.approve', async () => {
    // KPI manual evidenceRequired=true mặc định mà EMP1 chưa có evidence → 422
    const rv0 = await api().get(`/api/v1/reviews/${reviewId}`).set(as(hr));
    const gov = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(mgr))
      .send({ finalRating: 'A', rationale: 'Đủ điều kiện theo calibration', version: rv0.body.version });
    expect(gov.status).toBe(422);

    // nạp + verify evidence cho KPI manual
    await api().post('/api/v1/evidence/bulk').set(as(hr)).send({
      sourceSystem: `rv-${uniq}`,
      records: [{
        externalId: 'M-2', type: 'document', relatedKpiCode: `RV-MANUAL-${uniq}`,
        ownerEmployeeCode: 'H.01-EMP1', uri: 'https://x.local/bc.pdf',
      }],
    });
    const evs = await api().get(`/api/v1/evidence?kpiId=${kpiManual}`).set(as(hr));
    await api().post(`/api/v1/evidence/${evs.body[0].id}/verify`).set(as(hr))
      .send({ decision: 'verified' });

    // version lệch → 409
    const stale = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(mgr))
      .send({ finalRating: 'A', rationale: 'Đủ điều kiện theo calibration', version: 1 });
    expect(stale.status).toBe(409);

    const rv = await api().get(`/api/v1/reviews/${reviewId}`).set(as(hr));
    const ok = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(mgr))
      .send({ finalRating: 'A', rationale: 'Calibration thống nhất nâng A', version: rv.body.version });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('final');
    // [Trục B L0] người chốt hạng là MANAGER (vai duy nhất giữ rating:approve), không phải
    // người quản trị vòng — trước đây cùng một tài khoản admin@ làm cả hai.
    expect(ok.body.approvedBy).toBe(mgr.personId);

    const audits = await owner.auditLog.findMany({
      where: { tenantId: hr.id, action: 'rating.approve', entityId: reviewId },
    });
    expect(audits.length).toBe(1);

    // final → khoá compute
    const locked = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(hr))
      .send({ manualActuals: [{ kpiId: kpiManual, actual: 100 }] });
    expect(locked.status).toBe(409);

    // [F38] rationale đã persist trên review
    const final = await owner.review.findFirst({ where: { id: reviewId } });
    expect(final!.finalRationale).toBe('Calibration thống nhất nâng A');

    // [F28] finalize lặp lại (đã final) → 409
    const again = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(mgr))
      .send({ finalRating: 'A+', rationale: 'thử ghi đè sau final', version: final!.version });
    expect(again.status).toBe(409);
  });

  it('export OneOffice: chỉ review FINAL, đúng reward_ratio', async () => {
    const res = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(as(hr));
    expect(res.status).toBe(200);
    expect(res.body.tenant).toBe('H.01');
    const rec = res.body.records.find((x: any) => x.employee_code === 'H.01-EMP1');
    expect(rec).toBeDefined();
    expect(rec.final_score).toBe(82);
    expect(rec.ipc_grade).toBe('A');
    expect(rec.final_rating).toBe('A');
    expect(rec.reward_ratio).toBe(0.8);
  });

  it('CÔ LẬP: T2 không thấy review/cycle/export của H.01', async () => {
    const rv = await api().get(`/api/v1/reviews/${reviewId}`).set(as(t2hr));
    expect(rv.status).toBe(404);
    const ex = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(as(t2hr));
    expect(ex.status).toBe(422); // cycle not found trong tenant T2
  });
});
