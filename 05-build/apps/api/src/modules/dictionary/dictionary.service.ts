import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { normalizeName } from '../library/quality-gate';

/**
 * [Go-live Từ điển Tác vụ] Read-model TRA CỨU thư viện tác vụ CANONICAL —
 * dữ liệu tham chiếu toàn hàng cho MỌI persona (permission taskdict:read).
 *
 * Chỉ đọc cell canonical: configVersionId = NULL + deletedAt = NULL. KHÔNG chạm
 * cell version-scoped của Configuration Studio (đó là bản nháp đang cấu hình,
 * đọc qua taskcell:read). Tách bạch để tra cứu công khai không lộ config draft.
 */
const LIST_CAP = 2000;

interface ListFilter {
  q?: string;
  groupCode?: string;
  aiLevel?: string;
  kpiRef?: string;
  role?: string;
}

@Injectable()
export class DictionaryService {
  constructor(private prisma: PrismaService) {}

  private canonicalWhere() {
    return { configVersionId: null, deletedAt: null };
  }

  /**
   * Danh sách cell canonical (đã lọc) + facets (nhóm/mức AI/KPI với số đếm trên
   * TOÀN BỘ canonical, không theo filter — để dựng cây + bộ lọc bên FE).
   */
  async list(user: RequestUser, filter: ListFilter) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const all = await tx.taskCell.findMany({
        where: this.canonicalWhere(),
        select: {
          id: true, code: true, groupCode: true, clusterCode: true,
          nameVi: true, nameEn: true, responsibleRole: true, accountableRole: true,
          aiLevel: true, riskLevel: true, kpiRef: true, origin: true,
          lifecycle: true,
        },
        orderBy: { code: 'asc' },
        take: LIST_CAP + 1,
      });
      // Trung thực khi vượt trần: KHÔNG cắt âm thầm — báo `capped` để FE cảnh báo
      // (facet + list chỉ tính trên LIST_CAP đầu; cần phân trang khi thư viện phình).
      const capped = all.length > LIST_CAP;
      if (capped) all.length = LIST_CAP;

      // Facets trên toàn bộ canonical (ổn định, không đổi theo filter)
      const groupFacet = new Map<string, { count: number; label: string | null; dept: string | null }>();
      const aiFacet = new Map<string, number>();
      const kpiFacet = new Map<string, number>();
      for (const c of all) {
        const g = c.groupCode ?? '(không nhóm)';
        const life = c.lifecycle as { groupLabel?: string; catalogDept?: string } | null;
        const label = life?.groupLabel ?? null;
        const dept = life?.catalogDept ?? null; // tên phòng thân thiện ("Tuyển sinh") thay mã slug
        const gf = groupFacet.get(g) ?? { count: 0, label, dept };
        gf.count += 1;
        if (!gf.label && label) gf.label = label;
        if (!gf.dept && dept) gf.dept = dept;
        groupFacet.set(g, gf);
        if (c.aiLevel) aiFacet.set(c.aiLevel, (aiFacet.get(c.aiLevel) ?? 0) + 1);
        if (c.kpiRef) kpiFacet.set(c.kpiRef, (kpiFacet.get(c.kpiRef) ?? 0) + 1);
      }

      // Lọc (text bỏ dấu trên code+tên; các trường khác khớp chính xác)
      const qn = filter.q ? normalizeName(filter.q) : null;
      const roleN = filter.role ? normalizeName(filter.role) : null;
      const cells = all.filter((c) => {
        if (filter.groupCode && c.groupCode !== filter.groupCode) return false;
        if (filter.aiLevel && c.aiLevel !== filter.aiLevel) return false;
        if (filter.kpiRef && c.kpiRef !== filter.kpiRef) return false;
        if (qn) {
          const hay = `${c.code} ${normalizeName(c.nameVi)} ${c.nameEn ? normalizeName(c.nameEn) : ''}`;
          if (!hay.includes(qn)) return false;
        }
        if (roleN) {
          const roles = `${c.responsibleRole ? normalizeName(c.responsibleRole) : ''} ${c.accountableRole ? normalizeName(c.accountableRole) : ''}`;
          if (!roles.includes(roleN)) return false;
        }
        return true;
      });

      return {
        total: all.length,
        matched: cells.length,
        capped,
        cells: cells.map((c) => ({
          code: c.code, groupCode: c.groupCode, clusterCode: c.clusterCode,
          nameVi: c.nameVi, nameEn: c.nameEn,
          responsibleRole: c.responsibleRole, aiLevel: c.aiLevel,
          riskLevel: c.riskLevel, kpiRef: c.kpiRef, origin: c.origin,
        })),
        facets: {
          groups: [...groupFacet.entries()]
            .map(([groupCode, v]) => ({ groupCode, groupLabel: v.label, dept: v.dept, count: v.count }))
            .sort((a, b) => a.groupCode.localeCompare(b.groupCode)),
          aiLevels: [...aiFacet.entries()].map(([aiLevel, count]) => ({ aiLevel, count })),
          kpis: [...kpiFacet.entries()].map(([kpiRef, count]) => ({ kpiRef, count }))
            .sort((a, b) => b.count - a.count),
        },
      };
    });
  }

  /** Chi tiết 1 cell canonical (đủ 7 nhóm thuộc tính) + KPI gắn (nếu resolve được). */
  async detail(user: RequestUser, code: string) {
    if (!code || code.length > 64) throw new UnprocessableEntityException('code không hợp lệ');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cell = await tx.taskCell.findFirst({
        where: { ...this.canonicalWhere(), code },
      });
      if (!cell) throw new UnprocessableEntityException(`Tác vụ '${code}' không có trong Từ điển canonical`);

      let kpi = null;
      if (cell.kpiRef) {
        kpi = await tx.kpiTemplate.findFirst({
          where: { code: cell.kpiRef, deletedAt: null }, // RLS: global + tenant
          select: {
            code: true, nameVi: true, method: true, direction: true, unit: true,
            frequency: true, domain: true, definition: true, grain: true,
            dataClassification: true, aiBoundary: true, sourceSystem: true, isDictionary: true,
          },
        });
      }
      return { cell, kpi };
    });
  }
}
