import {
  Body, Controller, Get, Ip, Param, Patch, Post, Query, UnprocessableEntityException,
} from '@nestjs/common';
import {
  IsArray, IsInt, IsOptional, IsString, Length, Matches, Min,
} from 'class-validator';
import {
  Audited, CurrentUser, PolicyExempt, RequirePermission, RequestUser,
} from '../../common/auth/decorators';
import { PolicyService } from './policy.service';
import type { PolicyTestCase } from './cedar.engine';

class CreatePolicyDto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 10_000) policyText!: string;
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{0,30}$/) scope?: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  @IsOptional() @IsArray() tests?: PolicyTestCase[];
}

class UpdatePolicyDto {
  @IsOptional() @IsString() @Length(1, 10_000) policyText?: string;
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{0,30}$/) scope?: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  @IsOptional() @IsArray() tests?: PolicyTestCase[];
}

class TestPolicyDto {
  @IsOptional() @IsArray() cases?: PolicyTestCase[];
}

class StatusChangeDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

/**
 * Policy-as-Code (#2) — CRUD access_policy (Cedar) + test harness + activate/disable.
 * SoD như config version: designer soạn (config:write) ⟂ approver kích hoạt (config:publish).
 */
@Controller('policies')
export class PolicyController {
  constructor(private policies: PolicyService) {}

  @Get()
  @RequirePermission('config:read')
  @PolicyExempt() // [F68] kênh quan sát khi có policy hỏng deny diện rộng
  list(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    if (status && !['draft', 'active', 'disabled'].includes(status)) {
      throw new UnprocessableEntityException('status không hợp lệ');
    }
    return this.policies.list(user, status);
  }

  @Get(':id')
  @RequirePermission('config:read')
  @PolicyExempt() // [F68]
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.policies.get(user, id);
  }

  @Post()
  @RequirePermission('config:write')
  @Audited('policy.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePolicyDto) {
    return this.policies.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission('config:write')
  @Audited('policy.update')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePolicyDto) {
    return this.policies.update(user, id, dto);
  }

  /** Chạy bộ test allow/deny của policy (+ case ad-hoc) — không đổi trạng thái. */
  @Post(':id/test')
  @RequirePermission('config:read')
  test(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: TestPolicyDto) {
    return this.policies.test(user, id, dto.cases);
  }

  @Post(':id/activate')
  @RequirePermission('config:publish')
  @Audited('policy.activate')
  activate(
    @CurrentUser() user: RequestUser, @Param('id') id: string,
    @Body() dto: StatusChangeDto, @Ip() ip: string,
  ) {
    return this.policies.activate(user, id, dto.expectedVersion, ip);
  }

  @Post(':id/disable')
  @RequirePermission('config:publish')
  @PolicyExempt() // [F68] van an toàn: policy forbid config:publish không được tự khoá đường tắt chính nó
  @Audited('policy.disable')
  disable(
    @CurrentUser() user: RequestUser, @Param('id') id: string,
    @Body() dto: StatusChangeDto, @Ip() ip: string,
  ) {
    return this.policies.disable(user, id, dto.expectedVersion, ip);
  }
}
