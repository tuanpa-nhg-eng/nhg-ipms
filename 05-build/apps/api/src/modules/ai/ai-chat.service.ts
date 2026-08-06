import { Injectable, NotFoundException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { AiGatewayService } from './ai-gateway.service';
import { LlmStreamChunk } from './llm/llm-client';

/**
 * [P1 Copilot] Phiên hội thoại Copilot — persist ai_conversation/ai_message,
 * stream trả lời qua ai-gateway (mock/Claude), và tạo ai_suggestion (HITL) khi
 * AI đề xuất thay đổi. Đề xuất vào HÀNG CHỜ pending — người có quyền duyệt riêng
 * (không tự áp vào cấu hình — bất biến human-in-the-loop).
 */
@Injectable()
export class AiChatService {
  constructor(private prisma: PrismaService, private gateway: AiGatewayService) {}

  /** Bộ chọn model (picker) — registry tối thiểu; P2 chuyển sang bảng ai_model config-as-data. */
  listModels() {
    return {
      backendNote: 'MOCK đang bật (chưa có API key). Bật cờ ai_gateway_live + key ⇒ Claude thật.',
      models: [
        { code: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic', recommended: true },
        { code: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' },
        { code: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
        { code: 'claude-fable-5', label: 'Claude Fable 5', provider: 'anthropic' },
        { code: 'self-hosted', label: 'Gemma (self-host)', provider: 'self_hosted', disabled: true },
      ],
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    };
  }

  listConversations(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiConversation.findMany({
        where: { userId: user.claims.sub, deletedAt: null },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    );
  }

  getConversation(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const conv = await tx.aiConversation.findFirst({
        where: { id, userId: user.claims.sub, deletedAt: null },
      });
      if (!conv) throw new NotFoundException('Phiên hội thoại không tồn tại');
      const messages = await tx.aiMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      return { conversation: conv, messages };
    });
  }

  /**
   * Stream trọn một lượt: persist tin người dùng → stream trả lời (đẩy chunk qua onChunk)
   * → persist tin AI + (nếu có) tạo ai_suggestion pending. Trả conversationId cho FE.
   */
  async streamTurn(
    user: RequestUser,
    input: { conversationId?: string; message: string; model?: string; effort?: string; context?: unknown },
    onChunk: (c: LlmStreamChunk & { conversationId?: string }) => void,
    shouldStop?: () => boolean, // [F146] client ngắt kết nối → dừng vòng, không ghi tiếp
  ): Promise<void> {
    const message = input.message.trim();

    // 1) Resolve/khởi tạo phiên + ghi tin người dùng (1 tx)
    const convId = await this.prisma.withTenant(user.tenantId, async (tx) => {
      let id = input.conversationId;
      if (id) {
        const exists = await tx.aiConversation.findFirst({
          where: { id, userId: user.claims.sub, deletedAt: null }, select: { id: true },
        });
        if (!exists) throw new NotFoundException('Phiên hội thoại không tồn tại');
      } else {
        id = uuidv7();
        await tx.aiConversation.create({
          data: {
            id, tenantId: user.tenantId, userId: user.claims.sub,
            title: message.slice(0, 60) || 'Hội thoại mới',
            contextRef: (input.context ?? undefined) as object,
          },
        });
      }
      await tx.aiMessage.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, conversationId: id!,
          role: 'user', content: message,
        },
      });
      return id!;
    });
    onChunk({ type: 'text', text: '', conversationId: convId });

    // 2) Stream trả lời qua gateway (mock/Claude) — tích luỹ để persist
    let acc = '';
    const toolCalls: Array<{ toolName?: string; toolInput?: unknown }> = [];
    let suggestion: LlmStreamChunk['suggestion'];
    let model = 'mock';
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    for await (const chunk of this.gateway.stream(
      user,
      {
        agent: 'config_copilot', prompt: message, context: input.context, promptVersion: 'copilot-v1',
        model: input.model, effort: input.effort, // [F147] forward lựa chọn picker cho client thật
        // [Trục D L1 — N2] Nhóm dữ liệu Copilot chạm tới. Khai TRÙNG hiến chương của
        // `config_copilot` trong danh bạ — gateway kiểm chéo (khai ngoài phạm vi ⇒ chặn), nên
        // hai nơi lệch nhau sẽ đỏ chứ không âm thầm nới.
        dataAssets: ['objective.kpi', 'task.dictionary'],
      },
      'copilot.chat',
    )) {
      if (shouldStop?.()) break; // [F146] client đã đóng — dừng, vẫn persist phần đã nhận
      if (chunk.type === 'text' && chunk.text) acc += chunk.text;
      if (chunk.type === 'tool_use') toolCalls.push({ toolName: chunk.toolName, toolInput: chunk.toolInput });
      if (chunk.type === 'suggestion') suggestion = chunk.suggestion;
      if (chunk.type === 'done' && chunk.usage) {
        model = chunk.usage.model; tokensIn = chunk.usage.tokensIn; tokensOut = chunk.usage.tokensOut;
      }
      onChunk(chunk);
    }

    // 3) Tạo ai_suggestion pending (HITL) nếu AI đề xuất thay đổi + persist tin AI (1 tx)
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      let suggestionId: string | undefined;
      if (suggestion) {
        suggestionId = uuidv7();
        await tx.aiSuggestion.create({
          data: {
            id: suggestionId, tenantId: user.tenantId,
            type: suggestion.type, payload: (suggestion.payload ?? {}) as object,
            reason: suggestion.reason, status: 'pending',
            createdByTool: toolCalls[0]?.toolName ?? 'copilot.chat',
            createdBy: user.claims.sub,
          },
        });
      }
      await tx.aiMessage.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, conversationId: convId,
          role: 'assistant', content: acc, model,
          toolCalls: toolCalls.length ? (toolCalls as object) : undefined,
          suggestionId, tokensIn, tokensOut,
        },
      });
      await tx.aiConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });
      if (suggestionId) onChunk({ type: 'suggestion', suggestion: { ...suggestion!, payload: { suggestionId } } });
    });
  }
}
