import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { IntegrationService } from './integration.service';

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

class ImportCsvDto {
  @IsString() @Length(1, 50) sourceSystem!: string;
  @IsOptional() @IsUUID() connectionId?: string;
  // [F25-style] trần 500 row/batch — batch lớn chia nhiều lần gọi
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  rows!: Array<Record<string, unknown>>;
}

@Controller('integrations')
export class IntegrationController {
  constructor(private integrations: IntegrationService) {}

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

  /** Import CSV (fallback ETL cho AIC/Salesforce/CRM) — validate data_contract, idempotent. */
  @Post('import/csv')
  @RequirePermission('integration:run')
  @Audited('integration.import_csv')
  importCsv(@CurrentUser() user: RequestUser, @Body() dto: ImportCsvDto) {
    return this.integrations.importCsv(user, dto);
  }
}
