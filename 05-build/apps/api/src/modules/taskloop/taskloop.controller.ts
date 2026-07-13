import {
  Body, Controller, Get, Ip, Param, ParseIntPipe, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { TaskLoopService } from './taskloop.service';

class ClaimDto {
  @IsUUID() orgUnitId!: string;
}

class FeedbackDto {
  @IsString() @Length(3, 4000) body!: string;
  @IsOptional() @IsIn(['optimize', 'defect', 'question']) category?: string;
}

class ReopenDto {
  @IsUUID() assigneeId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) feedbackIds?: string[];
  @IsOptional() @IsString() @Length(1, 1000) note?: string;
}

class ApproveActiveDto {
  @IsOptional() @IsString() @Length(1, 1000) note?: string;
}

/**
 * [Lát 4k] Vòng lặp tối ưu liên tục — claim/feedback/reopen/approve-active/revisions
 * (Spec Task Dictionary §7). Đường sửa payload tái dùng PATCH /library/contributions.
 */
@Controller()
export class TaskLoopController {
  constructor(private svc: TaskLoopService) {}

  // [4l] Bàn làm việc trưởng phòng — cells phòng mình + chưa chủ + hàng đợi phiếu
  // (path riêng /task-board, KHÔNG nằm dưới /task-cells để tránh nuốt bởi GET :code)
  @Get('task-board')
  @RequirePermission('taskcell:approve')
  board(@CurrentUser() user: RequestUser) {
    return this.svc.board(user);
  }

  // [4l] Đường TRA CỨU theo MÃ (dictionary không lộ id — F122): feedback + revisions
  @Get('task-dictionary/:code/feedback')
  @RequirePermission('task:feedback')
  listFeedbackByCode(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Query('status') status?: string,
  ) {
    if (status && !['open', 'triaged', 'reopened', 'resolved', 'wontfix'].includes(status)) {
      status = undefined;
    }
    return this.svc.listFeedbackByCode(user, code, status);
  }

  @Post('task-dictionary/:code/feedback')
  @RequirePermission('task:feedback')
  @Audited('task.feedback')
  createFeedbackByCode(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.svc.createFeedbackByCode(user, code, dto);
  }

  @Get('task-dictionary/:code/revisions')
  @RequirePermission('taskdict:read')
  listRevisionsByCode(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.svc.listRevisionsByCode(user, code);
  }

  @Get('task-dictionary/:code/revisions/:version')
  @RequirePermission('taskdict:read')
  getRevisionByCode(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.svc.getRevisionByCode(user, code, version);
  }

  @Post('task-cells/:id/claim')
  @RequirePermission('taskcell:approve')
  @Audited('task.claim')
  claim(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClaimDto,
  ) {
    return this.svc.claim(user, id, dto.orgUnitId);
  }

  @Get('task-cells/:id/feedback')
  @RequirePermission('task:feedback')
  listFeedback(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
  ) {
    // [F137] whitelist tại cửa — không thả giá trị lạ xuống query
    if (status && !['open', 'triaged', 'reopened', 'resolved', 'wontfix'].includes(status)) {
      status = undefined;
    }
    return this.svc.listFeedback(user, id, status);
  }

  @Post('task-cells/:id/feedback')
  @RequirePermission('task:feedback')
  @Audited('task.feedback')
  createFeedback(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.svc.createFeedback(user, id, dto);
  }

  @Post('task-cells/:id/reopen')
  @RequirePermission('task:reopen')
  @Audited('task.reopen')
  reopen(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenDto,
  ) {
    return this.svc.reopen(user, id, dto);
  }

  // [F131b] huỷ vòng tối ưu — lối thoát khỏi 'reopened' khi phiếu bị bỏ/giao nhầm người
  @Post('task-cells/:id/reopen-cancel')
  @RequirePermission('taskcell:approve')
  @Audited('task.reopen_cancel')
  reopenCancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveActiveDto,
  ) {
    return this.svc.reopenCancel(user, id, dto.note);
  }

  @Post('library/contributions/:id/approve-active')
  @RequirePermission('taskcell:approve')
  @Audited('task.activate')
  approveActive(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveActiveDto,
    @Ip() ip?: string,
  ) {
    return this.svc.approveActive(user, id, dto.note, ip);
  }

  // Lịch sử phiên bản cell CANONICAL = một phần tra cứu Từ điển → taskdict:read
  // (mọi persona; KHÔNG dùng taskcell:read — permission đó thuộc Config Studio version-scoped)
  @Get('task-cells/:id/revisions')
  @RequirePermission('taskdict:read')
  listRevisions(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listRevisions(user, id);
  }

  @Get('task-cells/:id/revisions/:version')
  @RequirePermission('taskdict:read')
  getRevision(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.svc.getRevision(user, id, version);
  }
}
