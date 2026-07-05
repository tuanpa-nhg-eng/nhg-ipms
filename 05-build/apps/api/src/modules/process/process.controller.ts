import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID,
  Length, Min, ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { ProcessService } from './process.service';

class CreateProcessDto {
  @IsUUID() configVersionId!: string;
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() domain?: string;
}

class StepDto {
  @IsInt() @Min(1) seq!: number;
  @IsIn(['task', 'decision', 'milestone', 'approval', 'gateway']) type!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() responsibleRole?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class AddStepsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StepDto)
  steps!: StepDto[];
}

class EdgeDto {
  @IsUUID() fromStepId!: string;
  @IsUUID() toStepId!: string;
  @IsOptional() @IsString() condition?: string;
}

class AddEdgesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EdgeDto)
  edges!: EdgeDto[];
}

@Controller('processes')
export class ProcessController {
  constructor(private processes: ProcessService) {}

  @Get()
  @RequirePermission('process:design')
  list(@CurrentUser() user: RequestUser, @Query('configVersionId') configVersionId?: string) {
    return this.processes.list(user, configVersionId);
  }

  @Post()
  @RequirePermission('process:design')
  @Audited('process.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProcessDto) {
    return this.processes.create(user, dto);
  }

  @Post(':id/steps')
  @RequirePermission('process:design')
  @Audited('process.add_steps')
  addSteps(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddStepsDto) {
    return this.processes.addSteps(user, id, dto.steps);
  }

  @Post(':id/edges')
  @RequirePermission('process:design')
  @Audited('process.add_edges')
  addEdges(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEdgesDto) {
    return this.processes.addEdges(user, id, dto.edges);
  }

  /** Sinh Task Cell từ step type=task (idempotent) — feed Auto-Derivation Engine. */
  @Post(':id/generate-cells')
  @RequirePermission('process:design')
  @Audited('process.generate_cells')
  generateCells(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.processes.generateCells(user, id);
  }
}
