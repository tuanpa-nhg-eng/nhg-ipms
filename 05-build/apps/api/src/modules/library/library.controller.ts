import {
  Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { LibraryService } from './library.service';
import type { CellPayload, ContributionType } from './quality-gate';

class CreateContributionDto {
  @IsIn(['task_cell', 'kpi', 'task_cell_with_kpi']) type!: ContributionType;
  @IsObject() payload!: CellPayload;
  @IsOptional() @IsUUID() orgUnitId?: string;
  @IsOptional() @IsUUID() functionId?: string;
  @IsOptional() @IsIn(['tenant', 'group']) targetScope?: 'tenant' | 'group';
}

class UpdateContributionDto {
  @IsOptional() @IsObject() payload?: CellPayload;
  @IsOptional() @IsIn(['tenant', 'group']) targetScope?: string;
}

class ReviewDto {
  @IsIn(['comment', 'request_changes', 'approve', 'reject']) action!: string;
  @IsOptional() @IsString() @Length(1, 1000) note?: string;
}

class ResolveDedupDto {
  @IsIn(['merge', 'keep_both', 'discard']) resolution!: string;
}

class CreateLibTemplateDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) nameVi!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() @Length(1, 50) domain?: string;
  @IsOptional() @IsObject() schema?: object;
}

class ImportDto {
  @IsOptional() @IsUUID() templateId?: string;
  @IsIn(['as_local', 'as_submission', 'as_canonical']) mode!: string;
  @IsOptional() @IsUUID() configVersionId?: string;
  @IsOptional() @IsUUID() orgUnitId?: string; // [F92b] bắt buộc với người import scope org_unit
  @IsOptional() @IsString() @Length(1, 500) sourceRef?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  rows!: CellPayload[];
}

const CONTRIB_STATUSES = [
  'draft', 'submitted', 'in_review', 'needs_changes', 'approved', 'rejected', 'deprecated', 'published',
];

/**
 * BU Authoring Gate (Spec_BU_Authoring_Gate §9 + §6.5) — cổng BU tự soạn Task Cell gắn KPI.
 * SoD: bu_author (library:submit) ⟂ library_curator (library:curate/publish).
 */
@Controller('library')
export class LibraryController {
  constructor(private library: LibraryService) {}

  // ===== Author =====

  @Post('contributions')
  @RequirePermission('library:submit')
  @Audited('library.contribution_create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateContributionDto) {
    return this.library.create(user, dto);
  }

  @Patch('contributions/:id')
  @RequirePermission('library:submit')
  @Audited('library.contribution_update')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContributionDto) {
    return this.library.update(user, id, dto);
  }

  @Post('contributions/:id/submit')
  @RequirePermission('library:submit')
  @Audited('library.submit')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.submit(user, id);
  }

  /** Author xem CHỈ contribution của mình. */
  @Get('contributions')
  @RequirePermission('library:submit')
  listMine(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    if (status && !CONTRIB_STATUSES.includes(status)) {
      throw new UnprocessableEntityException('status không hợp lệ');
    }
    return this.library.listMine(user, status);
  }

  // ===== Curation =====

  /** Hàng đợi curation — mặc định submitted/in_review. */
  @Get('queue')
  @RequirePermission('library:curate')
  listQueue(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    if (status && !CONTRIB_STATUSES.includes(status)) {
      throw new UnprocessableEntityException('status không hợp lệ');
    }
    return this.library.listQueue(user, status);
  }

  @Post('contributions/:id/review')
  @RequirePermission('library:curate')
  @Audited('library.review')
  review(
    @CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto, @Ip() ip: string,
  ) {
    return this.library.review(user, id, dto.action, dto.note, ip);
  }

  @Post('contributions/:id/publish')
  @RequirePermission('library:publish')
  @Audited('library.publish')
  publish(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Ip() ip: string) {
    return this.library.publish(user, id, ip);
  }

  @Get('dedup')
  @RequirePermission('library:curate')
  listDedup(@CurrentUser() user: RequestUser, @Query('contribution', ParseUUIDPipe) contributionId: string) {
    return this.library.listDedup(user, contributionId);
  }

  @Post('dedup/:id/resolve')
  @RequirePermission('library:curate')
  @Audited('library.dedup_resolve')
  resolveDedup(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDedupDto) {
    return this.library.resolveDedup(user, id, dto.resolution);
  }

  @Post('task-cells/:id/deprecate')
  @RequirePermission('library:deprecate')
  @Audited('library.deprecate')
  deprecate(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.deprecate(user, id);
  }

  // ===== Import từ template chuẩn hoá (§6.5) =====

  @Get('templates')
  @RequirePermission('library:import')
  listTemplates(@CurrentUser() user: RequestUser) {
    return this.library.listTemplates(user);
  }

  /** Pack template do curator/B1 phát hành. */
  @Post('templates')
  @RequirePermission('library:curate')
  @Audited('library.template_create')
  createTemplate(@CurrentUser() user: RequestUser, @Body() dto: CreateLibTemplateDto) {
    return this.library.createTemplate(user, dto);
  }

  /** Import preview — không ghi thư viện; as_canonical đòi thêm library:import:canonical. */
  @Post('import')
  @RequirePermission('library:import')
  @Audited('library.import_preview')
  importPreview(@CurrentUser() user: RequestUser, @Body() dto: ImportDto) {
    return this.library.importPreview(user, dto);
  }

  @Get('import-runs/:id')
  @RequirePermission('library:import')
  getImportRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.getImportRun(user, id);
  }

  @Post('import-runs/:id/apply')
  @RequirePermission('library:import')
  @Audited('library.import_apply')
  applyImport(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.library.applyImport(user, id);
  }
}
