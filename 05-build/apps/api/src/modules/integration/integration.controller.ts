import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Length,
  Matches,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { IntegrationService } from './integration.service';
import { OutboxDispatcher } from './outbox.dispatcher';
import { MorningTodosService } from './morning-todos.service';

class CreateConnectionDto {
  @IsIn(['notion', 'ms_planner', 'ms_todo', 'bravo', 'salesforce', 'crm', 'hris', 'csv']) provider!: string;
  @IsOptional() @IsString() @Length(1, 255) displayName?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

class CreateContractDto {
  @IsString() @Length(1, 50) provider!: string;
  @IsOptional() @IsIn(['in', 'out']) direction?: string;
  @IsObject() schema!: Record<string, unknown>;
}

class CreateBindingDto {
  @IsUUID() connectionId!: string;
  @IsString() @Length(1, 50) localType!: string; // 'evidence'|'morning_todos'|'goal'...
  @IsOptional() @IsUUID() localId?: string;
  @IsIn(['in', 'out', 'both']) direction!: string;
  @IsOptional() @IsObject() externalTarget?: Record<string, unknown>;
  @IsObject() fieldMap!: Record<string, unknown>;
  @IsOptional() @IsObject() syncPolicy?: Record<string, unknown>;
}

class ReplayOutboxDto {
  @IsIn(['skipped', 'dead']) status!: 'skipped' | 'dead';
  // id outbox_event (BIGINT — nhận string); bỏ trống = replay toàn bộ status đó của tenant
  @IsOptional() @IsArray() @ArrayMaxSize(500) @Matches(/^\d+$/, { each: true })
  eventIds?: string[];
}

class MorningTodosDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

class ImportCsvDto {
  @IsString() @Length(1, 50) sourceSystem!: string;
  @IsOptional() @IsUUID() connectionId?: string;
  // [F25-style] trần 500 row/batch — batch lớn chia nhiều lần gọi
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  rows!: Array<Record<string, unknown>>;
}

@Controller('integrations')
export class IntegrationController {
  constructor(
    private integrations: IntegrationService,
    private outbox: OutboxDispatcher,
    private morningTodos: MorningTodosService,
  ) {}

  @Post('connections')
  @RequirePermission('integration:connect')
  @Audited('integration_connection.create')
  createConnection(@CurrentUser() user: RequestUser, @Body() dto: CreateConnectionDto) {
    return this.integrations.createConnection(user, dto);
  }

  @Post('contracts')
  @RequirePermission('integration:bind')
  @Audited('data_contract.create')
  createContract(@CurrentUser() user: RequestUser, @Body() dto: CreateContractDto) {
    return this.integrations.createContract(user, dto as any);
  }

  @Get('runs')
  @RequirePermission('integration:run')
  listRuns(@CurrentUser() user: RequestUser) {
    return this.integrations.listRuns(user);
  }

  /** Binding local↔external — nền cho outbox dispatch + morning-todos (lát 4b). */
  @Post('bindings')
  @RequirePermission('integration:bind')
  @Audited('integration_binding.create')
  createBinding(@CurrentUser() user: RequestUser, @Body() dto: CreateBindingDto) {
    return this.integrations.createBinding(user, dto);
  }

  /** Đẩy outbox pending của tenant hiện tại (worker BullMQ dùng chung logic này). */
  @Post('outbox/dispatch')
  @RequirePermission('integration:run')
  @Audited('outbox.dispatch')
  dispatchOutbox(@CurrentUser() user: RequestUser) {
    return this.outbox.dispatchTenant(user.tenantId);
  }

  /** [F65] Replay event skipped/dead → pending (vd sau khi thêm binding khớp / hệ ngoài đã phục hồi). */
  @Post('outbox/replay')
  @RequirePermission('integration:run')
  @Audited('outbox.replay')
  replayOutbox(@CurrentUser() user: RequestUser, @Body() dto: ReplayOutboxDto) {
    return this.outbox.replayTenant(
      user.tenantId, dto.status, dto.eventIds?.map((id) => BigInt(id)),
    );
  }

  /** Job morning-todos: goal active/at_risk/off_track → todo hệ ngoài (mock) — idempotent theo ngày. */
  @Post('jobs/morning-todos/run')
  @RequirePermission('integration:run')
  @Audited('job.morning_todos')
  runMorningTodos(@CurrentUser() user: RequestUser, @Body() dto: MorningTodosDto) {
    return this.morningTodos.run(user, dto.date);
  }

  /** Import CSV (fallback ETL cho AIC/Salesforce/CRM) — validate data_contract, idempotent. */
  @Post('import/csv')
  @RequirePermission('integration:run')
  @Audited('integration.import_csv')
  importCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.integrations.importCsv(user, dto);
  }
}
