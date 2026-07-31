import { createHash } from 'crypto';
import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import {
  RETENTION_ACTIONS, RETENTION_DRY_RUN_TTL_HOURS, RETENTION_UNTOUCHABLE_ASSETS,
  defaultRetentionMonths, type DataClassification,
} from '@ipms/shared';
import { uuidv7, withRetention, type TenantTx } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { DataCatalogService } from '../datacatalog/datacatalog.service';
import { findTarget, RETENTION_TARGETS } from './retention.targets';

/**
 * [Trục C L5] Thời hạn lưu trữ & xoá dữ liệu cá nhân.
 *
 * Nguyên tắc chi phối toàn bộ service này: **không ai xoá được gì mà chưa nhìn thấy trước mình
 * sắp xoá cái gì.** Một job xoá dữ liệu chạy đúng thì im lặng — nên chạy sai cũng im lặng, và
 * đó là lý do nó cần nhiều rào hơn mọi tính năng khác của trục.
 *
 * Bốn rào, mỗi rào chặn một kiểu hỏng khác nhau:
 *   ① CHẠY THỬ BẮT BUỘC — `apply` phải trỏ tới một `dry_run` còn hạn VÀ cùng `planHash`.
 *      Chặn kiểu hỏng "bấm nhầm nút" và "dữ liệu đã đổi kể từ lúc xem".
 *   ② K6 — hai sổ giám sát không có executor, không lưu được chính sách xoá (CHECK ở DB).
 *      Chặn kiểu hỏng "hệ tự xoá bằng chứng của chính mình".
 *   ③ K7 — bản ghi thuộc kỳ chưa chốt bị loại khỏi kế hoạch, và số bị loại được GHI LẠI.
 *      Chặn kiểu hỏng "xoá dữ liệu đang dùng", và làm nó ĐO ĐƯỢC thay vì tin lời.
 *   ④ Chạy theo DANH SÁCH ID đã lập kế hoạch, không chạy lại theo điều kiện. Chặn kiểu hỏng
 *      "phạm vi lúc chạy rộng hơn phạm vi lúc duyệt".
 */
@Injectable()
export class RetentionService {
  constructor(private prisma: PrismaService, private catalog: DataCatalogService) {}

  /** Chính sách hiệu lực: bản của đơn vị nếu có, không thì bản chuẩn tập đoàn, không thì suy từ mức phân loại. */
  async effectivePolicies(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const assets = await tx.dataAsset.findMany({
        where: { deletedAt: null },
        select: { code: true, classification: true, groupName: true, tenantId: true },
      });
      // Mã dữ liệu có thể có hai dòng (chuẩn tập đoàn + override đơn vị) — lấy dòng của đơn vị
      // nếu có, đúng khuôn `DataCatalogService.resolve`.
      const byCode = new Map<string, { classification: string; groupName: string }>();
      for (const a of assets.filter((x) => x.tenantId === null)) {
        byCode.set(a.code, { classification: a.classification, groupName: a.groupName });
      }
      for (const a of assets.filter((x) => x.tenantId !== null)) {
        byCode.set(a.code, { classification: a.classification, groupName: a.groupName });
      }

      const policies = await tx.retentionPolicy.findMany({ where: { deletedAt: null } });
      const groupStd = new Map(policies.filter((p) => p.tenantId === null).map((p) => [p.assetCode, p]));
      const tenantOverride = new Map(policies.filter((p) => p.tenantId !== null).map((p) => [p.assetCode, p]));

      return {
        entries: [...byCode.entries()].map(([code, a]) => {
          const own = tenantOverride.get(code);
          const std = groupStd.get(code);
          const eff = own ?? std;
          const executable = !!findTarget(code);
          return {
            assetCode: code,
            groupName: a.groupName,
            classification: a.classification,
            retentionMonths: eff?.retentionMonths ?? defaultRetentionMonths(a.classification as DataClassification),
            action: eff?.action ?? 'keep',
            source: own ? 'đơn vị' : std ? 'chuẩn tập đoàn' : 'mặc định theo mức phân loại',
            groupStandardMonths: std?.retentionMonths ?? null,
            legalBasis: eff?.legalBasis ?? null,
            note: eff?.note ?? null,
            // Ba trạng thái khác nhau, và người đọc phải phân biệt được: có chính sách + chạy
            // được · có chính sách nhưng CHƯA có executor (sẽ báo "chưa hỗ trợ", không im lặng)
            // · cố ý bất khả xâm phạm (K6).
            untouchable: RETENTION_UNTOUCHABLE_ASSETS.includes(code),
            executable,
            version: eff?.version ?? null,
          };
        }).sort((a, b) => a.assetCode.localeCompare(b.assetCode)),
        note: 'Đơn vị chỉ RÚT NGẮN được thời hạn so với chuẩn tập đoàn — giữ lâu hơn là tăng phơi nhiễm (NĐ13).',
      };
    });
  }

  /** Đặt/sửa chính sách của ĐƠN VỊ. Bản chuẩn tập đoàn không sửa qua đường này (RLS chặn). */
  async upsertPolicy(
    user: RequestUser,
    assetCode: string,
    input: { retentionMonths: number; action: string; legalBasis?: string; note?: string },
    ip?: string,
  ) {
    if (!(RETENTION_ACTIONS as readonly string[]).includes(input.action)) {
      throw new UnprocessableEntityException(`Hành động '${input.action}' không hợp lệ`);
    }
    if (RETENTION_UNTOUCHABLE_ASSETS.includes(assetCode)
        && !['cold_archive', 'keep'].includes(input.action)) {
      throw new UnprocessableEntityException(
        `[K6] '${assetCode}' là sổ giám sát — không đặt được chính sách '${input.action}'. `
        + 'Xoá sổ vết theo lịch nghĩa là tự xoá bằng chứng của chính mình.',
      );
    }
    // Mã phải có trong sổ đăng ký (L0). Fail-closed: không đặt chính sách cho thứ chưa ai
    // phân loại — sẽ không biết nó nhạy cảm tới đâu.
    await this.catalog.resolve(user.tenantId, assetCode);

    const target = findTarget(assetCode);
    if (target && !target.supports.includes(input.action)) {
      throw new UnprocessableEntityException(
        `Mã '${assetCode}' chỉ hỗ trợ hành động: ${target.supports.join(', ')} — `
        + `'${input.action}' sẽ không chạy được (${target.describes}).`,
      );
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.retentionPolicy.findFirst({
        where: { tenantId: user.tenantId, assetCode, deletedAt: null },
      });
      if (existing) {
        await tx.retentionPolicy.updateMany({
          where: { id: existing.id },
          data: {
            retentionMonths: input.retentionMonths, action: input.action,
            legalBasis: input.legalBasis ?? null, note: input.note ?? null,
            updatedBy: user.claims.sub, version: { increment: 1 },
          },
        });
      } else {
        await tx.retentionPolicy.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, assetCode,
            retentionMonths: input.retentionMonths, action: input.action,
            legalBasis: input.legalBasis ?? null, note: input.note ?? null,
            updatedBy: user.claims.sub,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: 'retention.policy_set', entityType: 'retention_policy', entityId: null,
          after: { asset_code: assetCode, ...input } as object, ip,
        },
      });
      return { assetCode, ...input };
    });
  }

  /**
   * CHẠY THỬ — bắt buộc chạy trước `apply`. Không đụng một dòng dữ liệu nào; chỉ đếm và ghi
   * lại kế hoạch kèm vân tay.
   */
  async dryRun(user: RequestUser, assetCode: string, ip?: string) {
    return this.run(user, assetCode, 'dry_run', undefined, ip);
  }

  /** CHẠY THẬT — đòi `dryRunId` của một lượt thử còn hạn và cùng vân tay kế hoạch. */
  async apply(user: RequestUser, assetCode: string, dryRunId: string, ip?: string) {
    return this.run(user, assetCode, 'apply', dryRunId, ip);
  }

  private async run(
    user: RequestUser, assetCode: string, mode: 'dry_run' | 'apply', dryRunId?: string, ip?: string,
  ) {
    const policies = await this.effectivePolicies(user);
    const pol = policies.entries.find((e) => e.assetCode === assetCode);
    if (!pol) throw new NotFoundException(`Mã dữ liệu '${assetCode}' không có trong sổ đăng ký`);

    if (pol.untouchable) {
      throw new UnprocessableEntityException(
        `[K6] '${assetCode}' là sổ giám sát — không có lượt quét lưu trữ nào chạm tới nó.`,
      );
    }
    if (pol.action === 'keep') {
      throw new UnprocessableEntityException(
        `Chính sách của '${assetCode}' là 'keep' (giữ vô thời hạn) — không có gì để quét.`,
      );
    }
    if (pol.action === 'cold_archive') {
      // Nói thẳng thay vì trả về 0 bản ghi: một lượt chạy "thành công, 0 bản ghi" sẽ được đọc
      // thành "đã lưu trữ xong", trong khi thực tế chưa có kho lạnh nào tồn tại.
      throw new UnprocessableEntityException(
        `Hành động 'cold_archive' CHƯA THỰC THI ĐƯỢC — hệ chưa có kho lưu trữ lạnh. `
        + 'Chính sách vẫn được lưu (ghi nhận ý định của B5), nhưng lượt quét sẽ không chạy.',
      );
    }
    const target = findTarget(assetCode);
    if (!target) {
      throw new UnprocessableEntityException(
        `Chưa có bộ thực thi cho '${assetCode}' — mã có chính sách nhưng không có đoạn mã nào `
        + `biết cách xử lý nó (fail-closed). Đã hỗ trợ: ${RETENTION_TARGETS.map((t) => t.assetCode).join(', ')}.`,
      );
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - pol.retentionMonths);

    // Lượt THỬ chạy trong transaction thường; lượt THẬT chạy qua `withRetention` — cùng tenant
    // context, thêm GUC mở cổng xoá. Tách hai đường ở đây (không bật GUC cho mọi lượt) để một
    // lượt chạy thử KHÔNG BAO GIỜ mang theo khả năng xoá, kể cả nếu executor có lỗi lập trình.
    const runner = mode === 'apply'
      ? <T>(fn: (tx: TenantTx) => Promise<T>) => withRetention(this.prisma.client, user.tenantId, fn)
      : <T>(fn: (tx: TenantTx) => Promise<T>) => this.prisma.withTenant(user.tenantId, fn);

    return runner(async (tx) => {
      const plan = await target.plan(tx, cutoff);
      // Vân tay: cùng mã + hành động + số tháng + kế hoạch. KHÔNG gồm `cutoff` chính xác tới
      // mili-giây (nó luôn khác giữa hai lượt) mà gồm số tháng — thứ người duyệt thực sự nhìn.
      const planHash = createHash('sha256')
        .update(`${assetCode}|${pol.action}|${pol.retentionMonths}|${plan.planned}|${plan.skippedProtected}`)
        .digest('hex').slice(0, 32);

      let affected = 0;
      if (mode === 'apply') {
        const prior = await tx.retentionRun.findFirst({ where: { id: dryRunId, mode: 'dry_run' } });
        if (!prior) {
          throw new UnprocessableEntityException(
            'Chạy thật phải trỏ tới một lượt CHẠY THỬ có thật — chạy thử trước, xem kế hoạch, rồi mới chạy.',
          );
        }
        const ageH = (Date.now() - prior.startedAt.getTime()) / 3_600_000;
        if (ageH > RETENTION_DRY_RUN_TTL_HOURS) {
          throw new ConflictException(
            `Lượt chạy thử đã quá ${RETENTION_DRY_RUN_TTL_HOURS} giờ — chạy thử lại để xem kế hoạch hiện tại.`,
          );
        }
        if (prior.assetCode !== assetCode) {
          throw new ConflictException(`Lượt thử đó dành cho '${prior.assetCode}', không phải '${assetCode}'.`);
        }
        if (prior.planHash !== planHash) {
          // Đây là rào quan trọng nhất: dữ liệu đã đổi kể từ lúc người ta NHÌN. Bắt chạy thử
          // lại thay vì "chắc cũng gần giống" — phạm vi thực thi phải đúng bằng phạm vi đã duyệt.
          throw new ConflictException(
            'Kế hoạch đã đổi kể từ lượt chạy thử (số bản ghi trong phạm vi khác trước) — chạy thử lại.',
          );
        }
        affected = await target.apply(tx, cutoff, pol.action);
      }

      const id = uuidv7();
      await tx.retentionRun.create({
        data: {
          id, tenantId: user.tenantId, mode, assetCode, action: pol.action,
          retentionMonths: pol.retentionMonths, cutoffAt: cutoff,
          plannedCount: plan.planned, affectedCount: mode === 'apply' ? affected : 0,
          skippedProtected: plan.skippedProtected,
          planHash, dryRunId: dryRunId ?? null,
          report: { ...plan.detail, describes: target.describes, classification: pol.classification } as object,
          actorUserId: user.claims.sub, finishedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: mode === 'apply' ? 'retention.applied' : 'retention.dry_run',
          entityType: 'retention_run', entityId: id,
          after: {
            asset_code: assetCode, action: pol.action, retention_months: pol.retentionMonths,
            planned: plan.planned, affected, skipped_protected: plan.skippedProtected,
          } as object, ip,
        },
      });

      return {
        id, mode, assetCode, action: pol.action,
        retentionMonths: pol.retentionMonths, cutoffAt: cutoff,
        planned: plan.planned, affected, skippedProtected: plan.skippedProtected,
        planHash, report: plan.detail,
      };
    });
  }

  /** Sổ các lượt chạy — hồ sơ tuân thủ, B0 đọc được. */
  async listRuns(user: RequestUser, assetCode?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const rows = await tx.retentionRun.findMany({
        where: { ...(assetCode ? { assetCode } : {}) },
        orderBy: { startedAt: 'desc' },
        take: 100,
      });
      const ids = [...new Set(rows.map((r) => r.actorUserId))];
      const users = ids.length
        ? await tx.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
        : [];
      const emailOf = new Map(users.map((u) => [u.id, u.email]));
      return {
        entries: rows.map((r) => ({
          id: r.id, mode: r.mode, assetCode: r.assetCode, action: r.action,
          retentionMonths: r.retentionMonths, cutoffAt: r.cutoffAt,
          planned: r.plannedCount, affected: r.affectedCount, skippedProtected: r.skippedProtected,
          dryRunId: r.dryRunId, report: r.report,
          actor: { id: r.actorUserId, email: emailOf.get(r.actorUserId) ?? null },
          startedAt: r.startedAt, finishedAt: r.finishedAt,
        })),
        total: rows.length,
      };
    });
  }
}
