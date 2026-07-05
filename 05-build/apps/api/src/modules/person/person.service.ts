import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';

export interface CreatePersonInput {
  employeeCode: string;
  fullName: string;
  email?: string;
  status: string;
  orgUnitId?: string;
  managerId?: string;
}

@Injectable()
export class PersonService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.person.findMany({ where: { deletedAt: null }, orderBy: { employeeCode: 'asc' } }),
    );
  }

  me(tenantId: string, personId: string | undefined) {
    if (!personId) return null;
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.person.findFirst({ where: { id: personId, deletedAt: null } }),
    );
  }

  create(tenantId: string, actorId: string, input: CreatePersonInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const dup = await tx.person.findFirst({ where: { employeeCode: input.employeeCode } });
      if (dup) throw new ConflictException(`employee code '${input.employeeCode}' exists`);
      if (input.orgUnitId) {
        const ou = await tx.orgUnit.findFirst({ where: { id: input.orgUnitId, deletedAt: null } });
        if (!ou) throw new UnprocessableEntityException('org unit not found');
      }
      if (input.managerId) {
        const mgr = await tx.person.findFirst({ where: { id: input.managerId, deletedAt: null } });
        if (!mgr) throw new UnprocessableEntityException('manager not found');
      }
      return tx.person.create({
        data: {
          id: uuidv7(),
          tenantId,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          email: input.email,
          status: input.status,
          orgUnitId: input.orgUnitId,
          managerId: input.managerId,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
    });
  }
}
