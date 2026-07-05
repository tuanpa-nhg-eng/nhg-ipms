import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { StrategyService } from './strategy.service';

class CreateObjectiveDto {
  @IsIn(['okr', 'kgi']) kind!: 'okr' | 'kgi';
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsString() @Length(1, 20) period!: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsUUID() themeId?: string;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
}

@Controller('objectives')
export class StrategyController {
  constructor(private strategy: StrategyService) {}

  @Get()
  @RequirePermission('strategy:read')
  list(@CurrentUser() user: RequestUser) {
    return this.strategy.list(user.tenantId);
  }

  @Post()
  @RequirePermission('strategy:write')
  @Audited('objective.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateObjectiveDto) {
    return this.strategy.create(user.tenantId, user.claims.sub, dto);
  }

  /** Cây cascade OKR → KGI → Goal (lineage explainable). */
  @Get(':id/cascade')
  @RequirePermission('strategy:read')
  cascade(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.strategy.cascade(user.tenantId, id);
  }
}
