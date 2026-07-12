import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { effectiveScope } from '../../common/auth/scope.util';
import {
  CellPayload, ContributionType, evaluateQualityGate, GateResult, normalizeName, resolveKpiRef,
} from './quality-gate';
import { assertKpiRefExists } from './kpi-guard';

/** Marker SoD violation trong tx — audit incident ghi ngoài tx (chuẩn F48). */
class SodViolationError extends Error {
  constructor(public severity: string) {
    super('sod_violation');
  }
}

/** [F90] Marker: config version của run as_local không còn draft — set run failed NGOÀI tx
 * (ghi trong tx rồi throw sẽ bị rollback cuốn mất). */
class LocalVersionGoneError extends Error {
  constructor(public detail: string) {
    super('local_version_gone');
  }
}

/** Cap payload đóng góp (chuẩn F64 — đo bytes). */
const PAYLOAD_MAX_BYTES = 32_768;
const IMPORT_ROW_MAX_BYTES = 16_384;
const IMPORT_ROWS_MAX = 500;

const CONTRIB_TYPES: ContributionType[] = ['task_cell', 'kpi', 'task_cell_with_kpi'];

interface ContributionInput {
  type: ContributionType;
  payload: CellPayload;
  orgUnitId?: string;
  functionId?: string;
  targetScope?: 'tenant' | 'group';
}

/**
 * BU Authoring Gate (Spec_BU_Authoring_Gate) — thư viện 3 tầng:
 * author soạn (scope org_unit) → submit (quality gate + dedup scan) → curator review
 * (SoD: KHÔNG tự duyệt bài mình) → publish canonical (task_cell configVersionId NULL
 * + kpi_template) → nguồn phát cho Auto-Derivation Engine.
 */
@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  // ===== Helpers =====

  private capPayload(payload: unknown, cap = PAYLOAD_MAX_BYTES) {
    const bytes = Buffer.byteLength(JSON.stringify(payload ?? {}), 'utf8');
    if (bytes > cap) {
      throw new UnprocessableEntityException(`Payload tối đa ${cap} bytes (hiện ${bytes})`);
    }
  }

  /** bu_author scope org_unit: orgUnitId BẮT BUỘC và phải nằm trong scope (fail-closed). */
  private assertOrgScope(user: RequestUser, orgUnitId?: string) {
    const scope = effectiveScope(user);
    if (scope.mode === 'tenant') return;
    if (!orgUnitId || !scope.orgUnitIds.includes(orgUnitId)) {
      throw new ForbiddenException('orgUnitId bắt buộc và phải thuộc scope org_unit của bạn');
    }
  }

  private gateFor(payload: CellPayload, type: ContributionType): GateResult {
    return evaluateQualityGate(payload, type);
  }

  /** Canonical cells = configVersionId NULL + libScope tenant/group (nguồn dedup + đích publish). */
  private canonicalWhere() {
    return { configVersionId: null, libScope: { in: ['tenant', 'group'] }, deletedAt: null };
  }

  // [4h · Q1 CHẶN CỨNG] helper dùng chung — xem modules/library/kpi-guard.ts
  // (tách ra lát 4k để approve-active + config publish F108 dùng cùng một cửa).

  // ===== Contributions (author) =====

  create(user: RequestUser, input: ContributionInput) {
    if (!CONTRIB_TYPES.includes(input.type)) {
      throw new UnprocessableEntityException(`type phải là ${CONTRIB_TYPES.join('|')}`);
    }
    this.capPayload(input.payload);
    this.assertOrgScope(user, input.orgUnitId);
    if (input.targetScope === 'group') {
      throw new UnprocessableEntityException('Thư viện group thuộc Phase 4–5 — lát này chỉ target_scope=tenant');
    }
    const gate = this.gateFor(input.payload, input.type);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.libraryContribution.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, authorId: user.claims.sub,
          orgUnitId: input.orgUnitId, functionId: input.functionId,
          type: input.type, payload: input.payload as object,
          kpiRef: resolveKpiRef(input.payload),
          status: 'draft', targetScope: input.targetScope ?? 'tenant',
          qualityScore: gate.score, qualityReport: gate as unknown as object,
        },
      }),
    );
  }

  update(user: RequestUser, id: string, input: { payload?: CellPayload; targetScope?: string }) {
    if (input.payload !== undefined) this.capPayload(input.payload);
    if (input.targetScope === 'group') {
      throw new UnprocessableEntityException('Thư viện group thuộc Phase 4–5');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.libraryContribution.findFirst({ where: { id, deletedAt: null } });
      if (!c) throw new NotFoundException('Contribution không tồn tại');
      if (c.authorId !== user.claims.sub) {
        throw new ForbiddenException('Chỉ tác giả sửa được contribution của mình');
      }
      if (!['draft', 'needs_changes'].includes(c.status)) {
        throw new ConflictException(`Chỉ sửa được ở draft/needs_changes (hiện: ${c.status})`);
      }
      const payload = (input.payload ?? c.payload) as CellPayload;
      const gate = this.gateFor(payload, c.type as ContributionType);
      // [F94] conditional update — race với submit song song không đè/kéo ngược trạng thái
      const count = await tx.libraryContribution.updateMany({
        where: { id, version: c.version, status: { in: ['draft', 'needs_changes'] } },
        data: {
          ...(input.payload !== undefined ? { payload: input.payload as object, kpiRef: resolveKpiRef(input.payload) } : {}),
          ...(input.targetScope !== undefined ? { targetScope: input.targetScope } : {}),
          qualityScore: gate.score, qualityReport: gate as unknown as object,
          status: 'draft', // sửa sau needs_changes → quay về draft, submit lại
          version: { increment: 1 },
        },
      });
      if (count.count !== 1) {
        throw new ConflictException('Sửa thất bại — version/trạng thái đã đổi (reload)');
      }
      return tx.libraryContribution.findFirst({ where: { id } });
    });
  }

  /** Submit → chạy lại gate + quét dedup (exact code / normalized name vs canonical). */
  submit(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.libraryContribution.findFirst({ where: { id, deletedAt: null } });
      if (!c) throw new NotFoundException('Contribution không tồn tại');
      if (c.authorId !== user.claims.sub) {
        throw new ForbiddenException('Chỉ tác giả submit được contribution của mình');
      }
      const count = await tx.libraryContribution.updateMany({
        where: { id, status: { in: ['draft', 'needs_changes'] }, version: c.version },
        data: { status: 'submitted', submittedAt: new Date(), version: { increment: 1 } },
      });
      if (count.count !== 1) {
        throw new ConflictException('Submit thất bại — trạng thái/version không hợp lệ (reload)');
      }
      const payload = c.payload as CellPayload;
      const gate = this.gateFor(payload, c.type as ContributionType);
      await tx.libraryContribution.update({
        where: { id },
        data: { qualityScore: gate.score, qualityReport: gate as unknown as object },
      });
      await this.scanDedup(tx, user, c.id, payload);
      return tx.libraryContribution.findFirst({
        where: { id }, include: { dedupCandidates: true },
      });
    });
  }

  /** Dedup scan — hệ GỢI Ý (exact code = 1.000, trùng tên chuẩn hoá = 0.900), người quyết.
   * [F112] `canonicalCache`: batch lớn (import as_submission) fetch thư viện canonical
   * MỘT lần rồi truyền vào — tránh O(rows×canonical) query tuần tự trong tx trần 20s. */
  private async scanDedup(
    tx: TenantTx, user: RequestUser, contributionId: string, payload: CellPayload,
    canonicalCache?: Array<{ id: string; code: string; nameVi: string }>,
  ) {
    if (!payload.code && !payload.nameVi) return;
    const canonical = canonicalCache ?? await tx.taskCell.findMany({
      where: this.canonicalWhere(),
      select: { id: true, code: true, nameVi: true },
    });
    const targetName = payload.nameVi ? normalizeName(payload.nameVi) : null;
    for (const cell of canonical) {
      let similarity: number | null = null;
      let reason: string | null = null;
      if (payload.code && cell.code === payload.code.trim()) {
        similarity = 1;
        reason = `Trùng mã '${cell.code}' với canonical cell`;
      } else if (targetName && normalizeName(cell.nameVi) === targetName) {
        similarity = 0.9;
        reason = `Trùng tên (chuẩn hoá) với canonical '${cell.code}'`;
      }
      if (similarity === null) continue;
      const existing = await tx.libraryDedupCandidate.findFirst({
        where: { contributionId, similarTaskCellId: cell.id },
      });
      if (existing) continue; // idempotent — submit lại không nhân đôi
      await tx.libraryDedupCandidate.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, contributionId,
          similarTaskCellId: cell.id, similarity, reason,
        },
      });
    }
  }

  /** Author xem CHỈ của mình (fail-closed) — curator dùng /library/queue. */
  listMine(user: RequestUser, status?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.libraryContribution.findMany({
        where: { authorId: user.claims.sub, deletedAt: null, ...(status ? { status } : {}) },
        include: { dedupCandidates: true, reviews: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Hàng đợi curation — thấy mọi contribution ĐÃ VÀO vòng đời chung. [F95] draft là
   * "local — chỉ BU đó thấy" (spec §3): curator không soi được nháp chưa submit. */
  listQueue(user: RequestUser, status?: string) {
    if (status === 'draft') {
      throw new ForbiddenException('Draft là bản nháp local của tác giả — không thuộc hàng đợi curation');
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.libraryContribution.findMany({
        where: {
          deletedAt: null,
          // status='draft' đã bị chặn 403 ở trên; default = hàng đợi đang chờ xử lý
          ...(status ? { status } : { status: { in: ['submitted', 'in_review'] } }),
        },
        include: { dedupCandidates: true, reviews: { orderBy: { createdAt: 'asc' } } },
        orderBy: { submittedAt: 'asc' },
      }),
    );
  }

  // ===== Curation =====

  /**
   * Review — SoD BẤT BIẾN: curator không tự duyệt bài mình soạn (mọi action trừ comment).
   * approve yêu cầu: gate OK + không còn dedup pending (fail-closed).
   */
  async review(user: RequestUser, id: string, action: string, note?: string, ip?: string) {
    if (!['comment', 'request_changes', 'approve', 'reject'].includes(action)) {
      throw new UnprocessableEntityException('action phải là comment|request_changes|approve|reject');
    }
    try {
      return await this.doReview(user, id, action, note);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'library_contribution', entityId: id,
              after: { rule: 'không tự duyệt bài mình soạn', attempted: action } as object, ip,
            },
          }),
        );
        throw new ConflictException('SoD: không được tự duyệt/từ chối contribution của chính mình');
      }
      throw e;
    }
  }

  private doReview(user: RequestUser, id: string, action: string, note?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.libraryContribution.findFirst({
        where: { id, deletedAt: null }, include: { dedupCandidates: true },
      });
      if (!c) throw new NotFoundException('Contribution không tồn tại');
      // [F93] approved KHÔNG được là ngõ cụt: publish fail (clash/merge-target chết) →
      // curator còn đường request_changes/reject để trả về vòng sửa
      const allowedFrom = action === 'approve' || action === 'comment'
        ? ['submitted', 'in_review']
        : ['submitted', 'in_review', 'approved'];
      if (!allowedFrom.includes(c.status)) {
        throw new ConflictException(`Action '${action}' không hợp lệ ở trạng thái ${c.status}`);
      }
      if (action !== 'comment' && c.authorId === user.claims.sub) {
        throw new SodViolationError('high');
      }

      // [F132a·4k] phiếu VÒNG TỐI ƯU (taskCellId ≠ null, spawn từ reopen) KHÔNG đi đường
      // curation approve/publish — phải qua approve-active (có Q1 + revision + scope phòng)
      if (action === 'approve' && c.taskCellId) {
        throw new UnprocessableEntityException(
          'Phiếu vòng tối ưu (gắn task cell) — duyệt bằng POST /library/contributions/:id/approve-active',
        );
      }

      if (action === 'approve') {
        const payload = c.payload as CellPayload;
        const gate = this.gateFor(payload, c.type as ContributionType);
        if (!gate.ok) {
          const fails = gate.checks.filter((x) => !x.passed).map((x) => x.label);
          throw new UnprocessableEntityException(`Quality gate FAIL: ${fails.join(' · ')}`);
        }
        const pending = c.dedupCandidates.filter((d) => d.resolution === 'pending');
        if (pending.length > 0) {
          throw new UnprocessableEntityException(`Còn ${pending.length} dedup candidate chưa resolve`);
        }
        // [F93] chặn sớm clash mã canonical NGAY TẠI approve (trừ khi sẽ merge) —
        // không để approved rồi mới phát hiện ở publish
        const willMerge = c.dedupCandidates.some((d) => d.resolution === 'merge' && d.similarTaskCellId);
        const needsCell = c.type === 'task_cell' || c.type === 'task_cell_with_kpi';
        if (needsCell && !willMerge && payload.code) {
          const clash = await tx.taskCell.findFirst({
            where: { ...this.canonicalWhere(), code: payload.code.trim() },
          });
          if (clash) {
            throw new UnprocessableEntityException(
              `Mã '${payload.code}' đã có trong canonical — resolve dedup merge, hoặc request_changes để đổi mã`,
            );
          }
        }
      }

      const isAuthorComment = action === 'comment' && c.authorId === user.claims.sub;
      const nextStatus =
        action === 'approve' ? 'approved'
        : action === 'request_changes' ? 'needs_changes'
        : action === 'reject' ? 'rejected'
        // [F96] comment của CHÍNH tác giả không kích transition
        : c.status === 'submitted' && !isAuthorComment ? 'in_review' : c.status;

      const count = await tx.libraryContribution.updateMany({
        where: { id, version: c.version, status: { in: allowedFrom } },
        data: {
          status: nextStatus,
          // [F96] comment không stamp curator — chỉ quyết định thật mới ghi người gác cổng
          ...(action !== 'comment' ? { curatorId: user.claims.sub } : {}),
          ...(action === 'approve' || action === 'reject' ? { decidedAt: new Date() } : {}),
          version: { increment: 1 },
        },
      });
      if (count.count !== 1) throw new ConflictException('Review thất bại — version lệch (reload)');

      // [F131a·4k] reject phiếu vòng tối ưu KHÔNG được bỏ cell kẹt 'reopened' vĩnh viễn:
      // trả cell về active (nội dung/activeVersion GIỮ NGUYÊN) + feedback về triaged
      if (action === 'reject' && c.taskCellId) {
        await tx.taskCell.updateMany({
          where: { id: c.taskCellId, status: 'reopened' },
          data: { status: 'active', updatedBy: user.claims.sub, version: { increment: 1 } },
        });
        await tx.taskFeedback.updateMany({
          where: { reopenedContributionId: c.id, status: 'reopened' },
          data: { status: 'triaged' },
        });
      }

      await tx.libraryReview.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, contributionId: id,
          reviewerId: user.claims.sub, action, note,
        },
      });
      return tx.libraryContribution.findFirst({ where: { id }, include: { reviews: true } });
    });
  }

  /**
   * Publish canonical — SoD 2 lớp: (bất biến) không publish bài mình soạn;
   * (runtime rule) taskcell:author ⟂ library:publish khi tenant bật sod_rule.
   * Materialize: task_cell configVersionId NULL + lib_scope tenant (+ kpi_template nếu kèm).
   * Dedup resolution: merge → bổ sung vào cell canonical sẵn có; keep_both → cell mới trỏ canonical_id.
   */
  async publish(user: RequestUser, id: string, ip?: string) {
    try {
      return await this.doPublish(user, id);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'library_contribution', entityId: id,
              after: { rule: 'taskcell:author ⟂ library:publish', severity: e.severity } as object, ip,
            },
          }),
        );
        throw new ConflictException('SoD: người soạn không được publish (tách vai Author/Curator)');
      }
      throw e;
    }
  }

  private doPublish(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.libraryContribution.findFirst({
        where: { id, deletedAt: null }, include: { dedupCandidates: true },
      });
      if (!c) throw new NotFoundException('Contribution không tồn tại');
      if (c.status !== 'approved') {
        throw new ConflictException(`Chỉ publish được contribution approved (hiện: ${c.status})`);
      }
      // [F132a·4k] phiếu vòng tối ưu không đi đường publish (defense-in-depth với review)
      if (c.taskCellId) {
        throw new UnprocessableEntityException(
          'Phiếu vòng tối ưu (gắn task cell) — duyệt bằng POST /library/contributions/:id/approve-active',
        );
      }
      // SoD bất biến — kể cả tenant tắt sod_rule
      if (c.authorId === user.claims.sub) throw new SodViolationError('high');
      // SoD runtime rule (chuẩn F48 — check trong tx)
      const sod = await tx.sodRule.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { permissionA: 'taskcell:author', permissionB: 'library:publish' },
            { permissionA: 'library:publish', permissionB: 'taskcell:author' },
          ],
        },
      });
      if (sod && user.permissions.has('taskcell:author') && user.permissions.has('library:publish')) {
        throw new SodViolationError(sod.severity);
      }

      const payload = c.payload as CellPayload;
      // defense-in-depth: re-check gate + dedup tại thời điểm publish
      const gate = this.gateFor(payload, c.type as ContributionType);
      if (!gate.ok) throw new UnprocessableEntityException('Quality gate FAIL tại publish — payload đã đổi?');
      const pending = c.dedupCandidates.filter((d) => d.resolution === 'pending');
      if (pending.length > 0) {
        throw new UnprocessableEntityException(`Còn ${pending.length} dedup candidate chưa resolve`);
      }

      const needsCell = c.type === 'task_cell' || c.type === 'task_cell_with_kpi';
      const needsKpi = c.type === 'kpi' || c.type === 'task_cell_with_kpi';
      let cellId: string | null = null;
      let cellCode = payload.code?.trim() ?? null;
      // [F130/F132c·4k] revision version cần ghi sau khi cell chốt nội dung:
      // cell MỚI → v1 · merge vào cell ĐANG ACTIVE → v+1 (đổi nội dung active phải có vết)
      let revisionVersion: number | null = null;

      if (needsCell) {
        const merge = c.dedupCandidates.find((d) => d.resolution === 'merge' && d.similarTaskCellId);
        const keepBoth = c.dedupCandidates.find((d) => d.resolution === 'keep_both' && d.similarTaskCellId);

        if (merge) {
          // merge: bổ sung thuộc tính THIẾU vào canonical — không đè giá trị đã có
          const target = await tx.taskCell.findFirst({
            where: { id: merge.similarTaskCellId!, deletedAt: null },
          });
          if (!target) throw new UnprocessableEntityException('Canonical cell để merge không còn tồn tại');
          // [F132c·4k] merge làm ĐỔI nội dung cell đang active → phải bump activeVersion
          // + ghi revision (nếu target chưa active thì merge tự do như cũ)
          const mergeIntoActive = target.status === 'active';
          await tx.taskCell.update({
            where: { id: target.id },
            data: {
              nameEn: target.nameEn ?? payload.nameEn,
              responsibleRole: target.responsibleRole ?? payload.responsibleRole,
              accountableRole: target.accountableRole ?? payload.accountableRole,
              consulted: (target.consulted ?? payload.consulted ?? undefined) as object,
              informed: (target.informed ?? payload.informed ?? undefined) as object,
              inputs: (target.inputs ?? payload.inputs ?? undefined) as object,
              outputs: (target.outputs ?? payload.outputs ?? undefined) as object,
              measures: (target.measures ?? payload.measures ?? undefined) as object,
              aiLevel: target.aiLevel ?? payload.aiLevel,
              governance: (target.governance ?? payload.governance ?? undefined) as object,
              riskLevel: target.riskLevel ?? payload.riskLevel,
              kpiRef: target.kpiRef ?? resolveKpiRef(payload),
              ...(mergeIntoActive ? { activeVersion: target.activeVersion + 1 } : {}),
              updatedBy: user.claims.sub, version: { increment: 1 },
            },
          });
          cellId = target.id;
          cellCode = target.code;
          if (mergeIntoActive) revisionVersion = target.activeVersion + 1;
        } else {
          // cell mới — mã không được đụng canonical (partial unique đỡ tầng DB)
          if (!cellCode) throw new UnprocessableEntityException('payload.code bắt buộc');
          const clash = await tx.taskCell.findFirst({
            where: { ...this.canonicalWhere(), code: cellCode },
          });
          if (clash) {
            throw new ConflictException(`Mã '${cellCode}' đã có trong thư viện canonical — resolve dedup (merge/keep_both) trước`);
          }
          // [F134·4k] mã đã DEPRECATE không được hồi sinh âm thầm bằng cell mới cùng mã
          // (mất lineage revisions) — quyết định hồi sinh phải tường minh (đổi mã/B1 xử lý)
          const deprecated = await tx.taskCell.findFirst({
            where: { tenantId: user.tenantId, code: cellCode, configVersionId: null, deletedAt: { not: null } },
          });
          if (deprecated) {
            throw new UnprocessableEntityException(
              `Mã '${cellCode}' đã deprecate — không tái sử dụng mã (giữ lineage lịch sử); dùng mã mới`,
            );
          }
          const created = await tx.taskCell.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, configVersionId: null,
              code: cellCode, groupCode: payload.groupCode, clusterCode: payload.clusterCode,
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
              kpiRef: resolveKpiRef(payload),
              origin: 'bu_authored', libScope: c.targetScope,
              contributedBy: c.authorId,
              canonicalId: keepBoth?.similarTaskCellId ?? null,
              createdBy: user.claims.sub,
              // [F130·4k] publish canonical = active-transition: cell VÀO VẬN HÀNH ngay
              // (Q1 assert bên dưới) — nếu không, vòng lặp tối ưu chết cho mọi cell mới
              status: 'active', activeVersion: 1,
            },
          });
          cellId = created.id;
          revisionVersion = 1;
        }
      }

      if (needsKpi && payload.kpi) {
        const kpiCode = payload.kpi.code?.trim() || (cellCode ? `KPI-${cellCode}` : null);
        if (!kpiCode) throw new UnprocessableEntityException('KPI cần code (hoặc cell code để sinh mã)');
        const existing = await tx.kpiTemplate.findFirst({
          where: { tenantId: user.tenantId, code: kpiCode, deletedAt: null },
        });
        if (existing) {
          // nhiều cell trỏ cùng 1 KPI là hợp lệ — chỉ bổ sung lineage taskCellRefs
          if (cellCode && !existing.taskCellRefs.includes(cellCode)) {
            await tx.kpiTemplate.update({
              where: { id: existing.id },
              data: { taskCellRefs: { push: cellCode }, updatedBy: user.claims.sub },
            });
          }
        } else {
          await tx.kpiTemplate.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, code: kpiCode,
              nameVi: payload.kpi.nameVi ?? kpiCode,
              method: payload.kpi.method ?? 'manual',
              direction: payload.kpi.direction ?? 'forward',
              unit: payload.kpi.unit, frequency: payload.kpi.frequency ?? 'quarterly',
              formulaExpr: payload.kpi.formulaExpr,
              taskCellRefs: cellCode ? [cellCode] : [],
              functionTags: [], roleFamilyCodes: [],
              origin: 'bu_authored', libScope: 'tenant', contributedBy: c.authorId,
              createdBy: user.claims.sub,
            },
          });
        }
        if (cellId) {
          await tx.taskCell.update({ where: { id: cellId }, data: { kpiRef: kpiCode } });
        }
      }

      // [4h · Q1 CHẶN CỨNG] cell canonical vừa tạo/merge PHẢI kết thúc với kpiRef trỏ KPI thật
      if (cellId) {
        const finalCell = await tx.taskCell.findFirst({ where: { id: cellId }, select: { kpiRef: true } });
        await assertKpiRefExists(tx, finalCell?.kpiRef ?? undefined);

        // [F130/F132c·4k] active-transition có vết: revision v1 (cell mới) / v+1 (merge active)
        if (revisionVersion !== null) {
          await tx.taskRevision.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, taskCellId: cellId,
              version: revisionVersion,
              snapshot: { ...payload, kpiRef: finalCell?.kpiRef ?? null } as object,
              contributionId: c.id,
              changeSummary: revisionVersion === 1
                ? 'Publish canonical — kích hoạt v1 (BU Authoring Gate)'
                : 'Merge bổ sung thuộc tính vào cell đang active (curation)',
              activatedBy: user.claims.sub,
            },
          });
        }
      }

      const count = await tx.libraryContribution.updateMany({
        where: { id, version: c.version, status: 'approved' },
        data: { status: 'published', curatorId: user.claims.sub, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (count.count !== 1) throw new ConflictException('Publish thất bại — version lệch (reload)');

      await tx.libraryReview.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, contributionId: id,
          reviewerId: user.claims.sub, action: 'publish',
          note: cellCode ? `canonical: ${cellCode}` : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'library.publish', entityType: 'library_contribution', entityId: id,
          after: { cell_code: cellCode, kpi_ref: payload.kpi?.code ?? null, lib_scope: c.targetScope } as object,
        },
      });
      return tx.libraryContribution.findFirst({ where: { id }, include: { reviews: true } });
    });
  }

  listDedup(user: RequestUser, contributionId: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.libraryDedupCandidate.findMany({
        where: { contributionId },
        orderBy: { similarity: 'desc' },
      }),
    );
  }

  resolveDedup(user: RequestUser, candidateId: string, resolution: string) {
    if (!['merge', 'keep_both', 'discard'].includes(resolution)) {
      throw new UnprocessableEntityException('resolution phải là merge|keep_both|discard');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // [F93] cho re-resolve (không chỉ từ pending) — merge-target bị deprecate giữa
      // chừng cần đổi hướng được; mọi lần resolve đều @Audited ở controller
      const count = await tx.libraryDedupCandidate.updateMany({
        where: { id: candidateId },
        data: { resolution, resolvedBy: user.claims.sub },
      });
      if (count.count !== 1) {
        throw new ConflictException('Candidate không tồn tại');
      }
      return tx.libraryDedupCandidate.findFirst({ where: { id: candidateId } });
    });
  }

  /** Deprecate canonical cell — soft-delete + status 'deprecated' (giữ vết), derivation ngừng emit. */
  deprecate(user: RequestUser, taskCellId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await tx.taskCell.findFirst({
        where: { id: taskCellId, ...this.canonicalWhere() },
      });
      if (!cell) throw new NotFoundException('Canonical task cell không tồn tại');
      // [F134·4k] cell đang GIỮA vòng tối ưu → đóng vòng trước (reject/cancel) rồi mới nghỉ hưu,
      // không bỏ rơi phiếu sửa + feedback đang gắn vòng
      if (cell.status === 'reopened') {
        throw new ConflictException('Cell đang giữa vòng tối ưu (reopened) — đóng vòng (reject/cancel) trước khi deprecate');
      }
      await tx.taskCell.update({
        where: { id: taskCellId },
        // [F134·4k] status='deprecated' tường minh — phân biệt "nghỉ hưu" với dữ liệu xoá khác
        data: { deletedAt: new Date(), status: 'deprecated', updatedBy: user.claims.sub },
      });
      return { deprecated: cell.code };
    });
  }

  // ===== Import từ template chuẩn hoá (§6.5) =====

  listTemplates(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.libraryTemplate.findMany({
        where: { deletedAt: null, status: 'published' },
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
      }),
    );
  }

  createTemplate(user: RequestUser, input: {
    code: string; nameVi: string; nameEn?: string; domain?: string; schema?: object;
  }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const last = await tx.libraryTemplate.findFirst({
        where: { code: input.code, tenantId: user.tenantId },
        orderBy: { version: 'desc' },
      });
      return tx.libraryTemplate.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, code: input.code,
          nameVi: input.nameVi, nameEn: input.nameEn, domain: input.domain,
          schema: (input.schema ?? {}) as object,
          version: (last?.version ?? 0) + 1,
          createdBy: user.claims.sub,
        },
      });
    });
  }

  /**
   * Import PREVIEW — validate từng row qua quality gate (lỗi vào invalid[], không chặn batch),
   * dedup theo mã canonical (upsert = update, không nhân bản). KHÔNG ghi thư viện.
   * as_canonical đòi thêm library:import:canonical (min-permission trong CODE — chuẩn F55).
   */
  /** [F91] as_canonical = publish trực tiếp — áp CÙNG sod_rule như publish (chuẩn F48). */
  private async assertImportCanonicalSod(tx: TenantTx, user: RequestUser) {
    const sod = await tx.sodRule.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { permissionA: 'taskcell:author', permissionB: 'library:publish' },
          { permissionA: 'library:publish', permissionB: 'taskcell:author' },
        ],
      },
    });
    if (sod && user.permissions.has('taskcell:author')) {
      throw new SodViolationError(sod.severity);
    }
  }

  async importPreview(user: RequestUser, input: {
    templateId?: string; mode: string; configVersionId?: string;
    orgUnitId?: string; rows: CellPayload[]; sourceRef?: string;
  }) {
    if (!['as_local', 'as_submission', 'as_canonical'].includes(input.mode)) {
      throw new UnprocessableEntityException('mode phải là as_local|as_submission|as_canonical');
    }
    if (input.mode === 'as_canonical' && !user.permissions.has('library:import:canonical')) {
      throw new ForbiddenException('as_canonical cần permission library:import:canonical');
    }
    // [F92b] người import scope org_unit phải khai orgUnitId thuộc scope (như create contribution)
    this.assertOrgScope(user, input.orgUnitId);
    if (!input.rows?.length || input.rows.length > IMPORT_ROWS_MAX) {
      throw new UnprocessableEntityException(`rows: 1–${IMPORT_ROWS_MAX} phần tử`);
    }
    for (const r of input.rows) this.capPayload(r, IMPORT_ROW_MAX_BYTES);

    try {
      return await this.doImportPreview(user, input);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'library_import_run', entityId: null,
              after: { rule: 'taskcell:author ⟂ library:publish (as_canonical)', severity: e.severity } as object,
            },
          }),
        );
        throw new ConflictException('SoD: người giữ taskcell:author không được import as_canonical (đi vòng curation)');
      }
      throw e;
    }
  }

  private doImportPreview(user: RequestUser, input: {
    templateId?: string; mode: string; configVersionId?: string;
    orgUnitId?: string; rows: CellPayload[]; sourceRef?: string;
  }) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      if (input.mode === 'as_canonical') await this.assertImportCanonicalSod(tx, user);
      if (input.mode === 'as_local') {
        if (!input.configVersionId) {
          throw new UnprocessableEntityException('as_local cần configVersionId (draft)');
        }
        const cv = await tx.configVersion.findFirst({
          where: { id: input.configVersionId, deletedAt: null },
        });
        if (!cv || (cv.status !== 'draft' && cv.status !== 'preview')) {
          throw new UnprocessableEntityException('configVersionId phải là version draft/preview');
        }
      }
      if (input.templateId) {
        const tpl = await tx.libraryTemplate.findFirst({
          where: { id: input.templateId, deletedAt: null },
        });
        if (!tpl) throw new UnprocessableEntityException('templateId không tồn tại');
      }

      const existingWhere = input.mode === 'as_local'
        ? { configVersionId: input.configVersionId, deletedAt: null }
        : this.canonicalWhere();
      const existing = await tx.taskCell.findMany({
        where: existingWhere, select: { code: true },
      });
      const existingCodes = new Set(existing.map((x) => x.code));

      const add: string[] = [];
      const update: string[] = [];
      const invalid: Array<{ code: string | null; failures: string[] }> = [];
      const seen = new Set<string>();
      const validRows: CellPayload[] = [];

      for (const row of input.rows) {
        const type: ContributionType = row.kpi ? 'task_cell_with_kpi' : 'task_cell';
        const gate = this.gateFor(row, type);
        const code = row.code?.trim() ?? null;
        if (!gate.ok || !code) {
          invalid.push({
            code, failures: gate.checks.filter((x) => !x.passed).map((x) => x.label),
          });
          continue;
        }
        if (seen.has(code)) {
          invalid.push({ code, failures: ['Mã trùng lặp NGAY TRONG batch'] });
          continue;
        }
        seen.add(code);
        validRows.push(row);
        (existingCodes.has(code) ? update : add).push(code);
      }

      const run = await tx.libraryImportRun.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          templateId: input.templateId, sourceRef: input.sourceRef,
          mode: input.mode, configVersionId: input.configVersionId,
          orgUnitId: input.orgUnitId,
          rows: validRows as unknown as object,
          status: 'preview',
          diff: { add, update, invalid } as unknown as object,
          stats: {
            parsed: input.rows.length, valid: validRows.length,
            invalid: invalid.length, duplicated: update.length,
          } as object,
          importedBy: user.claims.sub,
        },
      });
      return run;
    });
  }

  getImportRun(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.libraryImportRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException('Import run không tồn tại');
      return run;
    });
  }

  /** APPLY — idempotent (upsert theo mã), conditional preview→applied (chuẩn F28). */
  async applyImport(user: RequestUser, id: string) {
    try {
      return await this.doApplyImport(user, id);
    } catch (e) {
      if (e instanceof LocalVersionGoneError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.libraryImportRun.updateMany({
            where: { id, status: 'preview' },
            data: { status: 'failed', error: { reason: `config version ${e.detail} — không ghi được` } as object },
          }),
        );
        throw new UnprocessableEntityException('Config version không còn ở draft/preview — tạo preview mới trên draft khác');
      }
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'library_import_run', entityId: id,
              after: { rule: 'taskcell:author ⟂ library:publish (as_canonical)', severity: e.severity } as object,
            },
          }),
        );
        throw new ConflictException('SoD: người giữ taskcell:author không được import as_canonical (đi vòng curation)');
      }
      throw e;
    }
  }

  private doApplyImport(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.libraryImportRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException('Import run không tồn tại');
      if (run.mode === 'as_canonical' && !user.permissions.has('library:import:canonical')) {
        throw new ForbiddenException('as_canonical cần permission library:import:canonical');
      }
      // [F91] SoD re-check tại apply (permissions của user apply, không phải user preview)
      if (run.mode === 'as_canonical') await this.assertImportCanonicalSod(tx, user);
      // [F90] TOCTOU: version có thể đã publish giữa preview và apply — published là BẤT BIẾN
      if (run.mode === 'as_local') {
        const cv = await tx.configVersion.findFirst({
          where: { id: run.configVersionId!, deletedAt: null },
        });
        if (!cv || (cv.status !== 'draft' && cv.status !== 'preview')) {
          // set failed NGOÀI tx (marker) — ghi ở đây rồi throw sẽ bị rollback cuốn mất
          throw new LocalVersionGoneError(cv?.status ?? 'không tồn tại');
        }
      }
      const claimed = await tx.libraryImportRun.updateMany({
        where: { id, status: 'preview' },
        data: { status: 'applied', version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(`Run đã ${run.status} — mỗi preview chỉ apply 1 lần (tạo preview mới nếu cần)`);
      }

      const rows = run.rows as unknown as CellPayload[];
      let imported = 0;
      let updated = 0;
      let unchanged = 0; // [F132a·4k] row y hệt cell hiện hữu → không ghi (không nhiễu revision)
      let contributions = 0;

      // [F112] fetch thư viện canonical MỘT lần cho cả batch dedup scan
      const canonicalCache = run.mode === 'as_submission'
        ? await tx.taskCell.findMany({
            where: this.canonicalWhere(), select: { id: true, code: true, nameVi: true },
          })
        : undefined;

      for (const row of rows) {
        const code = row.code!.trim();
        if (run.mode === 'as_submission') {
          const created = await tx.libraryContribution.create({
            data: {
              id: uuidv7(), tenantId: user.tenantId, authorId: user.claims.sub,
              orgUnitId: run.orgUnitId, // [F92b] mang scope của người import
              type: row.kpi ? 'task_cell_with_kpi' : 'task_cell',
              payload: row as object, kpiRef: resolveKpiRef(row),
              status: 'submitted', submittedAt: new Date(),
              qualityScore: this.gateFor(row, row.kpi ? 'task_cell_with_kpi' : 'task_cell').score,
            },
          });
          // [F92a] cùng pipeline dedup như submit tay — curator không nhận "0 pending" giả
          await this.scanDedup(tx, user, created.id, row, canonicalCache);
          contributions += 1;
          continue;
        }

        // [4h · Q1 CHẶN CỨNG] cell canonical (as_canonical) phải gắn KPI thật.
        // as_local là bản nháp version → chưa bắt buộc (được active sau khi bổ sung KPI).
        const rowKpiRef = resolveKpiRef(row);
        if (run.mode === 'as_canonical') {
          await assertKpiRefExists(tx, rowKpiRef);
        }
        const where = run.mode === 'as_local'
          ? { tenantId: user.tenantId, code, configVersionId: run.configVersionId, deletedAt: null }
          : { tenantId: user.tenantId, code, ...this.canonicalWhere() };
        const data = {
          groupCode: row.groupCode, clusterCode: row.clusterCode,
          nameVi: row.nameVi!, nameEn: row.nameEn,
          responsibleRole: row.responsibleRole, accountableRole: row.accountableRole,
          consulted: (row.consulted ?? undefined) as object,
          informed: (row.informed ?? undefined) as object,
          inputs: (row.inputs ?? undefined) as object,
          outputs: (row.outputs ?? undefined) as object,
          measures: (row.measures ?? undefined) as object,
          aiLevel: row.aiLevel, aiDimension: (row.aiDimension ?? undefined) as object,
          governance: (row.governance ?? undefined) as object,
          riskLevel: row.riskLevel, lifecycle: (row.lifecycle ?? undefined) as object,
          kpiRef: rowKpiRef,
          updatedBy: user.claims.sub,
        };
        const existing = await tx.taskCell.findFirst({ where });
        if (existing) {
          // [F132a·4k] so nội dung: row y hệt → SKIP (import lặp không sinh revision nhiễu)
          const same = (Object.keys(data) as Array<keyof typeof data>)
            .filter((k) => k !== 'updatedBy')
            .every((k) => JSON.stringify(data[k] ?? null)
              === JSON.stringify((existing as Record<string, unknown>)[k] ?? null));
          if (same) {
            unchanged += 1;
            continue;
          }
          // nội dung ĐỔI trên cell canonical đang ACTIVE = active-transition mới
          // → bump activeVersion + ghi revision (lịch sử bất biến không bị trôi)
          const intoActive = run.mode === 'as_canonical' && existing.status === 'active';
          await tx.taskCell.update({
            where: { id: existing.id },
            data: {
              ...data,
              ...(intoActive ? { activeVersion: existing.activeVersion + 1 } : {}),
              version: { increment: 1 },
            },
          });
          if (intoActive) {
            await tx.taskRevision.create({
              data: {
                id: uuidv7(), tenantId: user.tenantId, taskCellId: existing.id,
                version: existing.activeVersion + 1,
                snapshot: { ...row, kpiRef: rowKpiRef ?? null } as object,
                changeSummary: `Import as_canonical re-baseline (run ${run.id})`,
                activatedBy: user.claims.sub,
              },
            });
          }
          updated += 1;
        } else {
          // [F134·4k] mã đã deprecate không hồi sinh âm thầm qua import (giữ lineage)
          if (run.mode === 'as_canonical') {
            const deprecated = await tx.taskCell.findFirst({
              where: { tenantId: user.tenantId, code, configVersionId: null, deletedAt: { not: null } },
            });
            if (deprecated) {
              throw new UnprocessableEntityException(
                `Mã '${code}' đã deprecate — không tái sử dụng qua import; dùng mã mới hoặc B1 xử lý tường minh`,
              );
            }
          }
          const created = await tx.taskCell.create({
            data: {
              ...data,
              id: uuidv7(), tenantId: user.tenantId,
              configVersionId: run.mode === 'as_local' ? run.configVersionId : null,
              code,
              origin: 'imported',
              libScope: run.mode === 'as_local' ? 'local' : 'tenant',
              contributedBy: user.claims.sub, createdBy: user.claims.sub,
              // [F130·4k] import as_canonical = active-transition (Q1 đã assert per-row)
              ...(run.mode === 'as_canonical' ? { status: 'active', activeVersion: 1 } : {}),
            },
          });
          if (run.mode === 'as_canonical') {
            await tx.taskRevision.create({
              data: {
                id: uuidv7(), tenantId: user.tenantId, taskCellId: created.id,
                version: 1, snapshot: { ...row, kpiRef: rowKpiRef ?? null } as object,
                changeSummary: `Import as_canonical — kích hoạt v1 (run ${run.id})`,
                activatedBy: user.claims.sub,
              },
            });
          }
          imported += 1;
        }
      }

      const stats = {
        ...(run.stats as object), imported, updated, unchanged, contributions,
      };
      await tx.libraryImportRun.update({ where: { id }, data: { stats: stats as object } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'library.import', entityType: 'library_import_run', entityId: id,
          after: { mode: run.mode, ...stats } as object,
        },
      });
      return tx.libraryImportRun.findFirst({ where: { id } });
    });
  }
}
