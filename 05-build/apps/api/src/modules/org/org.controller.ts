import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ORG_LEVELS } from '@ipms/shared';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { OrgService } from './org.service';

class CreateOrgUnitDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsIn(ORG_LEVELS as unknown as string[]) level!: string;
  @IsOptional() @IsUUID() parentId?: string;
}

class UpdateOrgUnitDto {
  @IsOptional() @IsString() @Length(1, 255) nameVi?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsInt() version!: number;
}

@Controller('org-units')
export class OrgController {
  constructor(private org: OrgService) {}

  @Get()
  @RequirePermission('org:read')
  list(@CurrentUser() user: RequestUser) {
    return this.org.list(user.tenantId);
  }

  @Get(':id/tree')
  @RequirePermission('org:read')
  tree(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.tree(user.tenantId, id);
  }

  @Post()
  @RequirePermission('org:write')
  @Audited('org_unit.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrgUnitDto) {
    return this.org.create(user.tenantId, user.claims.sub, dto);
  }

  @Patch(':id')
  @RequirePermission('orgunit:update')
  @Audited('admin.orgunit_update')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitDto,
  ) {
    return this.org.update(user.tenantId, user.claims.sub, id, dto);
  }

  @Delete(':id')
  @RequirePermission('orgunit:archive')
  @Audited('admin.orgunit_archive')
  archive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.archive(user.tenantId, user.claims.sub, id);
  }
}
