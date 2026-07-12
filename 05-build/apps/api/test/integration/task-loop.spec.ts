/**
 * Integration Phase 3 lát 4k — Vòng lặp tối ưu liên tục (trái tim spec Task Dictionary):
 * backfill active v1 → claim về phòng → góp ý (emp) → reopen (dept_head, giao emp có
 * grant 4j) → emp sửa + submit → Q1 chặn KPI treo → needs_changes → sửa lại →
 * approve-active → ACTIVE v2 + revision (append-only) + feedback resolved.
 * SoD: emp không tự duyệt (403 RBAC) · admin giữ cả author+approve → 409 sod_rule ·
 * lịch sử bất biến (trigger chặn UPDATE) · F108 config publish chặn cell thiếu KPI ·
 * cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(180_000);

interface Ctx { id: string; token: string; userId: string; email: string }

describe('Phase 3 lát 4k — vòng lặp tối ưu liên tục', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let dept: Ctx;
  let emp: Ctx;
  let admin: Ctx;
  let designer: Ctx;
  let approver: Ctx;
  let t2dept: Ctx;
  let adm: string;          // org unit ADMISSIONS (phòng của dept@ + emp1@)
  let cellId: string;       // cell canonical TS-* dùng cho vòng lặp
  let cellCode: string;
  let draftCellId: string;  // cell canonical draft (chưa active) — test feedback 422
  const uniq = Date.now() % 100000;

  async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
    const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
    const user = await owner.appUser.findFirst({
      where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
    });
    const token = jwt.sign(
      { sub: user!.id, tid: tenant!.id, email: user!.email },
      getJwtSecret(), { expiresIn: '1h' },
    );
    return { id: tenant!.id, token, userId: user!.id, email: user!.email };
  }

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    dept = await ctxFor('H.01', 'dept@');
    emp = await ctxFor('H.01', 'emp1@');
    admin = await ctxFor('H.01', 'admin@');
    designer = await ctxFor('H.01', 'designer@');
    approver = await ctxFor('H.01', 'approver@');
    t2dept = await ctxFor('T2.TEST', 'dept@');
    adm = (await owner.orgUnit.findFirst({ where: { tenantId: dept.id, code: 'ADMISSIONS' } }))!.id;

    // Cell vòng lặp: 1 cell TS-* từ seed 4i — reset về trạng thái nền (active v1, chưa owner)
    const cell = await owner.taskCell.findFirst({
      where: { tenantId: dept.id, configVersionId: null, deletedAt: null, code: { startsWith: 'TS-G01-' } },
      orderBy: { code: 'asc' },
    });
    cellId = cell!.id;
    cellCode = cell!.code;
    // dọn artefact vòng chạy trước của CHÍNH spec này (chuẩn F66 — scoped)
    await owner.taskFeedback.deleteMany({ where: { taskCellId: cellId } });
    await owner.$executeRaw`ALTER TABLE task_revision DISABLE TRIGGER task_revision_append_only`;
    await owner.$executeRaw`DELETE FROM task_revision WHERE task_cell_id = ${cellId}::uuid AND version > 1`;
    await owner.$executeRaw`ALTER TABLE task_revision ENABLE TRIGGER task_revision_append_only`;
    const oldContribs = await owner.libraryContribution.findMany({
      where: { taskCellId: cellId }, select: { id: true },
    });
    const oldIds = oldContribs.map((x) => x.id);
    await owner.libraryReview.deleteMany({ where: { contributionId: { in: oldIds } } });
    await owner.libraryDedupCandidate.deleteMany({ where: { contributionId: { in: oldIds } } });
    await owner.libraryContribution.deleteMany({ where: { id: { in: oldIds } } });
    const v1 = await owner.taskRevision.findFirst({ where: { taskCellId: cellId, version: 1 } });
    await owner.taskCell.update({
      where: { id: cellId },
      data: {
        status: 'active', activeVersion: 1, ownerOrgUnitId: null,
        nameVi: (v1!.snapshot as { nameVi: string }).nameVi,
      },
    });

    // dọn cell LOOP4K-* của lần chạy trước (test F130/F132 tạo cell mới mỗi lần)
    const loopCells = await owner.taskCell.findMany({
      where: { code: { startsWith: 'LOOP4K-' } }, select: { id: true },
    });
    const loopIds = loopCells.map((x) => x.id);
    if (loopIds.length > 0) {
      await owner.taskFeedback.deleteMany({ where: { taskCellId: { in: loopIds } } });
      await owner.$executeRaw`ALTER TABLE task_revision DISABLE TRIGGER task_revision_append_only`;
      await owner.taskRevision.deleteMany({ where: { taskCellId: { in: loopIds } } });
      await owner.$executeRaw`ALTER TABLE task_revision ENABLE TRIGGER task_revision_append_only`;
      const loopContribs = await owner.libraryContribution.findMany({
        where: { OR: [{ taskCellId: { in: loopIds } }, { kpiRef: null, payload: { path: ['code'], string_starts_with: 'LOOP4K-' } }] },
        select: { id: true },
      });
      const lcIds = loopContribs.map((x) => x.id);
      await owner.libraryReview.deleteMany({ where: { contributionId: { in: lcIds } } });
      await owner.libraryDedupCandidate.deleteMany({ where: { contributionId: { in: lcIds } } });
      await owner.libraryContribution.deleteMany({ where: { id: { in: lcIds } } });
      await owner.taskCell.deleteMany({ where: { id: { in: loopIds } } });
    }
    // phiếu LOOP4K mồ côi (cell đã xoá vòng trước)
    const orphanContribs = await owner.libraryContribution.findMany({
      where: { tenantId: dept.id, payload: { path: ['code'], string_starts_with: 'LOOP4K-' } },
      select: { id: true },
    });
    const ocIds = orphanContribs.map((x) => x.id);
    await owner.libraryReview.deleteMany({ where: { contributionId: { in: ocIds } } });
    await owner.libraryDedupCandidate.deleteMany({ where: { contributionId: { in: ocIds } } });
    await owner.libraryContribution.deleteMany({ where: { id: { in: ocIds } } });

    // Cell canonical DRAFT (chưa vận hành) — feedback phải 422
    await owner.taskCell.deleteMany({ where: { code: `DICT4K-DRAFT-${0}`, tenantId: dept.id } });
    const draft = await owner.taskCell.create({
      data: {
        id: uuidv7(), tenantId: dept.id, configVersionId: null,
        code: 'DICT4K-DRAFT-0', nameVi: 'Cell draft chưa vận hành',
        libScope: 'tenant', origin: 'imported', status: 'draft',
        kpiRef: 'ADM-LEAD-001',
      },
    });
    draftCellId = draft.id;

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await owner.taskCell.deleteMany({ where: { id: draftCellId } });
    // thu hồi grant emp1 mà spec này tạo — các suite khác pin "emp KHÔNG có quyền soạn"
    const grants = await owner.authoringGrant.findMany({
      where: { tenantId: dept.id, granteeId: emp.userId, status: 'active' },
    });
    for (const g of grants) {
      if (g.userRoleId) {
        await owner.userRole.updateMany({
          where: { id: g.userRoleId, deletedAt: null }, data: { deletedAt: new Date() },
        });
      }
    }
    await owner.authoringGrant.updateMany({
      where: { id: { in: grants.map((g) => g.id) } },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  let contributionId: string;
  let feedbackId: string;

  it('backfill 4k: cell canonical seed 4i đã active v1 + revision v1 (snapshot đủ 7 nhóm + kpiRef)', async () => {
    const cell = await owner.taskCell.findFirst({ where: { id: cellId } });
    expect(cell!.status).toBe('active');
    expect(cell!.activeVersion).toBe(1);
    const rev = await owner.taskRevision.findFirst({ where: { taskCellId: cellId, version: 1 } });
    expect(rev).toBeTruthy();
    const snap = rev!.snapshot as { kpiRef?: string; nameVi?: string; inputs?: unknown[] };
    expect(snap.kpiRef).toMatch(/^ADM-/);
    expect(snap.nameVi).toBeTruthy();
  });

  it('claim: dept_head nhận cell về ĐÚNG phòng mình; phòng ngoài scope → 403; cell đã có chủ → 409', async () => {
    // ngoài scope (ROOT) → 403
    const root = await owner.orgUnit.findFirst({ where: { tenantId: dept.id, code: 'ROOT' } });
    expect((await api().post(`/api/v1/task-cells/${cellId}/claim`).set(as(dept))
      .send({ orgUnitId: root!.id })).status).toBe(403);

    const r = await api().post(`/api/v1/task-cells/${cellId}/claim`).set(as(dept))
      .send({ orgUnitId: adm });
    expect(r.status).toBe(201);
    expect(r.body.ownerOrgUnitId).toBe(adm);

    // đã có chủ → dept_head không giành lại được (chỉ tenant admin chuyển)
    expect((await api().post(`/api/v1/task-cells/${cellId}/claim`).set(as(dept))
      .send({ orgUnitId: adm })).status).toBe(409);
  });

  it('feedback: emp góp ý cell active → 201 (gắn version 1); cell draft → 422; list được', async () => {
    const r = await api().post(`/api/v1/task-cells/${cellId}/feedback`).set(as(emp))
      .send({ body: `Trigger thực tế lệch — cần thêm bước xác minh SĐT (${uniq})`, category: 'optimize' });
    expect(r.status).toBe(201);
    expect(r.body.version).toBe(1);
    expect(r.body.status).toBe('open');
    feedbackId = r.body.id;

    expect((await api().post(`/api/v1/task-cells/${draftCellId}/feedback`).set(as(emp))
      .send({ body: 'góp ý cell chưa vận hành' })).status).toBe(422);

    const list = await api().get(`/api/v1/task-cells/${cellId}/feedback`).set(as(emp));
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: string }>).some((f) => f.id === feedbackId)).toBe(true);
  });

  it('reopen: emp không có task:reopen → 403; dept_head reopen + giao emp → contribution draft (tác giả=emp), cell reopened, feedback → reopened', async () => {
    expect((await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(emp))
      .send({ assigneeId: emp.userId })).status).toBe(403);

    // đảm bảo emp có grant soạn (4j) — grant nếu chưa có
    const g = await api().post('/api/v1/authoring/grants').set(as(dept))
      .send({ granteeId: emp.userId, orgUnitId: adm });
    expect([201, 409]).toContain(g.status); // 409 = grant active sẵn từ suite khác

    const r = await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: emp.userId, feedbackIds: [feedbackId], note: 'Tối ưu theo góp ý thực tế' });
    expect(r.status).toBe(201);
    expect(r.body.cell.status).toBe('reopened');
    expect(r.body.contribution.status).toBe('draft');
    expect(r.body.contribution.authorId).toBe(emp.userId);
    expect(r.body.contribution.taskCellId).toBe(cellId);
    contributionId = r.body.contribution.id;

    const fb = await owner.taskFeedback.findFirst({ where: { id: feedbackId } });
    expect(fb!.status).toBe('reopened');
    expect(fb!.reopenedContributionId).toBe(contributionId);

    // reopen lần 2 khi đang reopened → 409
    expect((await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: emp.userId })).status).toBe(409);
  });

  it('[Q1 CHẶN CỨNG] emp sửa gắn KPI treo → submit → approve-active 422 (active-transition có gác)', async () => {
    const c = await owner.libraryContribution.findFirst({ where: { id: contributionId } });
    const payload = { ...(c!.payload as Record<string, unknown>), kpiRef: 'KPI-TREO-999' };
    expect((await api().patch(`/api/v1/library/contributions/${contributionId}`).set(as(emp))
      .send({ payload })).status).toBe(200);
    expect((await api().post(`/api/v1/library/contributions/${contributionId}/submit`).set(as(emp))).status).toBe(201);

    const r = await api().post(`/api/v1/library/contributions/${contributionId}/approve-active`)
      .set(as(dept)).send({});
    expect(r.status).toBe(422);
    expect(r.body.error.message).toContain('KPI-TREO-999');
  });

  it('SoD: admin (giữ cả taskcell:author + taskcell:approve) approve-active → 409 sod_rule + audit incident; emp tự duyệt → 403 RBAC', async () => {
    expect((await api().post(`/api/v1/library/contributions/${contributionId}/approve-active`)
      .set(as(emp)).send({})).status).toBe(403);

    const r = await api().post(`/api/v1/library/contributions/${contributionId}/approve-active`)
      .set(as(admin)).send({});
    expect(r.status).toBe(409);
    const incident = await owner.auditLog.findFirst({
      where: {
        tenantId: dept.id, action: 'sod.violation_blocked',
        entityId: contributionId, actorUserId: admin.userId,
      },
    });
    expect(incident).toBeTruthy();
  });

  it('vòng needs_changes: dept_head request_changes → emp sửa KPI thật + tên mới → submit lại', async () => {
    expect((await api().post(`/api/v1/library/contributions/${contributionId}/review`).set(as(dept))
      .send({ action: 'request_changes', note: 'KPI không tồn tại — gắn KPI thật từ /kpi-dictionary' })).status).toBe(201);

    const c = await owner.libraryContribution.findFirst({ where: { id: contributionId } });
    expect(c!.status).toBe('needs_changes');
    const payload = {
      ...(c!.payload as Record<string, unknown>),
      kpiRef: 'ADM-MQL-002', // đổi KPI sơ bộ → KPI đúng hơn theo góp ý (vẫn trong Từ điển)
      nameVi: `Tác vụ đã tối ưu vòng 2 (${uniq})`,
    };
    expect((await api().patch(`/api/v1/library/contributions/${contributionId}`).set(as(emp))
      .send({ payload })).status).toBe(200);
    expect((await api().post(`/api/v1/library/contributions/${contributionId}/submit`).set(as(emp))).status).toBe(201);
  });

  it('approve-active: dept_head duyệt → ACTIVE v2, payload áp vào cell, revision v2, feedback resolved, phiếu published, audit', async () => {
    const r = await api().post(`/api/v1/library/contributions/${contributionId}/approve-active`)
      .set(as(dept)).send({ note: 'Vòng tối ưu 1 — đổi KPI theo thực tế phễu' });
    expect(r.status).toBe(201);
    expect(r.body.revisionVersion).toBe(2);
    expect(r.body.cell.status).toBe('active');
    expect(r.body.cell.activeVersion).toBe(2);
    expect(r.body.cell.nameVi).toBe(`Tác vụ đã tối ưu vòng 2 (${uniq})`);
    expect(r.body.cell.kpiRef).toBe('ADM-MQL-002');

    const rev2 = await owner.taskRevision.findFirst({ where: { taskCellId: cellId, version: 2 } });
    expect(rev2).toBeTruthy();
    expect((rev2!.snapshot as { kpiRef: string }).kpiRef).toBe('ADM-MQL-002');
    expect(rev2!.contributionId).toBe(contributionId);
    expect(rev2!.activatedBy).toBe(dept.userId);

    const fb = await owner.taskFeedback.findFirst({ where: { id: feedbackId } });
    expect(fb!.status).toBe('resolved');
    const c = await owner.libraryContribution.findFirst({ where: { id: contributionId } });
    expect(c!.status).toBe('published');

    const audit = await owner.auditLog.findFirst({
      where: { tenantId: dept.id, action: 'task.activate', entityId: cellId },
      orderBy: { at: 'desc' },
    });
    expect(audit).toBeTruthy();

    // duyệt lại phiếu đã published → 409
    expect((await api().post(`/api/v1/library/contributions/${contributionId}/approve-active`)
      .set(as(dept)).send({})).status).toBe(409);
  });

  it('lịch sử BẤT BIẾN: UPDATE/DELETE task_revision bị trigger chặn (kể cả owner)', async () => {
    await expect(
      owner.$executeRaw`UPDATE task_revision SET change_summary = 'hack' WHERE task_cell_id = ${cellId}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      owner.$executeRaw`DELETE FROM task_revision WHERE task_cell_id = ${cellId}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it('revisions API: list v2→v1 (không kèm snapshot) + get v1 trả snapshot bản GỐC (diff dựng được)', async () => {
    const list = await api().get(`/api/v1/task-cells/${cellId}/revisions`).set(as(emp));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body[0].version).toBe(2);
    expect(list.body[0].snapshot).toBeUndefined(); // list gọn — snapshot chỉ ở detail

    const v1 = await api().get(`/api/v1/task-cells/${cellId}/revisions/1`).set(as(emp));
    expect(v1.status).toBe(200);
    expect((v1.body.snapshot as { nameVi: string }).nameVi).not.toBe(`Tác vụ đã tối ưu vòng 2 (${uniq})`);
    expect((v1.body.snapshot as { kpiRef: string }).kpiRef).not.toBe('ADM-MQL-002');
  });

  it('[F108] config publish CHẶN cell version-scoped thiếu KPI thật; gắn KPI → publish OK', async () => {
    // [F139] nhớ bản published hiện hành để KHÔI PHỤC sau test (publish sẽ archive nó)
    const prevPublished = await owner.configVersion.findFirst({
      where: { tenantId: dept.id, status: 'published', deletedAt: null },
    });
    // designer tạo draft version + owner chèn 1 cell version-scoped KHÔNG kpiRef
    const cv = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `f108-${uniq}` });
    expect(cv.status).toBe(201);
    const cvId = cv.body.id as string;
    const vCell = await owner.taskCell.create({
      data: {
        id: uuidv7(), tenantId: dept.id, configVersionId: cvId,
        code: `F108-${uniq}`, nameVi: 'Cell version-scoped chưa gắn KPI',
        libScope: 'local', origin: 'library',
      },
    });

    const fail = await api().post(`/api/v1/config-versions/${cvId}/publish`).set(as(approver))
      .send({ version: cv.body.version });
    expect(fail.status).toBe(422);
    expect(fail.body.error.message).toContain('F108');

    await owner.taskCell.update({ where: { id: vCell.id }, data: { kpiRef: 'ADM-LEAD-001' } });
    const ok = await api().post(`/api/v1/config-versions/${cvId}/publish`).set(as(approver))
      .send({ version: cv.body.version });
    expect(ok.status).toBe(201);

    // [F139] dọn + KHÔI PHỤC bản published cũ (suite khác có thể phụ thuộc)
    await owner.taskCell.deleteMany({ where: { id: vCell.id } });
    await owner.configVersion.updateMany({ where: { id: cvId }, data: { status: 'archived' } });
    if (prevPublished) {
      await owner.configVersion.updateMany({
        where: { id: prevPublished.id }, data: { status: 'published' },
      });
    }
  });

  // ===== Bộ test bổ sung theo Reviewer 4k (F130/F131/F132) =====

  it('[F131a] reject phiếu vòng tối ưu → cell TỰ về active + feedback về triaged (không kẹt reopened)', async () => {
    // cell1 đang active v2 — mở vòng mới
    const fb = await api().post(`/api/v1/task-cells/${cellId}/feedback`).set(as(emp))
      .send({ body: 'Góp ý vòng 2 — thử nhánh reject' });
    const r = await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: emp.userId, feedbackIds: [fb.body.id] });
    expect(r.status).toBe(201);
    const cid = r.body.contribution.id as string;
    // reject đòi phiếu submitted → emp submit
    expect((await api().post(`/api/v1/library/contributions/${cid}/submit`).set(as(emp))).status).toBe(201);
    expect((await api().post(`/api/v1/library/contributions/${cid}/review`).set(as(dept))
      .send({ action: 'reject', note: 'Không cần sửa nữa' })).status).toBe(201);

    const cell = await owner.taskCell.findFirst({ where: { id: cellId } });
    expect(cell!.status).toBe('active');
    expect(cell!.activeVersion).toBe(2); // nội dung KHÔNG đổi
    const fbRow = await owner.taskFeedback.findFirst({ where: { id: fb.body.id } });
    expect(fbRow!.status).toBe('triaged'); // góp ý quay về hàng chờ, không mất
  });

  it('[F132a-review] review approve phiếu vòng tối ưu → 422 (bắt đi approve-active); [F131b] reopen-cancel thoát reopened', async () => {
    const r = await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: emp.userId });
    expect(r.status).toBe(201);
    const cid = r.body.contribution.id as string;
    expect((await api().post(`/api/v1/library/contributions/${cid}/submit`).set(as(emp))).status).toBe(201);

    // đường vòng curation bị chặn
    const blocked = await api().post(`/api/v1/library/contributions/${cid}/review`).set(as(dept))
      .send({ action: 'approve' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.message).toContain('approve-active');

    // reopen-cancel: cell về active, phiếu rejected
    const cancel = await api().post(`/api/v1/task-cells/${cellId}/reopen-cancel`).set(as(dept))
      .send({ note: 'Huỷ vòng — không tối ưu nữa' });
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('active');
    const c = await owner.libraryContribution.findFirst({ where: { id: cid } });
    expect(c!.status).toBe('rejected');
    // reopen lại được (không kẹt)
    const again = await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: emp.userId });
    expect(again.status).toBe(201);
    await api().post(`/api/v1/task-cells/${cellId}/reopen-cancel`).set(as(dept)).send({});
  });

  it('[F131c] giao người KHÔNG có quyền soạn → 422 fail-fast (không kẹt phiếu draft)', async () => {
    const p = await owner.person.create({
      data: {
        id: uuidv7(), tenantId: dept.id, employeeCode: `4K-NOGRANT-${uniq}`,
        fullName: 'Nhân viên chưa được ủy quyền', status: 'active',
        orgUnitId: adm, email: `nogrant-${uniq}@h01.nhg.local`,
      },
    });
    const u = await owner.appUser.create({
      data: { id: uuidv7(), tenantId: dept.id, personId: p.id, email: p.email!, status: 'active' },
    });
    const r = await api().post(`/api/v1/task-cells/${cellId}/reopen`).set(as(dept))
      .send({ assigneeId: u.id });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toContain('quyền soạn');
    // cell vẫn active (fail TRƯỚC khi flip)
    expect((await owner.taskCell.findFirst({ where: { id: cellId } }))!.status).toBe('active');
    await owner.appUser.deleteMany({ where: { id: u.id } });
    await owner.person.deleteMany({ where: { id: p.id } });
  });

  let newCellId: string;
  const newCode = () => `LOOP4K-NEW-T${String(uniq).padStart(3, '0')}`;

  it('[F130] cell MỚI publish qua curation 4f → ACTIVE v1 + revision v1 → góp ý/vòng lặp chạy NGAY (không kẹt draft)', async () => {
    const author = await ctxFor('H.01', 'author@');
    const curator = await ctxFor('H.01', 'curator@');
    const payload = {
      code: newCode(), nameVi: `Tác vụ mới hậu-4k (${uniq})`,
      responsibleRole: 'admissions_officer', accountableRole: 'admissions_manager',
      inputs: ['lead'], outputs: ['log'], measures: [{ name: 'SLA' }], aiLevel: 'assist',
      kpiRef: 'ADM-LEAD-001',
    };
    const cr = await api().post('/api/v1/library/contributions').set(as(author))
      .send({ type: 'task_cell', orgUnitId: adm, payload });
    expect(cr.status).toBe(201);
    const cid = cr.body.id as string;
    expect((await api().post(`/api/v1/library/contributions/${cid}/submit`).set(as(author))).status).toBe(201);
    expect((await api().post(`/api/v1/library/contributions/${cid}/review`).set(as(curator))
      .send({ action: 'approve' })).status).toBe(201);
    expect((await api().post(`/api/v1/library/contributions/${cid}/publish`).set(as(curator))).status).toBe(201);

    const cell = await owner.taskCell.findFirst({
      where: { tenantId: dept.id, code: newCode(), configVersionId: null, deletedAt: null },
    });
    expect(cell).toBeTruthy();
    expect(cell!.status).toBe('active');       // publish = active-transition
    expect(cell!.activeVersion).toBe(1);
    newCellId = cell!.id;
    const rev = await owner.taskRevision.findFirst({ where: { taskCellId: newCellId, version: 1 } });
    expect(rev).toBeTruthy();
    expect((rev!.snapshot as { kpiRef: string }).kpiRef).toBe('ADM-LEAD-001');

    // vòng lặp sống ngay với cell mới: góp ý 201 (trước fix F130 là 422)
    expect((await api().post(`/api/v1/task-cells/${newCellId}/feedback`).set(as(emp))
      .send({ body: 'Cell mới góp ý được ngay' })).status).toBe(201);
  });

  it('[F132a-import] import as_canonical ĐỔI nội dung cell active → revision + bump; import Y HỆT → unchanged, không revision nhiễu', async () => {
    const curator = await ctxFor('H.01', 'curator@');
    const cell = await owner.taskCell.findFirst({ where: { id: newCellId } });
    const row = {
      code: cell!.code, nameVi: `Tác vụ mới hậu-4k RE-BASELINE (${uniq})`,
      responsibleRole: cell!.responsibleRole, accountableRole: cell!.accountableRole,
      inputs: cell!.inputs, outputs: cell!.outputs, measures: cell!.measures,
      aiLevel: cell!.aiLevel, kpiRef: cell!.kpiRef,
    };
    const prev = await api().post('/api/v1/library/import').set(as(curator))
      .send({ mode: 'as_canonical', rows: [row] });
    expect(prev.status).toBe(201);
    const ap = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(ap.status).toBe(201);
    expect((ap.body.stats as { updated: number }).updated).toBe(1);

    const after = await owner.taskCell.findFirst({ where: { id: newCellId } });
    expect(after!.activeVersion).toBe(2);       // đổi nội dung cell active = active-transition mới
    expect(after!.nameVi).toContain('RE-BASELINE');
    const rev2 = await owner.taskRevision.findFirst({ where: { taskCellId: newCellId, version: 2 } });
    expect(rev2).toBeTruthy();                  // lịch sử KHÔNG trôi

    // import Y HỆT lần nữa → unchanged, không sinh revision
    const prev2 = await api().post('/api/v1/library/import').set(as(curator))
      .send({ mode: 'as_canonical', rows: [row] });
    const ap2 = await api().post(`/api/v1/library/import-runs/${prev2.body.id}/apply`).set(as(curator));
    expect(ap2.status).toBe(201);
    expect((ap2.body.stats as { unchanged: number }).unchanged).toBe(1);
    expect(await owner.taskRevision.count({ where: { taskCellId: newCellId } })).toBe(2);
  });

  it('cô lập tenant: dept_head T2 không thấy cell H.01 — không claim/reopen được', async () => {
    // orgUnit H.01 → 403 (scope chặn trước, fail-closed); orgUnit của CHÍNH T2 → 404 (RLS không thấy cell)
    expect((await api().post(`/api/v1/task-cells/${cellId}/claim`).set(as(t2dept))
      .send({ orgUnitId: adm })).status).toBe(403);
    const t2adm = await owner.orgUnit.findFirst({ where: { tenantId: t2dept.id, code: 'ADMISSIONS' } });
    expect((await api().post(`/api/v1/task-cells/${cellId}/claim`).set(as(t2dept))
      .send({ orgUnitId: t2adm!.id })).status).toBe(404);
    expect((await api().get(`/api/v1/task-cells/${cellId}/feedback`).set(as(t2dept))).status).toBe(404);
  });
});
