import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { AdminRolesService } from './admin-roles.service';

const SCOPE_TYPES = ['tenant', 'org_unit', 'self'] as const;

// granteeId đến từ :id trên path (không từ body) — một nguồn sự thật duy nhất, tránh
// body/path lệch nhau (path đã qua ParseUUIDPipe, không cần validate lại).
class AssignRoleDto {
  @IsString() roleCode!: string;
  @IsIn(SCOPE_TYPES as unknown as string[]) scopeType!: 'tenant' | 'org_unit' | 'self';
  @IsOptional() @IsUUID() scopeId?: string;
}

@Controller('admin')
export class AdminRolesController {
  constructor(private svc: AdminRolesService) {}

  @Get('roles')
  @RequirePermission('role:read')
  roles(@CurrentUser() user: RequestUser) {
    return this.svc.list(user);
  }

  @Post('users/:id/roles')
  @RequirePermission('role:assign')
  @Audited('admin.role_grant')
  assign(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) granteeId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.svc.assign(user, { ...dto, granteeId });
  }

  @Delete('users/:id/roles/:userRoleId')
  @RequirePermission('role:revoke')
  @Audited('admin.role_revoke')
  revoke(
    @CurrentUser() user: RequestUser,
    @Param('userRoleId', ParseUUIDPipe) userRoleId: string,
  ) {
    return this.svc.revoke(user, userRoleId);
  }

  @Get('users/:id/effective-access')
  @RequirePermission('user:read')
  effectiveAccess(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.effectiveAccess(user, id);
  }
}
