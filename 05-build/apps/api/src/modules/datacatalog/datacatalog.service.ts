import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DATA_CLASSIFICATIONS, DataClassification, dataClassRank, normalizeDataClass } from '@ipms/shared';
import { TenantTx, uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import { RequestUser } from '../../common/auth/decorators';

/**
 * [Trục C L0] Sổ đăng ký dữ liệu — nguồn sự thật DUY NHẤT cho phân loại dữ liệu.
 *
 * Ngữ nghĩa kế thừa (giống access_policy):
 *   · bản chuẩn cấp tập đoàn = `tenantId NULL`, app KHÔNG ghi được (RLS chặn INSERT/UPDATE)
 *   · đơn vị tạo bản riêng cùng `code` để SIẾT CHẶT hơn — trigger DB chặn nới lỏng
 *   · `resolve()` trả bản hiệu lực: bản của đơn vị nếu có, không thì bản chuẩn
 */
@Injectable()
export class DataCatalogService {
  constructor(private prisma: PrismaService) {}

  /** Danh mục hiệu lực cho tenant: bản chuẩn, đè bởi bản riêng của đơn vị nếu có. */
  list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx: TenantTx) => {
      const rows = await tx.dataAsset.findMany({
        where: { deletedAt: null },
        orderBy: [{ code: 'asc' }],
      });
      const byCode = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const cur = byCode.get(r.code);
        // bản của đơn vị (tenantId ≠ null) luôn thắng bản chuẩn
        if (!cur || (cur.tenantId === null && r.tenantId !== null)) byCode.set(r.code, r);
      }
      const entries = [...byCode.values()].map((r) => ({
        code: r.code,
        groupName: r.groupName,
        description: r.description,
        sourceSystem: r.sourceSystem,
        ownerRole: r.ownerRole,
        classification: r.classification,
        legalNote: r.legalNote,
        scope: r.tenantId === null ? ('global' as const) : ('tenant' as const),
        version: r.version,
      }));
      return { entries, total: entries.length };
    });
  }

  /**
   * Tra mức phân loại hiệu lực của một mã. Đây là hàm mà L1 (export control), L5 (lưu trữ)
   * và lớp AI gọi — KHÔNG nơi nào được tự nhớ mức phân loại lần thứ hai.
   * Mã không có trong sổ ⇒ NÉM, không mặc định về 'internal': một đường dữ liệu chưa đăng
   * ký thì phải bị chặn và bị phát hiện, không được im lặng chảy qua (fail-closed).
   */
  async resolve(tenantId: string, code: string): Promise<{
    code: string; classification: DataClassification; ownerRole: string; scope: 'global' | 'tenant';
  }> {
    return this.prisma.withTenant(tenantId, async (tx: TenantTx) => {
      const rows = await tx.dataAsset.findMany({ where: { code, deletedAt: null } });
      if (rows.length === 0) {
        throw new NotFoundException(
          `Mã dữ liệu '${code}' chưa đăng ký trong sổ — đăng ký trước khi dùng (fail-closed)`,
        );
      }
      const row = rows.find((r: { tenantId: string | null }) => r.tenantId !== null) ?? rows[0];
      const cls = normalizeDataClass(row.classification);
      if (cls === null) {
        throw new UnprocessableEntityException(
          `data_asset '${code}' có mức phân loại không hợp lệ: '${row.classification}'`,
        );
      }
      return {
        code: row.code,
        classification: cls,
        ownerRole: row.ownerRole,
        scope: row.tenantId === null ? 'global' : 'tenant',
      };
    });
  }

  /**
   * [F205] Tra NHIỀU mã trong MỘT lượt. Cùng luật với `resolve()` — bản của đơn vị thắng bản
   * chuẩn, mã thiếu ⇒ ném — nhưng một truy vấn thay vì một `withTenant` cho mỗi mã.
   *
   * Sinh ra vì `ai-gateway` tra sổ trong vòng lặp trên `dataAssets`: N+1 nằm ngay trong cổng
   * gác, trên đường đi của MỌI lượt gọi AI. Bài học F171 đã được áp ở `eval.service` trong
   * cùng commit và bị phá ở đây — nên phần tra sổ chuyển hẳn vào sổ, không để chỗ gọi tự lặp.
   *
   * Nêu ĐỦ các mã thiếu trong một lần, không dừng ở mã đầu tiên: người khai sửa một lượt.
   */
  async resolveMany(tenantId: string, codes: string[]): Promise<Map<string, DataClassification>> {
    const wanted = [...new Set(codes)];
    if (wanted.length === 0) return new Map();
    return this.prisma.withTenant(tenantId, async (tx: TenantTx) => {
      const rows = await tx.dataAsset.findMany({ where: { code: { in: wanted }, deletedAt: null } });
      const out = new Map<string, DataClassification>();
      for (const code of wanted) {
        const matches = rows.filter((r: { code: string }) => r.code === code);
        if (matches.length === 0) continue;
        const row = matches.find((r: { tenantId: string | null }) => r.tenantId !== null) ?? matches[0];
        const cls = normalizeDataClass(row.classification);
        if (cls === null) {
          throw new UnprocessableEntityException(
            `data_asset '${code}' có mức phân loại không hợp lệ: '${row.classification}'`,
          );
        }
        out.set(code, cls);
      }
      const missing = wanted.filter((c) => !out.has(c));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Mã dữ liệu ${missing.map((c) => `'${c}'`).join(', ')} chưa đăng ký trong sổ — đăng ký `
          + 'trước khi dùng (fail-closed)',
        );
      }
      return out;
    });
  }

  /**
   * Đơn vị đặt/siết bản riêng. Chỉ `data_steward` gọi được (guard ở controller).
   *
   * Ràng buộc "không nới lỏng" được kiểm HAI LẦN có chủ đích: ở đây để trả lỗi 422 đọc
   * được, và ở trigger DB để không đường ghi nào lách được. Kiểm ở service mà bỏ ở DB là
   * chỗ mà một endpoint mới thêm sau này sẽ vô tình mở lại.
   */
  async upsertTenantOverride(
    user: RequestUser,
    code: string,
    input: { classification: string; ownerRole?: string; legalNote?: string; version?: number },
  ) {
    const cls = normalizeDataClass(input.classification);
    if (cls === null) {
      throw new UnprocessableEntityException(
        `Mức phân loại không hợp lệ: '${input.classification}' — hợp lệ: ${DATA_CLASSIFICATIONS.join(', ')}`,
      );
    }
    return this.prisma.withTenant(user.tenantId, async (tx: TenantTx) => {
      const globalRow = await tx.dataAsset.findFirst({
        where: { tenantId: null, code, deletedAt: null },
      });
      const globalCls = globalRow ? normalizeDataClass(globalRow.classification) : null;
      if (globalCls !== null && dataClassRank(cls) < dataClassRank(globalCls)) {
        throw new UnprocessableEntityException(
          `'${code}': đơn vị chỉ được siết chặt hơn bản chuẩn tập đoàn (chuẩn='${globalCls}', đặt='${cls}')`,
        );
      }
      if (globalRow === null) {
        // Mã hoàn toàn mới của đơn vị — vẫn cho, nhưng phải có chủ dữ liệu tường minh.
        if (!input.ownerRole || input.ownerRole.trim().length < 2) {
          throw new UnprocessableEntityException(
            `'${code}' không có trong sổ chuẩn — phải nêu chủ dữ liệu (ownerRole) khi tạo mới`,
          );
        }
      }

      const existing = await tx.dataAsset.findFirst({
        where: { tenantId: user.tenantId, code, deletedAt: null },
      });
      if (existing) {
        if (input.version !== undefined && input.version !== existing.version) {
          throw new ConflictException('Version lệch — tải lại và thử lại');
        }
        const updated = await tx.dataAsset.updateMany({
          where: { id: existing.id, version: existing.version },
          data: {
            classification: cls,
            ownerRole: input.ownerRole ?? existing.ownerRole,
            legalNote: input.legalNote ?? existing.legalNote,
            version: { increment: 1 },
            updatedBy: user.claims.sub,
          },
        });
        if (updated.count === 0) throw new ConflictException('Version lệch — tải lại và thử lại');
        return { code, classification: cls, scope: 'tenant' as const, created: false };
      }

      await tx.dataAsset.create({
        data: {
          id: uuidv7(),
          tenantId: user.tenantId,
          code,
          groupName: globalRow?.groupName ?? code,
          description: globalRow?.description ?? null,
          sourceSystem: globalRow?.sourceSystem ?? null,
          ownerRole: input.ownerRole ?? globalRow?.ownerRole ?? 'chưa xác định',
          classification: cls,
          legalNote: input.legalNote ?? globalRow?.legalNote ?? null,
          createdBy: user.claims.sub,
        },
      });
      return { code, classification: cls, scope: 'tenant' as const, created: true };
    });
  }
}
