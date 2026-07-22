/**
 * [Trục A — Lát 0] Seed "phòng sống" cho vòng đời hiệu suất.
 *
 * VÌ SAO CẦN: backend Phase 1–2 (goal/checkin/review/calibration/scoring) đã build
 * và test đủ, nhưng DB dev KHÔNG có lấy một goal/check-in/review nào — 18 màn persona
 * nối API xong vẫn trắng. Script này dựng đủ dữ liệu để mọi màn có nhánh trạng thái
 * thật để hiển thị (đang tốt / at_risk / off_track · check-in đã duyệt / chờ duyệt ·
 * review draft / self_done / manager_done).
 *
 * NGUYÊN TẮC: đi qua CHÍNH các service nghiệp vụ (GoalService/CheckinService/
 * ReviewService/…), KHÔNG INSERT thẳng. Nếu seed chạy được thì luồng người dùng chạy
 * được — đây là cách bắt lỗi hợp đồng sớm nhất, trước khi FE đụng vào.
 *
 * MARKER (khác kế hoạch — xem OWNER_DIGEST): các bảng goal/objective/checkin/review/
 * person KHÔNG có cột jsonb governance nên không gắn được `governance.seedDemo=true`
 * như dự kiến. Thay bằng QUY ƯỚC ĐỊNH DANH, không cần migration:
 *   · person.employee_code bắt đầu `<TENANT>-DEMO-`
 *   · mọi bản ghi cấp cao (objective/goal/scorecard/kpi/cycle) mang tiền tố tên `[DEMO]`
 *   · bản ghi con (checkin/review/evidence) nhận diện qua person/cycle demo
 *
 * BẤT BIẾN (I7/I8 kế hoạch trục A):
 *   · Idempotent — chạy lại không nhân bản (lookup-first ở mọi bước).
 *   · KHÔNG đụng task_cell/task_revision/kpi_template (dữ liệu Từ điển Tác vụ thật).
 *     KPI demo tạo ở bảng `kpi` (Phase 1), hoàn toàn tách khỏi `kpi_template`.
 *   · KHÔNG tạo lượt gọi AI ⇒ tổng cost tenant không đổi.
 *   · `--purge` gỡ sạch được. Riêng audit_log là APPEND-ONLY — vết seed ở lại vĩnh viễn
 *     theo thiết kế, purge KHÔNG xoá (và không nên xoá).
 *
 * Chạy:  pnpm --filter @ipms/api seed:perfdemo [TENANT_CODE] [--purge]
 */
import 'dotenv/config';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { PrismaService } from '../prisma.service';
import { GoalService } from '../modules/strategy/goal.service';
import { StrategyService } from '../modules/strategy/strategy.service';
import { CheckinService } from '../modules/checkin/checkin.service';
import { ReviewService } from '../modules/review/review.service';
import { KpiService } from '../modules/kpi/kpi.service';
import { ScorecardService } from '../modules/kpi/scorecard.service';
import { EvidenceService } from '../modules/evidence/evidence.service';
import type { RequestUser } from '../common/auth/decorators';

export const DEMO_TAG = '[DEMO]';
const CYCLE_PERIOD = '2026-Q3';
const CYCLE_START = '2026-07-01';
const CYCLE_END = '2026-09-30';
const PERIOD_PREV = '2026-06';
const PERIOD_CURR = '2026-07';

/** 6 nhân viên demo. `progress` lái health → mỗi nhánh trạng thái đều có mặt trên UI. */
const STAFF = [
  { n: 1, name: 'Trần Thu Hà', title: 'Chuyên viên Tuyển sinh', progress: 92, review: 'manager_done' },
  { n: 2, name: 'Nguyễn Minh Quân', title: 'Chuyên viên Tuyển sinh', progress: 78, review: 'manager_done' },
  { n: 3, name: 'Lê Phương Anh', title: 'Chuyên viên Tài chính', progress: 64, review: 'self_done' },
  { n: 4, name: 'Phạm Đức Duy', title: 'Chuyên viên Tài chính', progress: 55, review: 'self_done' },
  { n: 5, name: 'Võ Thị Kim Ngân', title: 'Chuyên viên Vận hành', progress: 38, review: 'draft' },
  { n: 6, name: 'Đặng Hoàng Long', title: 'Chuyên viên Vận hành', progress: 30, review: 'draft' },
] as const;

const KPIS = [
  {
    code: 'DEMO-ENR-01', nameVi: `${DEMO_TAG} Tỷ lệ chuyển đổi nhập học`,
    method: 'manual', direction: 'forward', unit: '%', frequency: 'quarterly',
    formulaExpression: 'round(min(actual / target * 100, 150), 2)',
    weight: 40, target: 85,
  },
  {
    code: 'DEMO-FIN-01', nameVi: `${DEMO_TAG} Tỷ lệ thu đúng hạn`,
    method: 'system', direction: 'forward', unit: '%', frequency: 'quarterly',
    dataSource: 'sis', formulaExpression: 'round(min(actual / target * 100, 150), 2)',
    weight: 35, target: 95,
  },
  {
    code: 'DEMO-OPS-01', nameVi: `${DEMO_TAG} Thời gian xử lý hồ sơ (ngày)`,
    method: 'manual', direction: 'reverse', unit: 'ngày', frequency: 'quarterly',
    formulaExpression: 'round(min(target / actual * 100, 150), 2)',
    weight: 25, target: 3,
  },
] as const;

const SCORE_TIERS = [
  { minPct: 100, score: 100 }, { minPct: 90, score: 88 },
  { minPct: 80, score: 76 }, { minPct: 70, score: 64 }, { minPct: 0, score: 40 },
];

export interface PerfDemoResult {
  tenantCode: string;
  persons: number;
  objectives: number;
  goals: number;
  kpis: number;
  scorecards: number;
  checkins: number;
  reviews: number;
  evidence: number;
  skipped: string[];
}

/** Dựng RequestUser từ DB thật (role→permission→scope) — không hardcode quyền.
 *  Khác helper của seed-task-catalog: BẮT BUỘC kèm `person_id` vì check-in/self-review/
 *  evidence đều đọc `claims.person_id` để xác định "của chính mình". */
async function requestUserFor(
  owner: PrismaClient, tenantId: string, emailPrefix: string,
): Promise<RequestUser> {
  const user = await owner.appUser.findFirst({
    where: { tenantId, email: { startsWith: emailPrefix }, status: 'active' },
  });
  if (!user) {
    throw new Error(`Không tìm thấy user '${emailPrefix}*' trong tenant — chạy pnpm db:seed trước`);
  }
  const roles = await owner.userRole.findMany({
    where: { tenantId, appUserId: user.id, deletedAt: null },
  });
  const perms = await owner.rolePermission.findMany({
    where: { roleId: { in: roles.map((r) => r.roleId) } },
    include: { permission: true },
  });
  return {
    claims: {
      sub: user.id, tid: tenantId, email: user.email, person_id: user.personId ?? undefined,
    } as RequestUser['claims'],
    tenantId,
    permissions: new Set(perms.map((p) => p.permission.code)),
    scopes: roles.map((r) => ({
      scopeType: r.scopeType as 'tenant' | 'org_unit' | 'self', scopeId: r.scopeId ?? null,
    })),
  };
}

export async function seedPerfDemo(opts: {
  tenantCode?: string;
  purge?: boolean;
  prisma?: PrismaService;
  ownerUrl?: string;
  log?: (msg: string) => void;
}): Promise<PerfDemoResult> {
  const tenantCode = opts.tenantCode ?? 'H.01';
  const log = opts.log ?? ((m: string) => console.log(m));
  const owner = createPrismaClient(opts.ownerUrl ?? process.env.OWNER_DATABASE_URL);
  const prisma = opts.prisma ?? new PrismaService();

  const goals = new GoalService(prisma);
  const strategy = new StrategyService(prisma);
  const checkins = new CheckinService(prisma, goals);
  const reviews = new ReviewService(prisma);
  const kpiSvc = new KpiService(prisma);
  const scorecards = new ScorecardService(prisma);
  const evidenceSvc = new EvidenceService(prisma);

  const result: PerfDemoResult = {
    tenantCode, persons: 0, objectives: 0, goals: 0, kpis: 0,
    scorecards: 0, checkins: 0, reviews: 0, evidence: 0, skipped: [],
  };

  try {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    if (!tenant) throw new Error(`Tenant '${tenantCode}' không tồn tại — chạy pnpm db:seed trước`);
    const codePrefix = `${tenantCode}-DEMO-`;

    // [I8] chụp số bản ghi Từ điển Tác vụ TRƯỚC — đối chiếu ở cuối, chứng minh
    // seed hiệu suất không chạm dữ liệu nghiệp vụ thật.
    const dictBefore = await owner.taskCell.count({
      where: { tenantId: tenant.id, configVersionId: null },
    });

    if (opts.purge) {
      const n = await purgeDemo(owner, tenant.id, codePrefix, log);
      log(`Purge '${tenantCode}': gỡ ${n} bản ghi demo. audit_log giữ nguyên (append-only).`);
      const dictAfter = await owner.taskCell.count({
        where: { tenantId: tenant.id, configVersionId: null },
      });
      if (dictAfter !== dictBefore) throw new Error(`[I8] Từ điển Tác vụ đổi ${dictBefore}→${dictAfter} sau purge`);
      return result;
    }

    const hr = await requestUserFor(owner, tenant.id, 'hr@');
    const mgr = await requestUserFor(owner, tenant.id, 'mgr@');
    const mgrPersonId = mgr.claims.person_id;
    if (!mgrPersonId) throw new Error("User 'mgr@' chưa gắn person — chạy lại pnpm db:seed");
    const mgrPerson = await owner.person.findFirst({ where: { id: mgrPersonId } });
    const deptId = mgrPerson?.orgUnitId;
    if (!deptId) throw new Error("Person của 'mgr@' chưa thuộc đơn vị nào — chạy lại pnpm db:seed");

    const employeeRole = await owner.role.findFirst({ where: { code: 'employee', tenantId: null } });
    if (!employeeRole) throw new Error("Role 'employee' chưa có — chạy pnpm db:seed trước");

    // ===== 1. Nhân sự demo (person + app_user + role employee scope self) =====
    const staffUsers: Array<{ person: { id: string; fullName: string }; user: RequestUser }> = [];
    for (const s of STAFF) {
      const employeeCode = `${codePrefix}${String(s.n).padStart(2, '0')}`;
      const email = `demo${s.n}@${tenantCode.toLowerCase().replace('.', '')}.nhg.local`;
      let person = await owner.person.findFirst({
        where: { tenantId: tenant.id, employeeCode },
      });
      if (!person) {
        person = await owner.person.create({
          data: {
            id: uuidv7(), tenantId: tenant.id, employeeCode, fullName: s.name, email,
            status: 'active', orgUnitId: deptId, managerId: mgrPersonId,
          },
        });
        result.persons++;
      }
      let appUser = await owner.appUser.findFirst({ where: { tenantId: tenant.id, email } });
      if (!appUser) {
        appUser = await owner.appUser.create({
          data: { id: uuidv7(), tenantId: tenant.id, personId: person.id, email, status: 'active' },
        });
      }
      const hasRole = await owner.userRole.findFirst({
        where: { tenantId: tenant.id, appUserId: appUser.id, roleId: employeeRole.id, deletedAt: null },
      });
      if (!hasRole) {
        await owner.userRole.create({
          data: {
            id: uuidv7(), tenantId: tenant.id, appUserId: appUser.id,
            roleId: employeeRole.id, scopeType: 'self',
          },
        });
      }
      staffUsers.push({
        person: { id: person.id, fullName: person.fullName },
        user: await requestUserFor(owner, tenant.id, `demo${s.n}@`),
      });
    }
    log(`· Nhân sự: ${staffUsers.length} người (mới ${result.persons}) trong phòng ${deptId}`);

    // ===== 2. OKR → KGI (cascade tầng chặt: KGI phải có cha OKR) =====
    const okrName = `${DEMO_TAG} Tăng trưởng & chuẩn hoá vận hành 2026`;
    let okr = await owner.objective.findFirst({
      where: { tenantId: tenant.id, nameVi: okrName, deletedAt: null },
    });
    if (!okr) {
      okr = await strategy.create(tenant.id, hr.claims.sub, {
        kind: 'okr', nameVi: okrName, period: '2026', orgUnitId: deptId,
      });
      result.objectives++;
    }
    const KGIS = [
      `${DEMO_TAG} Nâng tỷ lệ chuyển đổi nhập học`,
      `${DEMO_TAG} Siết kỷ luật thu — chi`,
    ];
    const kgis: string[] = [];
    for (const nameVi of KGIS) {
      let kgi = await owner.objective.findFirst({
        where: { tenantId: tenant.id, nameVi, deletedAt: null },
      });
      if (!kgi) {
        kgi = await strategy.create(tenant.id, hr.claims.sub, {
          kind: 'kgi', nameVi, period: '2026', parentId: okr.id, orgUnitId: deptId, weight: 50,
        });
        result.objectives++;
      }
      kgis.push(kgi.id);
    }

    // ===== 3. KPI + Scorecard (Σ weight = 100 — validate-weights chặn cứng) =====
    const kpiIds: Record<string, string> = {};
    for (const k of KPIS) {
      const existing = await owner.kpi.findFirst({
        where: { tenantId: tenant.id, code: k.code, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        kpiIds[k.code] = existing.id;
        continue;
      }
      const created = await kpiSvc.create(tenant.id, hr.claims.sub, {
        code: k.code, nameVi: k.nameVi, method: k.method, direction: k.direction,
        unit: k.unit, frequency: k.frequency,
        dataSource: 'dataSource' in k ? k.dataSource : undefined,
        formulaExpression: k.formulaExpression,
        scoreTiers: SCORE_TIERS,
      });
      if (!created) throw new Error(`Tạo KPI ${k.code} thất bại`);
      // KPI mới sinh ra ở `draft` (HITL Phase 1) — demo cần active để scorecard và
      // compute-score dùng được thật; approve đi qua đúng cổng, không update thẳng.
      await kpiSvc.approve(tenant.id, hr.claims.sub, created.id);
      kpiIds[k.code] = created.id;
      result.kpis++;
    }

    const scName = `${DEMO_TAG} Scorecard Chuyên viên ${CYCLE_PERIOD}`;
    let scorecard = await owner.scorecard.findFirst({
      where: { tenantId: tenant.id, nameVi: scName, deletedAt: null },
    });
    if (!scorecard) {
      const created = await scorecards.create(tenant.id, hr.claims.sub, {
        nameVi: scName, period: CYCLE_PERIOD, orgUnitId: deptId,
        items: KPIS.map((k) => ({
          kpiId: kpiIds[k.code], weight: k.weight, groupLabel: 'Kết quả công việc', target: k.target,
        })),
      });
      scorecard = created!;
      result.scorecards++;
      // Σ=100 phải đúng NGAY tại seed — validateWeights NÉM 422 nếu lệch, nên gọi ở đây
      // là chốt chặn: scorecard demo không bao giờ lọt ra màn HR ở trạng thái sai.
      const check = await scorecards.validateWeights(tenant.id, scorecard.id);
      log(`  · scorecard Σ trọng số = ${check.sum}`);
    }

    // ===== 4. Goal theo người (gắn KGI) =====
    const goalIdByPerson = new Map<string, string[]>();
    for (const [i, s] of STAFF.entries()) {
      const su = staffUsers[i];
      const kgiId = kgis[i < 2 ? 0 : i < 4 ? 1 : 0];
      const specs = [
        { nameVi: `${DEMO_TAG} ${s.title} — chỉ tiêu chính ${CYCLE_PERIOD}`, weight: 60 },
        { nameVi: `${DEMO_TAG} ${s.title} — cải tiến quy trình ${CYCLE_PERIOD}`, weight: 40 },
      ];
      const ids: string[] = [];
      for (const spec of specs) {
        let g = await owner.goal.findFirst({
          where: { tenantId: tenant.id, nameVi: spec.nameVi, ownerId: su.person.id, deletedAt: null },
        });
        if (!g) {
          g = await goals.create(hr, {
            nameVi: spec.nameVi, period: CYCLE_PERIOD, ownerId: su.person.id,
            objectiveId: kgiId, orgUnitId: deptId, weight: spec.weight,
          });
          result.goals++;
        }
        ids.push(g.id);
      }
      goalIdByPerson.set(su.person.id, ids);
    }

    // ===== 5. Check-in 2 kỳ — kỳ trước đã được trưởng phòng duyệt, kỳ này chờ duyệt =====
    for (const [i, s] of STAFF.entries()) {
      const su = staffUsers[i];
      const gIds = goalIdByPerson.get(su.person.id)!;
      const periods: Array<{ key: string; pct: number; review: boolean }> = [
        { key: PERIOD_PREV, pct: Math.max(10, s.progress - 12), review: true },
        { key: PERIOD_CURR, pct: s.progress, review: false },
      ];
      for (const p of periods) {
        const existing = await owner.checkin.findFirst({
          where: {
            tenantId: tenant.id, personId: su.person.id,
            cadence: 'monthly', periodKey: p.key, deletedAt: null,
          },
        });
        if (existing) continue;
        const ck = await checkins.submit(su.user, {
          cadence: 'monthly', periodKey: p.key,
          progressNote: `Cập nhật tiến độ ${p.key} — ${s.title}.`,
          blocker: s.progress < 50 ? 'Thiếu dữ liệu đầu vào từ hệ nguồn, đang chờ xử lý.' : undefined,
          goalUpdates: gIds.map((goalId, idx) => ({
            goalId, progressPct: idx === 0 ? p.pct : Math.max(5, p.pct - 8),
          })),
        });
        result.checkins++;
        if (p.review && ck) {
          await checkins.review(mgr, ck.id, 'Ghi nhận tiến độ, tiếp tục bám chỉ tiêu quý.');
        }
      }
    }

    // ===== 6. Evidence cho KPI system (trong khung kỳ cycle — F29) =====
    for (const [i, s] of STAFF.entries()) {
      const su = staffUsers[i];
      const already = await owner.evidence.findFirst({
        where: {
          tenantId: tenant.id, ownerId: su.person.id,
          relatedKpiId: kpiIds['DEMO-FIN-01'], deletedAt: null,
        },
      });
      if (already) continue;
      const ev = await evidenceSvc.create(su.user, {
        type: 'metric', sourceSystem: 'sis',
        // Dùng employeeCode làm khoá ngoài: evidence unique theo (tenant, source, external_id).
        // KHÔNG cắt prefix uuid — uuidv7 xếp theo thời gian nên 6 person tạo trong cùng
        // mốc ms có chung 8 ký tự đầu ⇒ đụng unique ngay lần chạy đầu (đã bị thật).
        externalId: `demo-fin-${codePrefix}${String(s.n).padStart(2, '0')}`,
        payload: { value: 90 + (i % 6), note: 'Số liệu thu đúng hạn (demo)' },
        occurredAt: `${CYCLE_PERIOD.slice(0, 4)}-08-15T00:00:00.000Z`,
        relatedKpiId: kpiIds['DEMO-FIN-01'],
      });
      // HITL: trưởng phòng xác minh (evidence:verify) — KPI system chỉ tính bản VERIFIED.
      await evidenceSvc.review(tenant.id, mgr.claims.sub, mgrPersonId, ev.id, 'verified');
      result.evidence++;
    }

    // ===== 7. Chu kỳ đánh giá + review đủ 3 nhánh trạng thái =====
    const cycleName = `${DEMO_TAG} Đánh giá ${CYCLE_PERIOD}`;
    let cycle = await owner.reviewCycle.findFirst({
      where: { tenantId: tenant.id, name: cycleName, deletedAt: null },
    });
    if (!cycle) {
      cycle = await reviews.createCycle(hr, {
        name: cycleName, period: CYCLE_PERIOD, startDate: CYCLE_START, endDate: CYCLE_END,
      });
    }
    for (const [i, s] of STAFF.entries()) {
      const su = staffUsers[i];
      const existing = await owner.review.findFirst({
        where: { tenantId: tenant.id, cycleId: cycle.id, revieweeId: su.person.id, deletedAt: null },
      });
      if (existing) continue;
      const r = await reviews.createReview(hr, {
        cycleId: cycle.id, revieweeId: su.person.id, scorecardId: scorecard.id,
      });
      result.reviews++;
      if (s.review === 'self_done' || s.review === 'manager_done') {
        await reviews.self(su.user, r.id, `Tự đánh giá ${CYCLE_PERIOD}: hoàn thành phần lớn chỉ tiêu được giao.`);
      }
      if (s.review === 'manager_done') {
        await reviews.manager(mgr, r.id, {
          managerAssessment: 'Chủ động, bám sát chỉ tiêu; cần cải thiện tốc độ xử lý hồ sơ.',
          proposedRating: s.progress >= 85 ? 'A' : 'B',
        });
      }
    }

    // [I8] đối chiếu sau cùng — seed hiệu suất KHÔNG được chạm Từ điển Tác vụ
    const dictAfter = await owner.taskCell.count({
      where: { tenantId: tenant.id, configVersionId: null },
    });
    if (dictAfter !== dictBefore) {
      throw new Error(`[I8] Từ điển Tác vụ đổi ${dictBefore}→${dictAfter} — seed đã chạm dữ liệu thật`);
    }

    log(
      `Seed Perf Demo '${tenantCode}': person ${result.persons} · objective ${result.objectives} · ` +
      `goal ${result.goals} · kpi ${result.kpis} · scorecard ${result.scorecards} · ` +
      `checkin ${result.checkins} · evidence ${result.evidence} · review ${result.reviews} ` +
      `(Từ điển Tác vụ giữ nguyên ${dictAfter} cell canonical)`,
    );
    return result;
  } finally {
    await owner.$disconnect();
    if (!opts.prisma) await prisma.onModuleDestroy();
  }
}

/** Gỡ sạch dữ liệu demo — thứ tự tôn trọng FK. Dùng owner client (RLS bypass) vì đây
 *  là thao tác vận hành ngoài luồng người dùng. audit_log KHÔNG đụng (append-only). */
async function purgeDemo(
  owner: PrismaClient, tenantId: string, codePrefix: string, log: (m: string) => void,
): Promise<number> {
  const persons = await owner.person.findMany({
    where: { tenantId, employeeCode: { startsWith: codePrefix } },
    select: { id: true },
  });
  const personIds = persons.map((p) => p.id);
  const cycles = await owner.reviewCycle.findMany({
    where: { tenantId, name: { startsWith: DEMO_TAG } }, select: { id: true },
  });
  const cycleIds = cycles.map((c) => c.id);
  const reviewRows = await owner.review.findMany({
    where: { tenantId, OR: [{ cycleId: { in: cycleIds } }, { revieweeId: { in: personIds } }] },
    select: { id: true },
  });
  const reviewIds = reviewRows.map((r) => r.id);
  const checkinRows = await owner.checkin.findMany({
    where: { tenantId, personId: { in: personIds } }, select: { id: true },
  });
  const checkinIds = checkinRows.map((c) => c.id);
  const scorecardRows = await owner.scorecard.findMany({
    where: { tenantId, nameVi: { startsWith: DEMO_TAG } }, select: { id: true },
  });
  const scorecardIds = scorecardRows.map((s) => s.id);
  const kpiRows = await owner.kpi.findMany({
    where: { tenantId, code: { startsWith: 'DEMO-' } }, select: { id: true, formulaId: true },
  });
  const kpiIds = kpiRows.map((k) => k.id);
  const appUsers = await owner.appUser.findMany({
    where: { tenantId, personId: { in: personIds } }, select: { id: true },
  });
  const appUserIds = appUsers.map((u) => u.id);

  let n = 0;
  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    const r = await fn();
    if (r.count) log(`  · ${label}: ${r.count}`);
    n += r.count;
  };

  await del('review_item_score', () => owner.reviewItemScore.deleteMany({ where: { reviewId: { in: reviewIds } } }));
  await del('review', () => owner.review.deleteMany({ where: { id: { in: reviewIds } } }));
  await del('review_cycle', () => owner.reviewCycle.deleteMany({ where: { id: { in: cycleIds } } }));
  await del('checkin_goal_update', () => owner.checkinGoalUpdate.deleteMany({ where: { checkinId: { in: checkinIds } } }));
  await del('checkin', () => owner.checkin.deleteMany({ where: { id: { in: checkinIds } } }));
  await del('evidence', () => owner.evidence.deleteMany({ where: { tenantId, OR: [{ ownerId: { in: personIds } }, { relatedKpiId: { in: kpiIds } }] } }));
  await del('scorecard_item', () => owner.scorecardItem.deleteMany({ where: { scorecardId: { in: scorecardIds } } }));
  await del('scorecard', () => owner.scorecard.deleteMany({ where: { id: { in: scorecardIds } } }));
  await del('kpi_score_tier', () => owner.kpiScoreTier.deleteMany({ where: { kpiId: { in: kpiIds } } }));
  await del('kpi', () => owner.kpi.deleteMany({ where: { id: { in: kpiIds } } }));
  await del('goal', () => owner.goal.deleteMany({ where: { tenantId, nameVi: { startsWith: DEMO_TAG } } }));
  await del('objective', () => owner.objective.deleteMany({ where: { tenantId, nameVi: { startsWith: DEMO_TAG } } }));
  await del('user_role', () => owner.userRole.deleteMany({ where: { appUserId: { in: appUserIds } } }));
  await del('app_user', () => owner.appUser.deleteMany({ where: { id: { in: appUserIds } } }));
  await del('person', () => owner.person.deleteMany({ where: { id: { in: personIds } } }));
  return n;
}

/* istanbul ignore next — CLI entry */
if (require.main === module) {
  const args = process.argv.slice(2);
  const purge = args.includes('--purge');
  const tenantCode = args.find((a) => !a.startsWith('--'));
  seedPerfDemo({ tenantCode, purge })
    .catch((e) => { console.error(e); process.exit(1); });
}
