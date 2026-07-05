import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested,
} from 'class-validator';
import { uuidv7 } from '@ipms/db';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { PrismaService } from '../../prisma.service';

class CreateFunctionDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
}

class UnitFunctionDto {
  @IsUUID() functionId!: string;
  @IsOptional() @IsNumber() @Min(0) weight?: number;
}

class SetUnitFunctionsDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => UnitFunctionDto)
  functions!: UnitFunctionDto[];
}

/** ② Org Designer — catalog chức năng + gán phòng ban ↔ chức năng (feed Derivation Engine). */
@Controller()
export class OrgFunctionController {
  constructor(private prisma: PrismaService) {}

  @Get('org-functions')
  @RequirePermission('org:design')
  list(@CurrentUser() user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.orgFunction.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
  }

  @Post('org-functions')
  @RequirePermission('org:design')
  @Audited('org_function.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFunctionDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.orgFunction.findFirst({ where: { code: dto.code, deletedAt: null } });
      if (dup) throw new ConflictException(`Function '${dto.code}' exists`);
      return tx.orgFunction.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId,
          code: dto.code, nameVi: dto.nameVi, nameEn: dto.nameEn,
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
    });
  }

  /** Gán bộ chức năng cho phòng ban (thay toàn bộ — idempotent). */
  @Put('org-units/:id/functions')
  @RequirePermission('org:design')
  @Audited('org_unit.set_functions')
  setFunctions(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) orgUnitId: string,
    @Body() dto: SetUnitFunctionsDto,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const unit = await tx.orgUnit.findFirst({ where: { id: orgUnitId, deletedAt: null } });
      if (!unit) throw new UnprocessableEntityException('Org unit not found');
      for (const f of dto.functions) {
        const fn = await tx.orgFunction.findFirst({ where: { id: f.functionId, deletedAt: null } });
        if (!fn) throw new UnprocessableEntityException(`Function ${f.functionId} not found`);
      }
      // thay toàn bộ mapping (bảng nhỏ, không soft-delete — PK composite)
      await tx.orgUnitFunction.deleteMany({ where: { orgUnitId } }).catch(() => {
        throw new UnprocessableEntityException('Không thể cập nhật mapping');
      });
      for (const f of dto.functions) {
        await tx.orgUnitFunction.create({
          data: { tenantId: user.tenantId, orgUnitId, functionId: f.functionId, weight: f.weight },
        });
      }
      return tx.orgUnitFunction.findMany({ where: { orgUnitId }, include: { function: true } });
    });
  }
}
