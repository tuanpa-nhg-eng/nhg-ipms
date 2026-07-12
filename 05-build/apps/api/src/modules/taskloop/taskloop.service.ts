import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { effectiveScope } from '../../common/auth/scope.util';
import { CellPayload, evaluateQualityGate, resolveKpiRef } from '../library/quality-gate';
import { assertKpiRefExists } from '../library/kpi-guard';

/** Marker SoD violation trong tx — audit incident ghi NGOÀI tx (chuẩn F48). */
class SodViolationError extends Error {
  constructor(public severity: string, public rule: string) {
    super('sod_violation');
  }
}

const FEEDBACK_MAX_BYTES = 4_096; // cap body góp ý (chuẩn F64)

/**
 * [Lát 4k] Vòng lặp tối ưu liên tục (Spec Task Dictionary §6 — trái tim yêu cầu):
 *   ACTIVE → task_feedback (góp ý sử dụng) → reopen (trưởng phòng, spawn contribution
 *   từ snapshot bản active, giao nhân viên) → nhân viên sửa + submit → trưởng phòng
 *   approve-active → ACTIVE v+1 + task_revision (append-only) + feedback resolved.
 *
 * Bất biến giữ tuyệt đối:
 * - SoD: người sửa KHÔNG tự duyệt bản của mình (bất biến, chặn cả admin) +
 *   sod_rule taskcell:author ⟂ taskcell:approve runtime.
 * - Q1 CHẶN CỨNG: approve-active là active-transition → assertKpiRefExists.
 * - Scope: trưởng phòng chỉ thao tác trên cell thuộc PHÒNG MÌNH (owner_org_unit_id);
 *   cell chưa có phòng sở hữu → phải claim trước (fail-closed).
 * - Lịch sử: task_revision append-only (trigger + grant không UPDATE/DELETE).
 */
@Injectable()
export class TaskLoopService {
  constructor(private prisma: PrismaService) {}

  // ===== Helpers =====

  private async mustGetCanonicalCell(tx: TenantTx, cellId: string) {
    const cell = await tx.taskCell.findFirst({
      where: { id: cellId, configVersionId: null, deletedAt: null },
    });
    if (!cell) throw new NotFoundException('Task cell canonical không tồn tại');
    return cell;
  }

  /** Trưởng phòng (scope org_unit) chỉ thao tác trên cell phòng mình; cell chưa
   * có phòng sở hữu → chỉ tenant-scope (B1/admin) hoặc phải claim trước. */
  private assertCellScope(user: RequestUser, ownerOrgUnitId: string | null, action: string) {
    const scope = effectiveScope(user);
    if (scope.mode === 'tenant') return;
    if (!ownerOrgUnitId || !scope.orgUnitIds.includes(ownerOrgUnitId)) {
      throw new ForbiddenException(
        `Chỉ ${action} được tác vụ thuộc phòng mình (cell chưa nhận về phòng → dùng /claim trước)`,
      );
    }
  }

  /** Snapshot 7 nhóm thuộc tính từ row cell — dùng cho reopen payload + revision. */
  private snapshotOf(cell: {
    code: string; groupCode: string | null; clusterCode: string | null;
    nameVi: string; nameEn: string | null;
    responsibleRole: string | null; accountableRole: string | null;
    consulted: unknown; informed: unknown; inputs: unknown; outputs: unknown;
    measures: unknown; aiLevel: string | null; aiDimension: unknown;
    governance: unknown; riskLevel: string | null; lifecycle: unknown;
    kpiRef: string | null;
  }): CellPayload {
    return {
      code: cell.code, groupCode: cell.groupCode ?? undefined, clusterCode: cell.clusterCode ?? undefined,
      nameVi: cell.nameVi, nameEn: cell.nameEn ?? undefined,
      responsibleRole: cell.responsibleRole ?? undefined,
      accountableRole: cell.accountableRole ?? undefined,
      consulted: cell.consulted ?? undefined, informed: cell.informed ?? undefined,
      inputs: (cell.inputs as unknown[]) ?? undefined,
      outputs: (cell.outputs as unknown[]) ?? undefined,
      measures: (cell.measures as unknown[]) ?? undefined,
      aiLevel: cell.aiLevel ?? undefined, aiDimension: cell.aiDimension ?? undefined,
      governance: cell.governance ?? undefined, riskLevel: cell.riskLevel ?? undefined,
      lifecycle: cell.lifecycle ?? undefined,
      kpiRef: cell.kpiRef ?? undefined,
    };
  }

  // ===== Claim — trưởng phòng nhận cell về phòng (Q5: seed để trống owner) =====

  claim(user: RequestUser, cellId: string, orgUnitId: string) {
    const scope = effectiveScope(user);
    // trưởng phòng chỉ nhận về ĐÚNG phòng trong scope của mình (F55 — không tin client)
    if (scope.mode === 'scoped' && !scope.orgUnitIds.includes(orgUnitId)) {
      throw new ForbiddenException('Chỉ nhận tác vụ về org_unit thuộc scope của bạn');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await this.mustGetCanonicalCell(tx, cellId);
      const org = await tx.orgUnit.findFirst({ where: { id: orgUnitId, deletedAt: null } });
      if (!org) throw new NotFoundException('org_unit không tồn tại');
      // đã có phòng sở hữu → chỉ tenant-scope (B1/admin) được chuyển; tránh giành cell
      if (cell.ownerOrgUnitId && scope.mode !== 'tenant') {
        throw new ConflictException(`Tác vụ đã thuộc phòng khác — chuyển phòng cần B1/tenant admin`);
      }
      // [F136] KHÔNG stamp updatedBy — claim chỉ nhận quyền sở hữu, không đổi nội dung
      // (vết đã có ở audit task.claim; giữ updatedBy cho ngữ nghĩa "ai sửa nội dung" của F109)
      const count = await tx.taskCell.updateMany({
        where: { id: cellId, version: cell.version },
        data: { ownerOrgUnitId: orgUnitId, version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Claim thất bại — version lệch (reload)');
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'task.claim', entityType: 'task_cell', entityId: cellId,
          before: { owner_org_unit_id: cell.ownerOrgUnitId } as object,
          after: { owner_org_unit_id: orgUnitId, code: cell.code } as object,
        },
      });
      return tx.taskCell.findFirst({ where: { id: cellId } });
    });
  }

  // ===== Feedback — góp ý sử dụng thực tế =====

  listFeedback(user: RequestUser, cellId: string, status?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.mustGetCanonicalCell(tx, cellId);
      return tx.taskFeedback.findMany({
        where: { taskCellId: cellId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  createFeedback(user: RequestUser, cellId: string, input: { body: string; category?: string }) {
    if (Buffer.byteLength(input.body ?? '', 'utf8') > FEEDBACK_MAX_BYTES) {
      throw new UnprocessableEntityException(`Góp ý tối đa ${FEEDBACK_MAX_BYTES} bytes`);
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await this.mustGetCanonicalCell(tx, cellId);
      // góp ý chỉ trên tác vụ ĐANG VẬN HÀNH (active/reopened) — draft/deprecated 422
      if (cell.status !== 'active' && cell.status !== 'reopened') {
        throw new UnprocessableEntityException(
          `Chỉ góp ý tác vụ đang vận hành (hiện: ${cell.status})`,
        );
      }
      return tx.taskFeedback.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, taskCellId: cellId,
          authorId: user.claims.sub, version: cell.activeVersion,
          body: input.body, category: input.category ?? 'optimize',
        },
      });
    });
  }

  // ===== Reopen — trưởng phòng mở lại tác vụ active để tối ưu =====

  reopen(user: RequestUser, cellId: string, input: {
    assigneeId: string; feedbackIds?: string[]; note?: string;
  }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await this.mustGetCanonicalCell(tx, cellId);
      this.assertCellScope(user, cell.ownerOrgUnitId, 'mở lại');
      if (cell.status !== 'active') {
        throw new ConflictException(`Chỉ mở lại tác vụ active (hiện: ${cell.status})`);
      }
      if (!cell.ownerOrgUnitId) {
        // tenant-scope tới đây khi cell chưa có phòng — bắt claim trước để có người gác
        throw new UnprocessableEntityException('Tác vụ chưa thuộc phòng nào — claim về một phòng trước khi mở vòng tối ưu');
      }
      // người được giao sửa: active + person thuộc ĐÚNG phòng sở hữu (least-privilege)
      const assignee = await tx.appUser.findFirst({
        where: { id: input.assigneeId, status: 'active', deletedAt: null },
        include: { person: { select: { orgUnitId: true } } },
      });
      if (!assignee) throw new NotFoundException('Người được giao không tồn tại hoặc không active');
      if (assignee.person?.orgUnitId !== cell.ownerOrgUnitId) {
        throw new UnprocessableEntityException('Người được giao phải thuộc phòng sở hữu tác vụ');
      }
      // [F131c] fail-fast: assignee phải CÓ QUYỀN SOẠN (taskcell:author qua role/grant 4j) —
      // giao nhầm người không quyền → phiếu kẹt draft + cell kẹt reopened vĩnh viễn
      const assigneeRoles = await tx.userRole.findMany({
        where: { appUserId: input.assigneeId, deletedAt: null, role: { deletedAt: null } },
        select: { roleId: true },
      });
      const assigneePerms = assigneeRoles.length > 0
        ? await tx.rolePermission.findMany({
            where: { roleId: { in: assigneeRoles.map((r) => r.roleId) } },
            select: { permission: { select: { code: true } } },
          })
        : [];
      if (!assigneePerms.some((p) => p.permission.code === 'taskcell:author')) {
        throw new UnprocessableEntityException(
          'Người được giao chưa có quyền soạn tác vụ — trưởng phòng cấp qua POST /authoring/grants trước',
        );
      }

      // spawn contribution: payload = snapshot bản active, TÁC GIẢ = người được giao
      // (họ sửa qua PATCH /library/contributions/:id rồi submit — cần grant 4j)
      const payload = this.snapshotOf(cell);
      const gate = evaluateQualityGate(payload, 'task_cell');
      const contribution = await tx.libraryContribution.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, authorId: input.assigneeId,
          orgUnitId: cell.ownerOrgUnitId, type: 'task_cell',
          taskCellId: cell.id, payload: payload as object,
          kpiRef: resolveKpiRef(payload), status: 'draft',
          qualityScore: gate.score, qualityReport: gate as unknown as object,
        },
      });

      const count = await tx.taskCell.updateMany({
        where: { id: cellId, version: cell.version, status: 'active' },
        data: { status: 'reopened', updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Reopen thất bại — version lệch (reload)');

      // gắn các góp ý được chọn vào vòng sửa này (chỉ feedback CỦA CELL, đang mở)
      let feedbackLinked = 0;
      if (input.feedbackIds?.length) {
        const linked = await tx.taskFeedback.updateMany({
          where: {
            id: { in: input.feedbackIds }, taskCellId: cellId,
            status: { in: ['open', 'triaged'] },
          },
          data: { status: 'reopened', reopenedContributionId: contribution.id, triagedBy: user.claims.sub },
        });
        feedbackLinked = linked.count;
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'task.reopen', entityType: 'task_cell', entityId: cellId,
          after: {
            code: cell.code, contribution_id: contribution.id,
            assignee_id: input.assigneeId, feedback_linked: feedbackLinked,
            note: input.note ?? null,
          } as object,
        },
      });
      return { cell: await tx.taskCell.findFirst({ where: { id: cellId } }), contribution };
    });
  }

  // ===== Reopen-cancel — huỷ vòng tối ưu, trả cell về active (F131b) =====

  reopenCancel(user: RequestUser, cellId: string, note?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await this.mustGetCanonicalCell(tx, cellId);
      this.assertCellScope(user, cell.ownerOrgUnitId, 'huỷ vòng tối ưu');
      if (cell.status !== 'reopened') {
        throw new ConflictException(`Cell không ở trạng thái reopened (hiện: ${cell.status})`);
      }
      // đóng các phiếu vòng tối ưu còn mở của cell (draft/needs_changes/submitted/in_review)
      const open = await tx.libraryContribution.findMany({
        where: {
          taskCellId: cellId, deletedAt: null,
          status: { in: ['draft', 'needs_changes', 'submitted', 'in_review'] },
        },
        select: { id: true },
      });
      await tx.libraryContribution.updateMany({
        where: { id: { in: open.map((x) => x.id) } },
        data: { status: 'rejected', curatorId: user.claims.sub, decidedAt: new Date(), version: { increment: 1 } },
      });
      // cell về active (nội dung/activeVersion GIỮ NGUYÊN — chưa có gì được duyệt)
      const count = await tx.taskCell.updateMany({
        where: { id: cellId, version: cell.version, status: 'reopened' },
        data: { status: 'active', updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Huỷ thất bại — version lệch (reload)');
      await tx.taskFeedback.updateMany({
        where: { taskCellId: cellId, status: 'reopened' },
        data: { status: 'triaged' }, // góp ý quay về hàng chờ — không mất
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'task.reopen_cancel', entityType: 'task_cell', entityId: cellId,
          after: { code: cell.code, cancelled_contributions: open.length, note: note ?? null } as object,
        },
      });
      return tx.taskCell.findFirst({ where: { id: cellId } });
    });
  }

  // ===== Approve-active — trưởng phòng duyệt → ACTIVE v+1 + revision =====

  async approveActive(user: RequestUser, contributionId: string, note?: string, ip?: string) {
    try {
      return await this.doApproveActive(user, contributionId, note);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'library_contribution', entityId: contributionId,
              after: { rule: e.rule, severity: e.severity, attempted: 'approve-active' } as object, ip,
            },
          }),
        );
        throw new ConflictException(`SoD: ${e.rule}`);
      }
      throw e;
    }
  }

  private doApproveActive(user: RequestUser, contributionId: string, note?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.libraryContribution.findFirst({
        where: { id: contributionId, deletedAt: null }, include: { dedupCandidates: true },
      });
      if (!c) throw new NotFoundException('Contribution không tồn tại');
      if (!c.taskCellId) {
        throw new UnprocessableEntityException(
          'approve-active chỉ dùng cho phiếu sửa tác vụ có sẵn (taskCellId) — tác vụ MỚI đi đường curation/publish (4f)',
        );
      }
      if (!['submitted', 'in_review'].includes(c.status)) {
        throw new ConflictException(`Chỉ duyệt phiếu submitted/in_review (hiện: ${c.status})`);
      }

      // SoD bất biến: người sửa không tự duyệt (chặn cả admin giữ mọi quyền)
      if (c.authorId === user.claims.sub) {
        throw new SodViolationError('high', 'người sửa không tự duyệt bản của mình');
      }
      // sod_rule runtime: taskcell:author ⟂ taskcell:approve (check trong tx — F48)
      const sod = await tx.sodRule.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { permissionA: 'taskcell:author', permissionB: 'taskcell:approve' },
            { permissionA: 'taskcell:approve', permissionB: 'taskcell:author' },
          ],
        },
      });
      if (sod && user.permissions.has('taskcell:author') && user.permissions.has('taskcell:approve')) {
        throw new SodViolationError(sod.severity, 'taskcell:author ⟂ taskcell:approve');
      }

      const cell = await tx.taskCell.findFirst({
        where: { id: c.taskCellId, configVersionId: null, deletedAt: null },
      });
      if (!cell) throw new UnprocessableEntityException('Task cell của phiếu không còn tồn tại (canonical)');
      this.assertCellScope(user, cell.ownerOrgUnitId, 'duyệt active');
      if (cell.status !== 'reopened' && cell.status !== 'active') {
        throw new ConflictException(`Cell không ở trạng thái duyệt được (hiện: ${cell.status})`);
      }

      const payload = c.payload as CellPayload;
      // quality gate đủ 7 nhóm — fail-closed, explainable
      const gate = evaluateQualityGate(payload, 'task_cell');
      if (!gate.ok) {
        const fails = gate.checks.filter((x) => !x.passed).map((x) => x.label);
        throw new UnprocessableEntityException(`Quality gate FAIL: ${fails.join(' · ')}`);
      }
      // dedup: bỏ qua candidate trỏ CHÍNH cell này (sửa bản thân — trùng là tất nhiên);
      // pending trỏ cell KHÁC thì phải resolve trước (tránh vô tình nhân bản nội dung)
      const pendingOther = c.dedupCandidates.filter(
        (d) => d.resolution === 'pending' && d.similarTaskCellId && d.similarTaskCellId !== c.taskCellId,
      );
      if (pendingOther.length > 0) {
        throw new UnprocessableEntityException(`Còn ${pendingOther.length} dedup candidate (cell khác) chưa resolve`);
      }
      // đổi MÃ tác vụ trong vòng tối ưu là đổi định danh — không cho (giữ lineage revisions)
      if (payload.code && payload.code.trim() !== cell.code) {
        throw new UnprocessableEntityException(
          `Không đổi mã tác vụ trong vòng tối ưu ('${payload.code}' ≠ '${cell.code}') — mã là định danh lịch sử`,
        );
      }
      // [Q1 CHẶN CỨNG — active-transition] KPI phải THẬT tại thời điểm kích hoạt
      const kpiRef = resolveKpiRef(payload);
      await assertKpiRefExists(tx, kpiRef);

      // flip ACTIVE v+1 — conditional update chống race (F28)
      const newActiveVersion = cell.activeVersion + 1;
      const count = await tx.taskCell.updateMany({
        where: { id: cell.id, version: cell.version, status: { in: ['reopened', 'active'] } },
        data: {
          groupCode: payload.groupCode, clusterCode: payload.clusterCode,
          nameVi: payload.nameVi!, nameEn: payload.nameEn,
          responsibleRole: payload.responsibleRole, accountableRole: payload.accountableRole,
          consulted: (payload.consulted ?? undefined) as object,
          informed: (payload.informed ?? undefined) as object,
          inputs: (payload.inputs ?? undefined) as object,
          outputs: (payload.outputs ?? undefined) as object,
          measures: (payload.measures ?? undefined) as object,
          aiLevel: payload.aiLevel, aiDimension: (payload.aiDimension ?? undefined) as object,
          governance: (payload.governance ?? undefined) as object,
          riskLevel: payload.riskLevel, lifecycle: (payload.lifecycle ?? undefined) as object,
          kpiRef,
          status: 'active', activeVersion: newActiveVersion,
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (count.count !== 1) throw new ConflictException('Kích hoạt thất bại — version lệch (reload)');

      // lịch sử bất biến: revision v+1 (unique (cell,version) đỡ race 2 approve song song)
      await tx.taskRevision.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, taskCellId: cell.id,
          version: newActiveVersion, snapshot: { ...payload, kpiRef } as object,
          contributionId: c.id,
          changeSummary: note ?? `Vòng tối ưu v${newActiveVersion} — duyệt bởi trưởng phòng`,
          activatedBy: user.claims.sub,
        },
      });

      // phiếu → published; góp ý gắn vòng này → resolved (khép vòng lặp)
      const cCount = await tx.libraryContribution.updateMany({
        where: { id: c.id, version: c.version, status: { in: ['submitted', 'in_review'] } },
        data: { status: 'published', curatorId: user.claims.sub, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (cCount.count !== 1) throw new ConflictException('Phiếu đã bị xử lý song song (reload)');
      await tx.taskFeedback.updateMany({
        where: { reopenedContributionId: c.id, status: 'reopened' },
        data: { status: 'resolved' },
      });
      await tx.libraryReview.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, contributionId: c.id,
          reviewerId: user.claims.sub, action: 'approve',
          note: note ?? `activate v${newActiveVersion}`,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'task.activate', entityType: 'task_cell', entityId: cell.id,
          before: { active_version: cell.activeVersion, status: cell.status } as object,
          after: {
            active_version: newActiveVersion, status: 'active',
            code: cell.code, kpi_ref: kpiRef, contribution_id: c.id,
          } as object,
        },
      });
      return {
        cell: await tx.taskCell.findFirst({ where: { id: cell.id } }),
        revisionVersion: newActiveVersion,
      };
    });
  }

  // ===== Revisions — lịch sử phiên bản (diff dựng ở FE từ snapshot) =====

  listRevisions(user: RequestUser, cellId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.mustGetCanonicalCell(tx, cellId);
      return tx.taskRevision.findMany({
        where: { taskCellId: cellId },
        select: {
          id: true, version: true, changeSummary: true,
          contributionId: true, activatedBy: true, activatedAt: true,
        },
        orderBy: { version: 'desc' },
      });
    });
  }

  getRevision(user: RequestUser, cellId: string, version: number) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rev = await tx.taskRevision.findFirst({
        where: { taskCellId: cellId, version },
      });
      if (!rev) throw new NotFoundException(`Không có revision v${version}`);
      return rev;
    });
  }
}
