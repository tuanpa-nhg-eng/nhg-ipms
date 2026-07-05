import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Length,
  ValidateNested,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { EvidenceService } from './evidence.service';

const EVIDENCE_TYPES = ['task', 'milestone', 'document', 'approval', 'ticket', 'sla', 'feedback', 'metric', 'ai_log'];

class CreateEvidenceDto {
  @IsIn(EVIDENCE_TYPES) type!: string;
  @IsOptional() @IsString() @Length(1, 50) sourceSystem?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() uri?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsUUID() relatedGoalId?: string;
  @IsOptional() @IsUUID() relatedKpiId?: string;
  @IsOptional() @IsString() taskCellRef?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}

class ReviewEvidenceDto {
  @IsIn(['verified', 'rejected']) decision!: 'verified' | 'rejected';
}

class BulkRecordDto {
  @IsString() @Length(1, 255) externalId!: string;
  @IsIn(EVIDENCE_TYPES) type!: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() uri?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() relatedKpiCode?: string;
  @IsOptional() @IsString() ownerEmployeeCode?: string;
  @IsOptional() @IsString() taskCellRef?: string;
}

class BulkSyncDto {
  @IsString() @Length(1, 50) sourceSystem!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BulkRecordDto)
  records!: BulkRecordDto[];
}

@Controller('evidence')
export class EvidenceController {
  constructor(private evidence: EvidenceService) {}

  @Get()
  @RequirePermission('evidence:read')
  list(
    @CurrentUser() user: RequestUser,
    @Query('kpiId') kpiId?: string,
    @Query('status') status?: string,
  ) {
    return this.evidence.list(user.tenantId, { kpiId, status });
  }

  @Post()
  @RequirePermission('evidence:write')
  @Audited('evidence.create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEvidenceDto) {
    return this.evidence.create(user.tenantId, user.claims.sub, user.claims.person_id, dto);
  }

  /** Human-in-the-loop: verify/reject. */
  @Post(':id/verify')
  @RequirePermission('evidence:verify')
  @Audited('evidence.verify')
  review(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewEvidenceDto,
  ) {
    return this.evidence.review(user.tenantId, user.claims.sub, user.claims.person_id, id, dto.decision);
  }

  /** Connector bulk sync — idempotent theo (source, external_id). Fallback CSV/ETL. */
  @Post('bulk')
  @RequirePermission('integration:run')
  @Audited('evidence.bulk_sync')
  bulk(@CurrentUser() user: RequestUser, @Body() dto: BulkSyncDto) {
    return this.evidence.bulkUpsert(user.tenantId, user.claims.sub, dto.sourceSystem, dto.records);
  }
}
