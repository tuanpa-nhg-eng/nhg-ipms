import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
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
}
