import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsOptional, IsString, Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { EvalService } from './eval.service';

class EvalCaseDto {
  @IsOptional() @IsString() @Length(1, 255) name?: string;
  @IsObject() input!: { prompt: string; context?: unknown; promptVersion?: string };
  @IsOptional() expected?: unknown;
  // rỗng → service trả 422 fail-closed (case không assertion không được phép tồn tại)
  @IsArray() assertions!: Array<Record<string, unknown>>;
}

class CreateSuiteDto {
  @IsString() @Length(1, 100) agent!: string;
  @IsString() @Length(1, 255) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => EvalCaseDto)
  cases!: EvalCaseDto[];
}

/** AI eval harness (#10) — permission ai:eval; chạy trên mock ⇒ tất định, gắn CI được. */
@Controller('ai/eval')
export class EvalController {
  constructor(private evals: EvalService) {}

  @Post('suites')
  @RequirePermission('ai:eval')
  @Audited('ai_eval_suite.create')
  createSuite(@CurrentUser() user: RequestUser, @Body() dto: CreateSuiteDto) {
    return this.evals.createSuite(user, dto as any);
  }

  @Get('suites')
  @RequirePermission('ai:eval')
  listSuites(@CurrentUser() user: RequestUser) {
    return this.evals.listSuites(user);
  }

  @Post('suites/:id/run')
  @RequirePermission('ai:eval')
  @Audited('ai_eval_run.execute')
  run(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.evals.run(user, id);
  }

  @Get('runs/:id')
  @RequirePermission('ai:eval')
  getRun(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.evals.getRun(user, id);
  }
}
