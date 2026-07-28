import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';

export interface CreateOrgUnitInput {
  code: string;
  nameVi: string;
  nameEn?: string;
  level: string;
  parentId?: string;
}

export interface UpdateOrgUnitInput {
  nameVi?: string;
  nameEn?: string;
  parentId?: string | null;
  managerId?: string | null;
  version: number;
}

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.orgUnit.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
  }

  /**
   * [Trục B L3] Cây tổ chức + "Đếm người theo từng đơn vị" (kế hoạch §4 Lát 3) + tên
   * người quản lý mỗi đơn vị. Đếm bằng `groupBy` MỘT lượt trên toàn tenant — không N+1
   * theo số node của cây.
   */
  async tree(tenantId: string, rootId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const all = await tx.orgUnit.findMany({ where: { deletedAt: null } });
      const counts = await tx.person.groupBy({
        by: ['orgUnitId'], where: { deletedAt: null, orgUnitId: { not: null } }, _count: { _all: true },
      });
      const countByOrg = new Map(counts.map((c) => [c.orgUnitId as string, c._count._all]));
      const managerIds = [...new Set(all.map((u) => u.managerId).filter(Boolean))] as string[];
      const managers = managerIds.length
        ? await tx.person.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } })
        : [];
      const managerName = new Map(managers.map((m) => [m.id, m.fullName]));

      const byParent = new Map<string | null, typeof all>();
      for (const u of all) {
        const k = u.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k)!.push(u);
      }
      const build = (node: (typeof all)[number]): any => ({
        ...node,
        personCount: countByOrg.get(node.id) ?? 0,
        managerName: node.managerId ? managerName.get(node.managerId) ?? null : null,
        children: (byParent.get(node.id) ?? []).map(build),
      });
      const root = all.find((u) => u.id === rootId);
      if (!root) throw new NotFoundException('org unit not found');
      return build(root);
    });
  }

  async create(tenantId: string, actorId: string, input: CreateOrgUnitInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (input.parentId) {
        const parent = await tx.orgUnit.findFirst({ where: { id: input.parentId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException('parent org unit not found');
      }
      const dup = await tx.orgUnit.findFirst({ where: { code: input.code } });
      if (dup) throw new ConflictException(`org unit code '${input.code}' exists`);
      return tx.orgUnit.create({
        data: {
          id: uuidv7(),
          tenantId,
          code: input.code,
          nameVi: input.nameVi,
          nameEn: input.nameEn,
          level: input.level,
          parentId: input.parentId,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
    });
  }

  /**
   * [Trục B L1] Đổi tên / đổi cha. Chu trình bị chặn (cha không thể là con/cháu của chính
   * mình). Trả kèm `affectedGrants` — CẢNH BÁO TƯỜNG MINH số user_role đang cấp scope=đơn
   * vị này, để người thao tác biết di chuyển KHÔNG tự đổi phạm vi các vai đó (scope so khớp
   * trực tiếp theo orgUnitId, không suy theo cây — xem scope.util.ts) nhưng người xem cây tổ
   * chức có thể hiểu nhầm là có; nói thật thay vì im lặng.
   */
  async update(tenantId: string, actorId: string, id: string, input: UpdateOrgUnitInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unit = await tx.orgUnit.findFirst({ where: { id, deletedAt: null } });
      if (!unit) throw new NotFoundException('org unit not found');

      if (input.parentId) {
        if (input.parentId === id) {
          throw new UnprocessableEntityException('Đơn vị không thể là cha của chính mình');
        }
        const parent = await tx.orgUnit.findFirst({ where: { id: input.parentId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException('parent org unit not found');
        // chu trình: parentId mới không được nằm trong subtree của chính unit
        const all = await tx.orgUnit.findMany({ where: { deletedAt: null }, select: { id: true, parentId: true } });
        const byParent = new Map<string, string[]>();
        for (const u of all) {
          const k = u.parentId ?? '';
          if (!byParent.has(k)) byParent.set(k, []);
          byParent.get(k)!.push(u.id);
        }
        const descendants = new Set<string>();
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const child of byParent.get(cur) ?? []) {
            if (!descendants.has(child)) { descendants.add(child); stack.push(child); }
          }
        }
        if (descendants.has(input.parentId)) {
          throw new UnprocessableEntityException('Chu trình: cha mới nằm trong nhánh con của chính đơn vị này');
        }
      }

      if (input.managerId) {
        const manager = await tx.person.findFirst({ where: { id: input.managerId, deletedAt: null } });
        if (!manager) throw new UnprocessableEntityException('Người quản lý không tồn tại');
      }

      const count = await tx.orgUnit.updateMany({
        where: { id, version: input.version },
        data: {
          nameVi: input.nameVi ?? undefined,
          nameEn: input.nameEn ?? undefined,
          parentId: input.parentId === undefined ? undefined : input.parentId,
          managerId: input.managerId === undefined ? undefined : input.managerId,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });
      if (count.count !== 1) throw new ConflictException('Version lệch — tải lại và thử lại');

      const affectedGrants = input.parentId !== undefined
        ? await tx.userRole.count({ where: { scopeType: 'org_unit', scopeId: id, deletedAt: null } })
        : 0;

      await tx.auditLog.create({
        data: {
          tenantId, actorUserId: actorId,
          action: 'admin.orgunit_update', entityType: 'org_unit', entityId: id,
          before: { nameVi: unit.nameVi, parentId: unit.parentId } as object,
          after: input as object,
        },
      });
      const updated = await tx.orgUnit.findFirst({ where: { id } });
      return { ...updated, affectedGrants };
    });
  }

  /** Soft-delete — chặn khi còn người hoặc còn đơn vị con (409 kèm số lượng). */
  async archive(tenantId: string, actorId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const unit = await tx.orgUnit.findFirst({ where: { id, deletedAt: null } });
      if (!unit) throw new NotFoundException('org unit not found');

      const [childCount, personCount] = await Promise.all([
        tx.orgUnit.count({ where: { parentId: id, deletedAt: null } }),
        tx.person.count({ where: { orgUnitId: id, deletedAt: null } }),
      ]);
      if (childCount > 0 || personCount > 0) {
        throw new ConflictException(
          `Không lưu trữ được — còn ${childCount} đơn vị con và ${personCount} người thuộc đơn vị này`,
        );
      }

      await tx.orgUnit.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorId, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          tenantId, actorUserId: actorId,
          action: 'admin.orgunit_archive', entityType: 'org_unit', entityId: id,
        },
      });
      return { archived: true };
    });
  }
}
