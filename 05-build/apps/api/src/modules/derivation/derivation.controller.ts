import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, isUUID, Length, Min,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { DerivationService } from './derivation.service';

class CreateRuleDto {
  @IsUUID() configVersionId!: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsObject() match!: Record<string, unknown>; // {function_codes[],role_family_codes[],org_level[],grade[]}
  @IsObject() emit!: Record<string, unknown>;  // {kpi_template_codes[],task_cell_refs[],weight,group_label}
  @IsOptional() @IsString() note?: string;
}

class CreateTemplateDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsIn(['manual', 'system']) method?: string;
  @IsOptional() @IsIn(['forward', 'reverse']) direction?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsIn(['weekly', 'monthly', 'quarterly', 'yearly']) frequency?: string;
  @IsOptional() @IsString() @Length(1, 500) formulaExpr?: string;
  @IsOptional() defaultTier?: unknown;
  @IsOptional() @IsArray() functionTags?: string[];
  @IsOptional() @IsArray() roleFamilyCodes?: string[];
  @IsOptional() @IsArray() taskCellRefs?: string[];
}

class RunDto {
  @IsUUID() configVersionId!: string;
  @IsOptional() @IsIn(['org_change', 'process_change', 'people_change', 'manual']) trigger?: string;
}

@Controller()
export class DerivationController {
  constructor(private derivation: DerivationService) {}

  @Get('derivation-rules')
  @RequirePermission('derivation:run')
  listRules(@CurrentUser() user: RequestUser, @Query('configVersionId') configVersionId: string) {
    // [F88][F74] uuid tại cửa — thiếu/rác không được thành "trả hết rules" hay 500
    if (!configVersionId || !isUUID(configVersionId)) {
      throw new UnprocessableEntityException('Cần configVersionId (uuid)');
    }
    return this.derivation.listRules(user, configVersionId);
  }

  @Post('derivation-rules')
  @RequirePermission('config:write')
  @Audited('derivation_rule.create')
  createRule(@CurrentUser() user: RequestUser, @Body() dto: CreateRuleDto) {
    return this.derivation.createRule(user, dto as any);
  }

  @Post('kpi-templates')
  @RequirePermission('config:write')
  @Audited('kpi_template.create')
  createTemplate(@CurrentUser() user: RequestUser, @Body() dto: CreateTemplateDto) {
    return this.derivation.createTemplate(user, dto);
  }

  /** [Lát 4e] Thư viện KPI template (picker cho emit của rule — RLS trả global + tenant). */
  @Get('kpi-templates')
  @RequirePermission('config:read')
  listTemplates(@CurrentUser() user: RequestUser) {
    return this.derivation.listTemplates(user);
  }

  /** Chạy engine → PREVIEW (diff + reason explainable). Không ghi cấu hình. */
  @Post('derivation/run')
  @RequirePermission('derivation:run')
  @Audited('derivation.run')
  run(@CurrentUser() user: RequestUser, @Body() dto: RunDto) {
    return this.derivation.run(user, dto);
  }

  @Get('derivation/runs/:id')
  @RequirePermission('derivation:run')
  getRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.derivation.getRun(user, id);
  }

  /** Apply preview vào DRAFT (chưa publish — publish là bước SoD riêng). */
  @Post('derivation/runs/:id/apply')
  @RequirePermission('derivation:run')
  apply(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.derivation.apply(user, id);
  }
}
