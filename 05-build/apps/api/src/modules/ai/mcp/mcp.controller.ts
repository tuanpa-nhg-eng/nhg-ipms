import {
  Body, Controller, Get, Param, Post, Query, UnprocessableEntityException,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Audited, CurrentUser, RequirePermission, RequestUser } from '../../../common/auth/decorators';
import { McpService } from './mcp.service';

class InvokeToolDto {
  @IsOptional() @IsObject() args?: Record<string, unknown>;
}

class DecideSuggestionDto {
  @IsOptional() @IsUUID() configVersionId?: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
}

/**
 * MCP server (#3) — transport HTTP nội bộ, shape tool tương thích MCP.
 * Guard pipeline chuẩn: Jwt → Tenant → Permission (ai:invoke) + scope_permission per-tool.
 */
@Controller()
export class McpController {
  constructor(private mcp: McpService) {}

  @Get('mcp/tools')
  @RequirePermission('ai:invoke')
  listTools(@CurrentUser() user: RequestUser) {
    return this.mcp.listTools(user);
  }

  @Post('mcp/tools/:name/invoke')
  @RequirePermission('ai:invoke')
  @Audited('mcp.tool_invoke')
  invoke(
    @CurrentUser() user: RequestUser,
    @Param('name') name: string,
    @Body() dto: InvokeToolDto,
  ) {
    if (!/^[a-z0-9._-]{1,100}$/.test(name)) {
      throw new UnprocessableEntityException('Tên tool không hợp lệ');
    }
    // [F60][F64] cap kích thước args theo BYTES — chặn payload khổng lồ vào DB/log
    if (dto.args && Buffer.byteLength(JSON.stringify(dto.args), 'utf8') > 16_384) {
      throw new UnprocessableEntityException('args tối đa 16KB');
    }
    return this.mcp.invoke(user, name, dto.args ?? {});
  }

  // ===== ai_suggestion — human-in-the-loop =====

  @Get('ai/suggestions')
  @RequirePermission('config:read')
  listSuggestions(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    if (status && !['pending', 'accepted', 'rejected'].includes(status)) {
      throw new UnprocessableEntityException('status không hợp lệ');
    }
    return this.mcp.listSuggestions(user, status);
  }

  @Post('ai/suggestions/:id/accept')
  @RequirePermission('config:write')
  @Audited('ai_suggestion.accept')
  accept(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DecideSuggestionDto) {
    return this.mcp.accept(user, id, dto);
  }

  @Post('ai/suggestions/:id/reject')
  @RequirePermission('config:write')
  @Audited('ai_suggestion.reject')
  reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: DecideSuggestionDto) {
    return this.mcp.reject(user, id, dto.note);
  }
}
