import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { KpiService } from './kpi.service';

class ScoreTierDto {
  @IsNumber() @Min(0) @Max(999) minPct!: number;
  @IsNumber() @Min(0) @Max(1000) score!: number; // thang tuyệt đối hoặc 0–100 — engine normalize (F16)
}

class UpdateFormulaDto {
  @IsString() @Length(1, 500) expression!: string;
}

class CreateKpiDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() definition?: string;
  @IsIn(['manual', 'system']) method!: string;
  @IsIn(['forward', 'reverse']) direction!: string;
  @IsOptional() @IsString() unit?: string;
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly']) frequency!: string;
  @IsOptional() @IsString() dataSource?: string;
  @IsOptional() @IsString() taskCellRef?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(1, 500) formulaExpression?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ScoreTierDto)
  scoreTiers?: ScoreTierDto[];
}

@Controller('kpis')
export class KpiController {
  constructor(private kpis: KpiService) {}

  @Get()
  @RequirePermission('kpi:read')
  list(@CurrentUser() user: RequestUser) {
    return this.kpis.list(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('kpi:read')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kpis.get(user.tenantId, id);
  }

  @Post()
  @RequirePermission('kpi:write')
  @Audited('kpi.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateKpiDto) {
    return this.kpis.create(user.tenantId, user.claims.sub, dto);
  }

  /** [F18] Cập nhật công thức — tạo version mới immutable, giữ bản cũ cho recompute. */
  @Post(':id/formula')
  @RequirePermission('kpi:write')
  @Audited('kpi.formula_update')
  updateFormula(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormulaDto,
  ) {
    return this.kpis.updateFormula(user.tenantId, user.claims.sub, id, dto.expression);
  }

  /** Human-in-the-loop: duyệt KPI (draft → active). */
  @Post(':id/approve')
  @RequirePermission('kpi:approve')
  @Audited('kpi.approve')
  approve(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kpis.approve(user.tenantId, user.claims.sub, id, user.claims.person_id);
  }
}
