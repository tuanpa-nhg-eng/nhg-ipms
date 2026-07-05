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

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.orgUnit.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
  }

  async tree(tenantId: string, rootId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const all = await tx.orgUnit.findMany({ where: { deletedAt: null } });
      const byParent = new Map<string | null, typeof all>();
      for (const u of all) {
        const k = u.parentId ?? null;
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k)!.push(u);
      }
      const build = (node: (typeof all)[number]): any => ({
        ...node,
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
}
