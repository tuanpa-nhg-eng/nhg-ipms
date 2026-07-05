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

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; personId: string; userId: string }

describe('Phase 2 — Review loop E2E', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let admin: Ctx;   // H.01 tenant_admin (scope tenant)
  let emp: Ctx;     // H.01 employee (scope self)
  let t2admin: Ctx; // T2 admin
  const uniq = Date.now();

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
    admin = await ctxFor('H.01', 'admin@');
    emp = await ctxFor('H.01', 'emp1@');
    t2admin = await ctxFor('T2.TEST', 'admin@');

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

  let empGoal: string;
  let kpiManual: string;   // evidenceRequired
  let kpiSystem: string;   // method=system
  let scorecardId: string;
  let cycleId: string;
  let reviewId: string;

  // ========== F6 SCOPE ==========
  it('[F6] employee (scope self) KHÔNG tạo goal cho người khác (403)', async () => {
    const res = await api().post('/api/v1/goals').set(as(emp))
      .send({ nameVi: 'goal lậu', period: '2026', ownerId: admin.personId });
    expect(res.status).toBe(403);
  });

  it('[F6] employee tạo goal CHO MÌNH → 201; sửa goal người khác → 403', async () => {
    const mine = await api().post('/api/v1/goals').set(as(emp))
      .send({ nameVi: 'Goal của EMP1', period: '2026', ownerId: emp.personId });
    expect(mine.status).toBe(201);
    empGoal = mine.body.id;

    const adminGoal = await api().post('/api/v1/goals').set(as(admin))
      .send({ nameVi: 'Goal của admin', period: '2026', ownerId: admin.personId });
    const hack = await api().patch(`/api/v1/goals/${adminGoal.body.id}/progress`).set(as(emp))
      .send({ progressPct: 1 });
    expect(hack.status).toBe(403);
  });

  // ========== CHECK-IN ==========
  it('check-in monthly: nộp → goal health cập nhật; nộp lặp → 409', async () => {
    const res = await api().post('/api/v1/checkins').set(as(emp)).send({
      cadence: 'monthly', periodKey: `2026-${uniq % 100}`,
      progressNote: 'Tháng ổn', goalUpdates: [{ goalId: empGoal, progressPct: 75 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('submitted');

    const goal = await owner.goal.findFirst({ where: { id: empGoal } });
    expect(Number(goal!.healthScore)).toBe(75);

    const dup = await api().post('/api/v1/checkins').set(as(emp)).send({
      cadence: 'monthly', periodKey: `2026-${uniq % 100}`,
      goalUpdates: [{ goalId: empGoal, progressPct: 80 }],
    });
    expect(dup.status).toBe(409);
  });

  it('employee KHÔNG có checkin:review (403); manager/admin review được', async () => {
    const list = await api().get('/api/v1/checkins').set(as(emp));
    const ck = list.body.find((c: any) => c.personId === emp.personId);

    const deny = await api().post(`/api/v1/checkins/${ck.id}/review`).set(as(emp))
      .send({ managerComment: 'tự khen' });
    expect(deny.status).toBe(403);

    const ok = await api().post(`/api/v1/checkins/${ck.id}/review`).set(as(admin))
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
    const m = await api().post('/api/v1/kpis').set(as(admin)).send({
      code: `RV-MANUAL-${uniq}`, nameVi: 'KPI thủ công', method: 'manual',
      direction: 'forward', frequency: 'quarterly', scoreTiers: tiers,
    });
    kpiManual = m.body.id;
    const s = await api().post('/api/v1/kpis').set(as(admin)).send({
      code: `RV-SYSTEM-${uniq}`, nameVi: 'KPI hệ thống', method: 'system',
      direction: 'forward', frequency: 'quarterly', scoreTiers: tiers, dataSource: 'csv',
    });
    kpiSystem = s.body.id;

    const sc = await api().post('/api/v1/scorecards').set(as(admin)).send({
      nameVi: `SC Review ${uniq}`,
      items: [{ kpiId: kpiManual, weight: 50 }, { kpiId: kpiSystem, weight: 50 }],
    });
    scorecardId = sc.body.id;

    const cy = await api().post('/api/v1/review-cycles').set(as(admin))
      .send({ name: `Cycle ${uniq}`, period: '2026-H1' });
    cycleId = cy.body.id;

    const rv = await api().post('/api/v1/reviews').set(as(admin))
      .send({ cycleId, revieweeId: emp.personId, scorecardId });
    expect(rv.status).toBe(201);
    reviewId = rv.body.id;
  });

  it('self: chỉ reviewee; admin tự self review của EMP1 → 409', async () => {
    const deny = await api().post(`/api/v1/reviews/${reviewId}/self`).set(as(admin))
      .send({ selfReflection: 'giả mạo' });
    expect(deny.status).toBe(409);

    const ok = await api().post(`/api/v1/reviews/${reviewId}/self`).set(as(emp))
      .send({ selfReflection: 'Hoàn thành 2 kênh tuyển sinh, còn vướng CRM' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('self_done');
  });

  it('manager assessment → manager_done', async () => {
    const ok = await api().post(`/api/v1/reviews/${reviewId}/manager`).set(as(admin))
      .send({ managerAssessment: 'Đạt kỳ vọng', proposedRating: 'B' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('manager_done');
  });

  it('compute-score: system KPI CHƯA có evidence verified → 422', async () => {
    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(admin))
      .send({ inputs: [
        { kpiId: kpiManual, target: 100, actual: 95 },
        { kpiId: kpiSystem, target: 100 },
      ]});
    expect(res.status).toBe(422);
  });

  it('nạp evidence metric (bulk) + verify → compute-score OK, LƯU snapshot', async () => {
    await api().post('/api/v1/evidence/bulk').set(as(admin)).send({
      sourceSystem: `rv-${uniq}`,
      records: [{
        externalId: 'M-1', type: 'metric', payload: { value: 85 },
        relatedKpiCode: `RV-SYSTEM-${uniq}`, ownerEmployeeCode: 'H.01-EMP1',
      }],
    });
    const evs = await api().get(`/api/v1/evidence?kpiId=${kpiSystem}`).set(as(admin));
    await api().post(`/api/v1/evidence/${evs.body[0].id}/verify`).set(as(admin))
      .send({ decision: 'verified' });

    const res = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(admin))
      .send({ inputs: [
        { kpiId: kpiManual, target: 100, actual: 95 },
        { kpiId: kpiSystem, target: 100 },
      ]});
    expect(res.status).toBe(201);
    // manual 95%→tier22→88 ×50% = 44 · system 85%→tier19→76 ×50% = 38 → 82 → A
    expect(Number(res.body.review.finalScore)).toBe(82);
    expect(res.body.review.ipcGrade).toBe('A');

    const scores = await owner.reviewItemScore.findMany({
      where: { reviewId, deletedAt: null },
    });
    expect(scores).toHaveLength(2);
    expect(scores.find((s) => s.source === 'system')).toBeDefined();
    expect(Number(scores.find((s) => s.source === 'system')!.actualValue)).toBe(85);
  });

  it('calibration: rationale bắt buộc; decide → calibrated + audit cùng transaction', async () => {
    const ss = await api().post('/api/v1/calibration-sessions').set(as(admin)).send({ cycleId });
    const short = await api().post('/api/v1/calibration-decisions').set(as(admin))
      .send({ sessionId: ss.body.id, reviewId, ratingAfter: 'A', rationale: 'ngắn' });
    expect(short.status).toBe(400); // rationale < 10 ký tự

    const ok = await api().post('/api/v1/calibration-decisions').set(as(admin))
      .send({ sessionId: ss.body.id, reviewId, ratingAfter: 'A', rationale: 'Evidence vượt trội so với mặt bằng phòng Tuyển sinh' });
    expect(ok.status).toBe(201);
    expect(ok.body.ratingBefore).toBe('B');

    const audits = await owner.auditLog.findMany({
      where: { tenantId: admin.id, action: 'calibration.decide', entityId: reviewId },
    });
    expect(audits.length).toBe(1);
  });

  it('finalize: governance evidence check → version lệch 409 → đúng version OK + audit rating.approve', async () => {
    // KPI manual evidenceRequired=true mặc định mà EMP1 chưa có evidence → 422
    const rv0 = await api().get(`/api/v1/reviews/${reviewId}`).set(as(admin));
    const gov = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(admin))
      .send({ finalRating: 'A', rationale: 'Đủ điều kiện theo calibration', version: rv0.body.version });
    expect(gov.status).toBe(422);

    // nạp + verify evidence cho KPI manual
    await api().post('/api/v1/evidence/bulk').set(as(admin)).send({
      sourceSystem: `rv-${uniq}`,
      records: [{
        externalId: 'M-2', type: 'document', relatedKpiCode: `RV-MANUAL-${uniq}`,
        ownerEmployeeCode: 'H.01-EMP1', uri: 'https://x.local/bc.pdf',
      }],
    });
    const evs = await api().get(`/api/v1/evidence?kpiId=${kpiManual}`).set(as(admin));
    await api().post(`/api/v1/evidence/${evs.body[0].id}/verify`).set(as(admin))
      .send({ decision: 'verified' });

    // version lệch → 409
    const stale = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(admin))
      .send({ finalRating: 'A', rationale: 'Đủ điều kiện theo calibration', version: 1 });
    expect(stale.status).toBe(409);

    const rv = await api().get(`/api/v1/reviews/${reviewId}`).set(as(admin));
    const ok = await api().post(`/api/v1/reviews/${reviewId}/finalize`).set(as(admin))
      .send({ finalRating: 'A', rationale: 'Calibration thống nhất nâng A', version: rv.body.version });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('final');
    expect(ok.body.approvedBy).toBe(admin.personId);

    const audits = await owner.auditLog.findMany({
      where: { tenantId: admin.id, action: 'rating.approve', entityId: reviewId },
    });
    expect(audits.length).toBe(1);

    // final → khoá compute
    const locked = await api().post(`/api/v1/reviews/${reviewId}/compute-score`).set(as(admin))
      .send({ inputs: [{ kpiId: kpiManual, target: 100, actual: 100 }, { kpiId: kpiSystem, target: 100 }] });
    expect(locked.status).toBe(409);
  });

  it('export OneOffice: chỉ review FINAL, đúng reward_ratio', async () => {
    const res = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(as(admin));
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
    const rv = await api().get(`/api/v1/reviews/${reviewId}`).set(as(t2admin));
    expect(rv.status).toBe(404);
    const ex = await api().get(`/api/v1/export/payroll?cycle=${cycleId}`).set(as(t2admin));
    expect(ex.status).toBe(422); // cycle not found trong tenant T2
  });
});
