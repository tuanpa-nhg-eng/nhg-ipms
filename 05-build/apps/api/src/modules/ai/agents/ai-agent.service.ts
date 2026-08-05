import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DATA_CLASSIFICATIONS, DataClassification, PERMISSIONS, dataClassRank, normalizeDataClass,
} from '@ipms/shared';
import { TenantTx, uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import { RequestUser } from '../../../common/auth/decorators';

/**
 * [Trục D L0] DANH BẠ AGENT — nguồn sự thật DUY NHẤT về danh tính của mỗi actor AI (BR-M09-02).
 *
 * Ngữ nghĩa kế thừa giống hệt `DataCatalogService` một tầng bên dưới:
 *   · bản chuẩn cấp tập đoàn = `tenantId NULL`, app KHÔNG ghi được (RLS chặn INSERT/UPDATE)
 *   · đơn vị tạo bản riêng cùng `code` để SIẾT CHẶT hơn — trigger DB chặn năm chiều nới lỏng
 *   · `resolve()` trả bản hiệu lực: bản của đơn vị nếu có, không thì bản chuẩn
 *
 * ⚠️ PHẠM VI L0: bảng này mới chỉ là SỔ. `resolve()` đã fail-closed (agent lạ ⇒ ném), nhưng
 * ai-gateway CHƯA gọi nó — cưỡng chế N1/N2/N3 là việc của L1. Tách ra có chủ đích: bật chặn
 * trước khi sổ phủ hết mã đang chạy thật là gãy sản phẩm đang chạy.
 */
export interface ResolvedAgent {
  code: string;
  nameVi: string;
  purpose: string;
  ownerRole: string;
  kind: string;
  maxDataClass: DataClassification;
  dataAssetCodes: string[];
  permissions: string[];
  hitlMode: 'read_only' | 'propose_only';
  status: 'active' | 'planned' | 'retired';
  scope: 'global' | 'tenant';
}

/** jsonb có thể là bất cứ gì nếu ai đó ghi thẳng DB — không tin, lọc về string[]. */
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

@Injectable()
export class AiAgentService {
  constructor(private prisma: PrismaService) {}

  /** Danh bạ hiệu lực cho đơn vị: bản chuẩn, đè bởi bản riêng nếu có. */
  list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx: TenantTx) => {
      const rows = await tx.aiAgent.findMany({
        where: { deletedAt: null },
        orderBy: [{ code: 'asc' }],
      });
      const byCode = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const cur = byCode.get(r.code);
        // bản của đơn vị (tenantId ≠ null) luôn thắng bản chuẩn
        if (!cur || (cur.tenantId === null && r.tenantId !== null)) byCode.set(r.code, r);
      }
      const entries = [...byCode.values()].map((r) => this.shape(r));
      // `total` = số phần tử THỰC SỰ trả về, tính từ chính mảng đã dựng. Danh bạ không phân
      // trang (số agent là hàng chục, không hàng nghìn) — nhưng ghi ra đây để lần sau ai thêm
      // trần trang thì thấy ngay chỗ phải sửa. Lỗi "total là số dòng của trang" đã lặp BỐN lần.
      return { entries, total: entries.length };
    });
  }

  /**
   * Tra danh tính hiệu lực của một mã agent. Đây là hàm mà L1 (trần phân loại), L2 (quyền hữu
   * hiệu) và L3 (định tuyến) sẽ gọi — KHÔNG nơi nào được tự nhớ hiến chương lần thứ hai.
   *
   * Mã không có trong sổ ⇒ NÉM. Không mặc định về một agent "chung chung": một agent chưa
   * đăng ký thì phải bị chặn và bị phát hiện (N1), không được im lặng chảy qua.
   */
  async resolve(tenantId: string, code: string): Promise<ResolvedAgent> {
    return this.prisma.withTenant(tenantId, async (tx: TenantTx) => {
      const rows = await tx.aiAgent.findMany({ where: { code, deletedAt: null } });
      if (rows.length === 0) {
        throw new NotFoundException(
          `Agent '${code}' chưa đăng ký trong danh bạ — khai danh tính (chủ quản, trần phân `
          + 'loại, phạm vi dữ liệu, quyền) trước khi dùng (fail-closed)',
        );
      }
      const row = rows.find((r: { tenantId: string | null }) => r.tenantId !== null) ?? rows[0];
      const cls = normalizeDataClass(row.maxDataClass);
      if (cls === null) {
        throw new UnprocessableEntityException(
          `ai_agent '${code}' có trần phân loại không hợp lệ: '${row.maxDataClass}'`,
        );
      }
      return this.shape(row, cls);
    });
  }

  private shape(row: any, cls?: DataClassification): ResolvedAgent {
    return {
      code: row.code,
      nameVi: row.nameVi,
      purpose: row.purpose,
      ownerRole: row.ownerRole,
      kind: row.kind,
      maxDataClass: cls ?? (normalizeDataClass(row.maxDataClass) ?? 'restricted'),
      dataAssetCodes: toStringArray(row.dataAssetCodes),
      permissions: toStringArray(row.permissions),
      hitlMode: row.hitlMode,
      status: row.status,
      scope: row.tenantId === null ? 'global' : 'tenant',
    };
  }

  /**
   * Đơn vị đặt/siết bản riêng. Chỉ `data_steward` giữ `aiagent:write` (guard ở controller).
   *
   * Năm chiều "không nới lỏng" được kiểm HAI LẦN có chủ đích — ở đây để trả 422 đọc được, và
   * ở trigger DB để không đường ghi nào lách được. Đúng khuôn `DataCatalogService`: kiểm ở
   * service mà bỏ ở DB là chỗ một endpoint mới thêm sau này sẽ vô tình mở lại.
   *
   * Đơn vị KHÔNG tạo được agent mã mới (khác `data_asset`, nơi đơn vị được đăng ký nhóm dữ
   * liệu riêng): một agent chỉ tồn tại khi có mã trong `LlmRequest.agent` ở mã nguồn, mà mã
   * nguồn là của tập đoàn. Cho đơn vị đúc agent mới nghĩa là cho họ khai một danh tính không
   * ứng với bất kỳ đường chạy nào — sổ đầy agent ma, đúng thứ L0 sinh ra để dọn.
   */
  async upsertTenantOverride(
    user: RequestUser,
    code: string,
    input: {
      maxDataClass?: string; dataAssetCodes?: string[]; permissions?: string[];
      hitlMode?: string; status?: string; note?: string; version?: number;
    },
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx: TenantTx) => {
      const globalRow = await tx.aiAgent.findFirst({
        where: { tenantId: null, code, deletedAt: null },
      });
      if (!globalRow) {
        throw new UnprocessableEntityException(
          `Agent '${code}' không có trong danh bạ chuẩn tập đoàn — đơn vị chỉ SIẾT được agent `
          + 'đã có, không đúc được agent mới (agent phải ứng với một đường chạy trong mã nguồn).',
        );
      }
      const gCls = normalizeDataClass(globalRow.maxDataClass);

      const next = {
        maxDataClass: input.maxDataClass ?? globalRow.maxDataClass,
        dataAssetCodes: input.dataAssetCodes ?? toStringArray(globalRow.dataAssetCodes),
        permissions: input.permissions ?? toStringArray(globalRow.permissions),
        hitlMode: input.hitlMode ?? globalRow.hitlMode,
        status: input.status ?? globalRow.status,
      };

      // ① trần phân loại
      const nCls = normalizeDataClass(next.maxDataClass);
      if (nCls === null) {
        throw new UnprocessableEntityException(
          `Trần phân loại không hợp lệ: '${next.maxDataClass}' — hợp lệ: ${DATA_CLASSIFICATIONS.join(', ')}`,
        );
      }
      if (gCls !== null && dataClassRank(nCls) > dataClassRank(gCls)) {
        throw new UnprocessableEntityException(
          `'${code}': đơn vị không được NÂNG trần phân loại (chuẩn='${gCls}', đặt='${nCls}')`,
        );
      }
      // ② quyền ⊆ chuẩn
      const gPerms = new Set(toStringArray(globalRow.permissions));
      const extraPerms = next.permissions.filter((p) => !gPerms.has(p));
      if (extraPerms.length > 0) {
        throw new UnprocessableEntityException(
          `'${code}': quyền phải là tập con của bản chuẩn — thừa: ${extraPerms.join(', ')}`,
        );
      }
      // ③ phạm vi dữ liệu ⊆ chuẩn
      const gAssets = new Set(toStringArray(globalRow.dataAssetCodes));
      const extraAssets = next.dataAssetCodes.filter((a) => !gAssets.has(a));
      if (extraAssets.length > 0) {
        throw new UnprocessableEntityException(
          `'${code}': phạm vi dữ liệu phải là tập con của bản chuẩn — thừa: ${extraAssets.join(', ')}`,
        );
      }
      // ④ chế độ HITL
      const HITL_RANK: Record<string, number> = { read_only: 0, propose_only: 1 };
      if (HITL_RANK[next.hitlMode] === undefined) {
        throw new UnprocessableEntityException(
          `Chế độ HITL không hợp lệ: '${next.hitlMode}' — hợp lệ: read_only, propose_only`,
        );
      }
      if (HITL_RANK[next.hitlMode] > HITL_RANK[globalRow.hitlMode]) {
        throw new UnprocessableEntityException(
          `'${code}': đơn vị không được NỚI chế độ HITL (chuẩn='${globalRow.hitlMode}', đặt='${next.hitlMode}')`,
        );
      }
      // ⑤ trạng thái
      const STATUS_RANK: Record<string, number> = { retired: 0, planned: 1, active: 2 };
      if (STATUS_RANK[next.status] === undefined) {
        throw new UnprocessableEntityException(
          `Trạng thái không hợp lệ: '${next.status}' — hợp lệ: active, planned, retired`,
        );
      }
      if (STATUS_RANK[next.status] > STATUS_RANK[globalRow.status]) {
        throw new UnprocessableEntityException(
          `'${code}': đơn vị không được tự BẬT agent mà bản chuẩn để '${globalRow.status}'`,
        );
      }

      const existing = await tx.aiAgent.findFirst({
        where: { tenantId: user.tenantId, code, deletedAt: null },
      });
      if (existing) {
        if (input.version !== undefined && input.version !== existing.version) {
          throw new ConflictException('Version lệch — tải lại và thử lại');
        }
        const updated = await tx.aiAgent.updateMany({
          where: { id: existing.id, version: existing.version },
          data: {
            maxDataClass: nCls, dataAssetCodes: next.dataAssetCodes, permissions: next.permissions,
            hitlMode: next.hitlMode, status: next.status,
            note: input.note ?? existing.note,
            version: { increment: 1 }, updatedBy: user.claims.sub,
          },
        });
        if (updated.count === 0) throw new ConflictException('Version lệch — tải lại và thử lại');
        return { code, maxDataClass: nCls, status: next.status, scope: 'tenant' as const, created: false };
      }

      await tx.aiAgent.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, code,
          nameVi: globalRow.nameVi, nameEn: globalRow.nameEn, purpose: globalRow.purpose,
          ownerRole: globalRow.ownerRole, kind: globalRow.kind,
          maxDataClass: nCls, dataAssetCodes: next.dataAssetCodes, permissions: next.permissions,
          hitlMode: next.hitlMode, status: next.status,
          note: input.note ?? null, createdBy: user.claims.sub,
        },
      });
      return { code, maxDataClass: nCls, status: next.status, scope: 'tenant' as const, created: true };
    });
  }
}

/**
 * [Trục D L0] Mọi quyền khai trong hiến chương agent PHẢI có trong catalog quyền.
 *
 * Tách thành hàm thuần (không DB) để unit test gọi được trực tiếp trên dữ liệu seed. Một mã
 * quyền gõ sai trong hiến chương không gây lỗi gì hôm nay — nó chỉ lặng lẽ biến thành "quyền
 * không bao giờ khớp" khi L2 lấy giao với quyền người gọi, tức là agent mất năng lực mà không
 * ai biết vì sao. Đúng họ với lỗi chuỗi tự do mà L0 sinh ra để đóng.
 */
export function unknownPermissions(perms: Iterable<string>): string[] {
  const catalog = new Set<string>(PERMISSIONS as readonly string[]);
  return [...perms].filter((p) => !catalog.has(p));
}
