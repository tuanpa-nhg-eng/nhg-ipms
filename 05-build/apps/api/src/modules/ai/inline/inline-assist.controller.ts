import {
  Body, Controller, Param, ParseUUIDPipe, Post, UnprocessableEntityException,
} from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { InlineAssistService } from './inline-assist.service';
import { INLINE_TASKS, InlineTask } from './inline-assist.tasks';

class InlineAssistDto {
  @IsObject() input!: Record<string, unknown>;
  @IsOptional() @IsUUID() configVersionId?: string;
}

class DecideDto {
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  /** [Learning Loop L0] cờ "Sửa rồi chấp nhận" — outcome accepted_with_edits. */
  @IsOptional() @IsBoolean() edited?: boolean;
  /** Giá trị người dùng THẬT SỰ dùng sau khi sửa — diff proposed↔final. */
  @IsOptional() @IsObject() finalPayload?: Record<string, unknown>;
}

/**
 * [Lát AI inline] Nút "✦ AI gợi ý" — 4 tác vụ inline (một-phát, non-streaming).
 * Permission `ai:assist` (TÁCH khỏi ai:invoke): chỉ đọc + đẻ ai_suggestion PENDING.
 * Guard pipeline chuẩn Jwt → Tenant → Permission → Policy. Fail-closed mọi nhánh.
 */
@Controller()
export class InlineAssistController {
  constructor(private svc: InlineAssistService) {}

  @Post('ai/inline/:task')
  @RequirePermission('ai:assist')
  @Audited('ai_inline.assist')
  assist(@CurrentUser() user: RequestUser, @Param('task') task: string, @Body() dto: InlineAssistDto) {
    if (!(INLINE_TASKS as readonly string[]).includes(task)) {
      throw new UnprocessableEntityException(`task '${task}' không hợp lệ (${INLINE_TASKS.join(', ')})`);
    }
    // [F149] cap input theo BYTES như MCP args/Copilot context
    if (Buffer.byteLength(JSON.stringify(dto.input), 'utf8') > 16_384) {
      throw new UnprocessableEntityException('input tối đa 16KB');
    }
    return this.svc.assist(user, task as InlineTask, dto.input, dto.configVersionId);
  }

  /** Người tạo áp gợi ý vào form của mình → chốt accepted (KHÔNG materialize gì). */
  @Post('ai/inline/suggestions/:id/apply')
  @RequirePermission('ai:assist')
  @Audited('ai_inline.apply')
  apply(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    // [F149] finalPayload cap BYTES như input — corpus học không thành kênh bơm rác
    if (dto.finalPayload && Buffer.byteLength(JSON.stringify(dto.finalPayload), 'utf8') > 16_384) {
      throw new UnprocessableEntityException('finalPayload tối đa 16KB');
    }
    return this.svc.decide(user, id, 'accepted', {
      note: dto.note, edited: dto.edited, finalPayload: dto.finalPayload,
    });
  }

  /** Người tạo bỏ gợi ý → rejected. */
  @Post('ai/inline/suggestions/:id/dismiss')
  @RequirePermission('ai:assist')
  @Audited('ai_inline.dismiss')
  dismiss(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    return this.svc.decide(user, id, 'rejected', { note: dto.note });
  }
}
