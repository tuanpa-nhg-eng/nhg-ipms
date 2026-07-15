import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CurrentUser, RequirePermission, RequestUser } from '../../common/auth/decorators';
import { AiChatService } from './ai-chat.service';

class ChatDto {
  @IsOptional() @IsUUID() conversationId?: string;
  @IsString() @Length(1, 4000) message!: string;
  @IsOptional() @IsString() @Length(1, 64) model?: string;
  @IsOptional() @IsString() @Length(1, 16) effort?: string;
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

/**
 * [P1 Copilot] Trợ lý AI toàn cục — chat streaming (SSE) trên nền ai-gateway (mock/Claude).
 * Guard: ai:invoke (như MCP). Streaming qua @Res raw write (POST không dùng @Sse của GET).
 */
@Controller()
export class AiChatController {
  constructor(private chat: AiChatService) {}

  @Get('ai/models')
  @RequirePermission('ai:invoke')
  models() {
    return this.chat.listModels();
  }

  @Get('ai/conversations')
  @RequirePermission('ai:invoke')
  conversations(@CurrentUser() user: RequestUser) {
    return this.chat.listConversations(user);
  }

  @Get('ai/conversations/:id')
  @RequirePermission('ai:invoke')
  conversation(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getConversation(user, id);
  }

  @Post('ai/chat')
  @RequirePermission('ai:invoke')
  async chatStream(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ): Promise<void> {
    // [F149] cap context theo BYTES như MCP (16KB) — chặn bloat DB/log
    if (dto.context && Buffer.byteLength(JSON.stringify(dto.context), 'utf8') > 16_384) {
      throw new UnprocessableEntityException('context tối đa 16KB');
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // [F146] client ngắt (đóng tab/panel/mất mạng) → dừng ghi, dừng vòng stream
    let aborted = false;
    res.on('close', () => { aborted = true; });
    const send = (obj: unknown) => {
      if (aborted || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    try {
      await this.chat.streamTurn(
        user,
        { conversationId: dto.conversationId, message: dto.message, model: dto.model, effort: dto.effort, context: dto.context },
        (chunk) => send(chunk),
        () => aborted,
      );
    } catch (e) {
      send({ type: 'error', error: (e as Error).message });
    } finally {
      send({ type: 'end' });
      if (!aborted && !res.writableEnded) res.end();
    }
  }
}
