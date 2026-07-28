import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import {
  IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { AdminUsersService } from './admin-users.service';

class ListUsersQueryDto {
  @IsOptional() @IsString() @Length(0, 120) q?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsIn(['active', 'disabled']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() @Length(0, 60) cursor?: string;
}

class CreateUserDto {
  @IsString() @Length(1, 50) employeeCode!: string;
  @IsString() @Length(1, 255) fullName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @IsUUID() positionId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 255) fullName?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() managerId?: string | null;
  @IsOptional() @IsUUID() positionId?: string | null;
  @IsInt() version!: number;
}

/**
 * [Trục B L1] Quản trị người dùng — permission user:read/write/invite/deactivate.
 * Mọi mutation audited + J7 optimistic lock + J5 whitelist select (xem service).
 */
@Controller('admin/users')
export class AdminUsersController {
  constructor(private svc: AdminUsersService) {}

  @Get()
  @RequirePermission('user:read')
  list(@CurrentUser() user: RequestUser, @Query() q: ListUsersQueryDto) {
    return this.svc.list(user, q);
  }

  @Post()
  @RequirePermission('user:invite')
  @Audited('admin.user_invite')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('user:write')
  @Audited('admin.user_update')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/disable')
  @RequirePermission('user:deactivate')
  disable(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.disable(user, id);
  }

  @Post(':id/enable')
  @RequirePermission('user:deactivate')
  enable(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.enable(user, id);
  }
}
