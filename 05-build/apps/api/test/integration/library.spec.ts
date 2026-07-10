/**
 * Integration Phase 3 lát 4f — BU Authoring Gate:
 * vòng đời draft→submit→review→publish canonical · SoD chặn tự duyệt (bất biến + rule)
 * · quality gate chặn approve · dedup scan + resolve (merge/keep_both) · scope org_unit
 * của bu_author · import 3 mode preview→apply idempotent · cô lập tenant.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string; email: string }

const cellPayload = (code: string, over: Record<string, unknown> = {}) => ({
  code, nameVi: `Tư vấn ${code}`,
  responsibleRole: 'admissions_officer', accountableRole: 'admissions_manager',
  inputs: ['lead'], outputs: ['log'], measures: [{ name: 'SLA' }], aiLevel: 'assist',
  // [4h] gắn KPI dictionary thật để qua hard-block canonical publish/import (Q1)
  kpiRef: 'ADM-LEAD-001',
  ...over,
});

describe('Phase 3 lát 4f — BU Authoring Gate', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  let curator: Ctx;
  let emp: Ctx;
  let admin: Ctx;
  let t2curator: Ctx;
  let deptId: string;
  const uniq = Date.now();
  const code = (s: string) => `BU4F-${s}-${uniq % 100000}`;

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
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
    author = await ctxFor('H.01', 'author@');
    curator = await ctxFor('H.01', 'curator@');
    emp = await ctxFor('H.01', 'emp1@');
    admin = await ctxFor('H.01', 'admin@');
    t2curator = await ctxFor('T2.TEST', 'curator@');
    const dept = await owner.orgUnit.findFirst({
      where: { tenantId: author.id, code: 'ADMISSIONS' },
    });
    deptId = dept!.id;

    // [F66-chuẩn] dọn artefact của CHÍNH spec này từ lần chạy trước
    await owner.taskCell.deleteMany({ where: { code: { startsWith: 'BU4F-' } } });
    await owner.kpiTemplate.deleteMany({ where: { code: { startsWith: 'KPI-BU4F-' } } });

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

  let contribId: string;

  it('author tạo contribution: scope org_unit fail-closed (thiếu/lạ orgUnitId → 403), đúng scope → draft + gate score', async () => {
    // author scope org_unit → thiếu orgUnitId là 403
    expect((await api().post('/api/v1/library/contributions').set(as(author)).send({
      type: 'task_cell', payload: cellPayload(code('X')),
    })).status).toBe(403);

    // emp không có library:submit → 403
    expect((await api().post('/api/v1/library/contributions').set(as(emp)).send({
      type: 'task_cell', payload: cellPayload(code('X')), orgUnitId: deptId,
    })).status).toBe(403);

    const r = await api().post('/api/v1/library/contributions').set(as(author)).send({
      type: 'task_cell_with_kpi',
      orgUnitId: deptId,
      payload: cellPayload(code('T001'), {
        kpi: { nameVi: 'Tỷ lệ chốt lead', method: 'manual', direction: 'forward' },
      }),
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('draft');
    expect(Number(r.body.qualityScore)).toBe(100);
    contribId = r.body.id;
  });

  it('quality gate chặn approve: payload thiếu RACI → submit được nhưng approve 422 (explainable)', async () => {
    const bad = await api().post('/api/v1/library/contributions').set(as(author)).send({
      type: 'task_cell', orgUnitId: deptId,
      payload: cellPayload(code('BAD'), { responsibleRole: undefined, measures: [] }),
    });
    expect(bad.status).toBe(201);
    expect(Number(bad.body.qualityScore)).toBeLessThan(100);

    await api().post(`/api/v1/library/contributions/${bad.body.id}/submit`).set(as(author));
    const rev = await api().post(`/api/v1/library/contributions/${bad.body.id}/review`)
      .set(as(curator)).send({ action: 'approve' });
    expect(rev.status).toBe(422);
    expect(rev.body.error.message).toContain('Quality gate FAIL');

    // request_changes → author sửa → quay về draft
    await api().post(`/api/v1/library/contributions/${bad.body.id}/review`)
      .set(as(curator)).send({ action: 'request_changes', note: 'Bổ sung RACI + measures' });
    const fixed = await api().patch(`/api/v1/library/contributions/${bad.body.id}`)
      .set(as(author)).send({ payload: cellPayload(code('BAD')) });
    expect(fixed.status).toBe(200);
    expect(fixed.body.status).toBe('draft');
    expect(Number(fixed.body.qualityScore)).toBe(100);
  });

  it('SoD: author submit → curator duyệt OK; author KHÔNG tự review (kể cả có curate qua admin) — 409 + incident', async () => {
    const sub = await api().post(`/api/v1/library/contributions/${contribId}/submit`).set(as(author));
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe('submitted');

    // admin (giữ mọi permission) tạo contribution của CHÍNH MÌNH rồi tự approve → 409 bất biến
    const own = await api().post('/api/v1/library/contributions').set(as(admin)).send({
      type: 'task_cell', payload: cellPayload(code('SELF')),
    });
    await api().post(`/api/v1/library/contributions/${own.body.id}/submit`).set(as(admin));
    const selfReview = await api().post(`/api/v1/library/contributions/${own.body.id}/review`)
      .set(as(admin)).send({ action: 'approve' });
    expect(selfReview.status).toBe(409);
    const incident = await owner.auditLog.findFirst({
      where: {
        tenantId: admin.id, action: 'sod.violation_blocked',
        entityType: 'library_contribution', entityId: own.body.id,
      },
    });
    expect(incident).not.toBeNull();

    // curator (không phải tác giả) approve contribution của author → OK
    const ok = await api().post(`/api/v1/library/contributions/${contribId}/review`)
      .set(as(curator)).send({ action: 'approve', note: 'Đạt chuẩn 7 nhóm' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('approved');
  });

  it('publish canonical: emp/author 403 (permission); curator OK → task_cell configVersionId NULL + kpi_template + audit', async () => {
    expect((await api().post(`/api/v1/library/contributions/${contribId}/publish`)
      .set(as(author))).status).toBe(403);

    const pub = await api().post(`/api/v1/library/contributions/${contribId}/publish`).set(as(curator));
    expect(pub.status).toBe(201);
    expect(pub.body.status).toBe('published');

    const cell = await owner.taskCell.findFirst({
      where: { tenantId: author.id, code: code('T001'), configVersionId: null },
    });
    expect(cell).not.toBeNull();
    expect(cell!.libScope).toBe('tenant');
    expect(cell!.origin).toBe('bu_authored');
    expect(cell!.contributedBy).toBe(author.userId);
    expect(cell!.kpiRef).toBe(`KPI-${code('T001')}`); // KPI không khai code → sinh từ cell

    const tpl = await owner.kpiTemplate.findFirst({
      where: { tenantId: author.id, code: `KPI-${code('T001')}` },
    });
    expect(tpl).not.toBeNull();
    expect(tpl!.taskCellRefs).toContain(code('T001'));

    const audit = await owner.auditLog.findFirst({
      where: { tenantId: author.id, action: 'library.publish', entityId: contribId },
    });
    expect(audit).not.toBeNull();
  });

  it('dedup: contribution trùng mã canonical → candidate pending chặn approve; keep_both → cell mới trỏ canonical_id', async () => {
    const dup = await api().post('/api/v1/library/contributions').set(as(author)).send({
      type: 'task_cell', orgUnitId: deptId,
      payload: cellPayload(code('T001'), { nameVi: 'Biến thể BU khác' }),
    });
    const sub = await api().post(`/api/v1/library/contributions/${dup.body.id}/submit`).set(as(author));
    expect(sub.body.dedupCandidates).toHaveLength(1);
    expect(Number(sub.body.dedupCandidates[0].similarity)).toBe(1);

    // approve khi dedup pending → 422
    expect((await api().post(`/api/v1/library/contributions/${dup.body.id}/review`)
      .set(as(curator)).send({ action: 'approve' })).status).toBe(422);

    // resolve keep_both (giữ 2 bản → mã phải KHÁC); đang submitted nên PATCH bị khoá (409)
    // → đúng vòng đời: curator request_changes → author sửa mã → submit lại
    await api().post(`/api/v1/library/dedup/${sub.body.dedupCandidates[0].id}/resolve`)
      .set(as(curator)).send({ resolution: 'keep_both' });
    expect((await api().patch(`/api/v1/library/contributions/${dup.body.id}`).set(as(author))
      .send({ payload: cellPayload(code('T001V2')) })).status).toBe(409);

    await api().post(`/api/v1/library/contributions/${dup.body.id}/review`)
      .set(as(curator)).send({ action: 'request_changes', note: 'keep_both — đổi mã biến thể' });
    const patched = await api().patch(`/api/v1/library/contributions/${dup.body.id}`).set(as(author))
      .send({ payload: cellPayload(code('T001V2'), { nameVi: 'Biến thể BU khác' }) });
    expect(patched.status).toBe(200);
    await api().post(`/api/v1/library/contributions/${dup.body.id}/submit`).set(as(author));
    await api().post(`/api/v1/library/contributions/${dup.body.id}/review`)
      .set(as(curator)).send({ action: 'approve' });
    const pub = await api().post(`/api/v1/library/contributions/${dup.body.id}/publish`).set(as(curator));
    expect(pub.status).toBe(201);

    const variant = await owner.taskCell.findFirst({
      where: { tenantId: author.id, code: code('T001V2'), configVersionId: null },
    });
    const canonical = await owner.taskCell.findFirst({
      where: { tenantId: author.id, code: code('T001'), configVersionId: null },
    });
    expect(variant!.canonicalId).toBe(canonical!.id); // keep_both → biến thể trỏ canonical
  });

  it('author chỉ thấy contribution của MÌNH; curator thấy queue; T2 cô lập', async () => {
    const mine = await api().get('/api/v1/library/contributions').set(as(author));
    expect(mine.status).toBe(200);
    expect(mine.body.every((c: any) => c.authorId === author.userId)).toBe(true);

    const queue = await api().get('/api/v1/library/queue?status=published').set(as(curator));
    expect(queue.status).toBe(200);
    expect(queue.body.some((c: any) => c.id === contribId)).toBe(true);
    // author không có library:curate → không xem được queue
    expect((await api().get('/api/v1/library/queue').set(as(author))).status).toBe(403);

    const t2 = await api().get('/api/v1/library/queue?status=published').set(as(t2curator));
    expect(t2.body.some((c: any) => c.id === contribId)).toBe(false);
  });

  it('import §6.5: preview validate + diff; as_canonical đòi permission riêng; apply idempotent + chỉ 1 lần', async () => {
    const rows = [
      cellPayload(code('I001')),
      cellPayload(code('I002'), { kpi: { nameVi: 'Số hồ sơ', method: 'system', direction: 'forward', dataSource: 'crm' } }),
      cellPayload(code('T001')), // trùng canonical đã publish → update (idempotent)
      { code: 'sai-he-ma', nameVi: 'x' }, // fail gate
    ];

    // author (library:import, KHÔNG có :canonical) xin as_canonical → 403
    expect((await api().post('/api/v1/library/import').set(as(author)).send({
      mode: 'as_canonical', rows,
    })).status).toBe(403);

    const prev = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_canonical', rows, sourceRef: `spec-4f-${uniq}`,
    });
    expect(prev.status).toBe(201);
    expect(prev.body.status).toBe('preview');
    expect(prev.body.stats).toEqual(expect.objectContaining({ parsed: 4, valid: 3, invalid: 1, duplicated: 1 }));
    expect(prev.body.diff.add).toEqual(expect.arrayContaining([code('I001'), code('I002')]));
    expect(prev.body.diff.update).toEqual([code('T001')]);

    // preview KHÔNG ghi thư viện
    expect(await owner.taskCell.findFirst({
      where: { tenantId: curator.id, code: code('I001') },
    })).toBeNull();

    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(applied.status).toBe(201);
    expect(applied.body.status).toBe('applied');
    expect(applied.body.stats.imported).toBe(2);
    expect(applied.body.stats.updated).toBe(1);

    const i1 = await owner.taskCell.findFirst({
      where: { tenantId: curator.id, code: code('I001'), configVersionId: null },
    });
    expect(i1!.origin).toBe('imported');
    expect(i1!.libScope).toBe('tenant');

    // apply lần 2 cùng run → 409 (mỗi preview apply đúng 1 lần — chuẩn F28)
    expect((await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`)
      .set(as(curator))).status).toBe(409);

    // chạy lại từ preview mới cùng rows → idempotent: toàn update, không nhân bản
    const prev2 = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_canonical', rows: rows.slice(0, 2),
    });
    expect(prev2.body.diff.update).toEqual(expect.arrayContaining([code('I001'), code('I002')]));
    const applied2 = await api().post(`/api/v1/library/import-runs/${prev2.body.id}/apply`).set(as(curator));
    expect(applied2.body.stats.imported).toBe(0);
    expect(applied2.body.stats.updated).toBe(2);
    const count = await owner.taskCell.count({
      where: { tenantId: curator.id, code: code('I001'), deletedAt: null },
    });
    expect(count).toBe(1);
  });

  it('import as_submission: [F92b] author scoped thiếu orgUnitId → 403; đủ → contribution submitted + [F92a] dedup scan chạy', async () => {
    // author scope org_unit → import không khai orgUnitId là 403 (như create contribution)
    expect((await api().post('/api/v1/library/import').set(as(author)).send({
      mode: 'as_submission', rows: [cellPayload(code('S001'))],
    })).status).toBe(403);

    const prev = await api().post('/api/v1/library/import').set(as(author)).send({
      mode: 'as_submission', orgUnitId: deptId,
      rows: [
        cellPayload(code('S001')),
        cellPayload(code('S002'), { nameVi: `Tư vấn ${code('I002')}` }), // trùng TÊN canonical I002
      ],
    });
    expect(prev.status).toBe(201);
    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(author));
    expect(applied.body.stats.contributions).toBe(2);

    const queue = await api().get('/api/v1/library/queue').set(as(curator));
    const s1 = queue.body.find((c: any) => (c.payload as any).code === code('S001'));
    const s2 = queue.body.find((c: any) => (c.payload as any).code === code('S002'));
    expect(s1).toBeTruthy();
    expect(s1.orgUnitId).toBe(deptId); // [F92b] mang scope người import
    // [F92a] trùng tên chuẩn hoá với canonical I002 → có dedup candidate, không "0 pending" giả
    expect(s2.dedupCandidates.length).toBeGreaterThanOrEqual(1);
  });

  it('[F91] SoD: admin (giữ taskcell:author) import as_canonical → 409 + audit incident', async () => {
    const r = await api().post('/api/v1/library/import').set(as(admin)).send({
      mode: 'as_canonical', rows: [cellPayload(code('EVIL'))],
    });
    expect(r.status).toBe(409);
    const incident = await owner.auditLog.findFirst({
      where: {
        tenantId: admin.id, action: 'sod.violation_blocked', entityType: 'library_import_run',
        actorUserId: admin.userId,
      },
      orderBy: { id: 'desc' },
    });
    expect(incident).not.toBeNull();
    // không có cell nào bị ghi
    expect(await owner.taskCell.findFirst({
      where: { tenantId: admin.id, code: code('EVIL') },
    })).toBeNull();
  });

  it('[F90] as_local: version bị publish giữa preview→apply → 422 + run failed (published bất biến)', async () => {
    // draft version qua API (designer), rồi owner ép published để mô phỏng TOCTOU
    const designer = await (async () => {
      const u = await owner.appUser.findFirst({
        where: { tenantId: admin.id, email: { startsWith: 'designer@' } },
      });
      const token = jwt.sign({ sub: u!.id, tid: admin.id, email: u!.email }, getJwtSecret(), { expiresIn: '1h' });
      return { id: admin.id, token, userId: u!.id, email: u!.email } as Ctx;
    })();
    const v = await api().post('/api/v1/config-versions').set(as(designer))
      .send({ label: `lib4f-local-${uniq}` });
    const prev = await api().post('/api/v1/library/import').set(as(curator)).send({
      mode: 'as_local', configVersionId: v.body.id, rows: [cellPayload(code('L001'))],
    });
    expect(prev.status).toBe(201);

    await owner.configVersion.update({ where: { id: v.body.id }, data: { status: 'published' } });
    const applied = await api().post(`/api/v1/library/import-runs/${prev.body.id}/apply`).set(as(curator));
    expect(applied.status).toBe(422);
    const run = await owner.libraryImportRun.findUnique({ where: { id: prev.body.id } });
    expect(run!.status).toBe('failed');
    // dọn: không để version published giả ảnh hưởng resolver/spec khác
    await owner.configVersion.update({ where: { id: v.body.id }, data: { status: 'archived' } });
  });

  it('deprecate canonical: curator soft-delete + cell biến mất khỏi canonical; emp 403', async () => {
    const cell = await owner.taskCell.findFirst({
      where: { tenantId: curator.id, code: code('I001'), configVersionId: null, deletedAt: null },
    });
    expect((await api().post(`/api/v1/library/task-cells/${cell!.id}/deprecate`)
      .set(as(emp))).status).toBe(403);
    const dep = await api().post(`/api/v1/library/task-cells/${cell!.id}/deprecate`).set(as(curator));
    expect(dep.status).toBe(201);
    expect(dep.body.deprecated).toBe(code('I001'));
    const gone = await owner.taskCell.findFirst({ where: { id: cell!.id } });
    expect(gone!.deletedAt).not.toBeNull();
  });
});
