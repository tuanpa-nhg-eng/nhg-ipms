import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import { AiGatewayService } from './ai-gateway.service';
import { LlmStreamChunk } from './llm/llm-client';
import { dataAssetsFor } from './call-site-data-assets';
import { AiAgentService } from './agents/ai-agent.service';

/** [Trục D L2] Mã agent của Copilot chat trong danh bạ — một hằng, không rải chuỗi. */
const COPILOT_AGENT_CODE = 'config_copilot';

/**
 * [P1 Copilot] Phiên hội thoại Copilot — persist ai_conversation/ai_message,
 * stream trả lời qua ai-gateway (mock/Claude), và tạo ai_suggestion (HITL) khi
 * AI đề xuất thay đổi. Đề xuất vào HÀNG CHỜ pending — người có quyền duyệt riêng
 * (không tự áp vào cấu hình — bất biến human-in-the-loop).
 */
@Injectable()
export class AiChatService {
  // [Trục D L2 — N8] Đề xuất bị BỎ phải nhìn thấy được ở log vận hành, không im lặng.
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: AiGatewayService,
    // [Trục D L2] Hiến chương agent — nguồn duy nhất cho hitlMode ở đường chat.
    private agents: AiAgentService,
  ) {}

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
        // [F220] Không còn literal ở đây. Cùng một sự thật (agent này chạm nhóm nào) trước
        // đây khai ở BA nơi mà không nơi nào kiểm chéo nơi nào lúc build — lệch chỉ lộ bằng
        // 403 trên đường người dùng thật. Nay một bảng, có test đối chiếu ⊆ hiến chương.
        dataAssets: dataAssetsFor('config_copilot'),
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
    /**
     * [Trục D L2 — N8] Copilot chat CŨNG là một bề mặt HITL: nó đẻ `ai_suggestion`. Lỗ này
     * tìm được khi viết ca kiểm cho "đường 3" — tôi đã đinh ninh đường này chỉ chuyển tiếp
     * ngữ cảnh và không có hành vi nào cần gác, rồi chính phép đo bác lại.
     *
     * `hitlMode` phải gác ở ĐỦ ba đường đẻ suggestion (MCP · inline · chat), nếu không thì
     * một đường không gác là đủ vô hiệu hoá bất biến — đúng bài học `POST /ai/chat` của trục C
     * mà L1 đã phải học một lần cho ba cổng N1/N2/N3.
     */
    if (suggestion) {
      const agentDef = await this.agents.resolve(user.tenantId, COPILOT_AGENT_CODE);
      if (agentDef.hitlMode !== 'propose_only') {
        /**
         * BỎ đề xuất, KHÔNG ném — vá theo soát lớp 1.
         *
         * Bản đầu của tôi ném `ForbiddenException` ở đây. Nhưng chỗ này nằm SAU khi đã stream
         * xong câu trả lời và TRƯỚC khi ghi tin nhắn AI: ném ở đây làm người dùng vừa đọc xong
         * câu trả lời thì thấy lỗi, **và tin nhắn đó biến mất khỏi lịch sử hội thoại**. Một
         * bất biến về đề xuất không được phép ăn mất phần sản phẩm đang chạy đúng.
         *
         * Câu trả lời là thứ người dùng cần và nó hợp lệ; chỉ phần ĐỀ XUẤT là thứ agent
         * `read_only` không được sinh. Nên bỏ đúng phần đó, ghi log để người vận hành thấy,
         * và giữ nguyên phần còn lại.
         */
        this.logger.warn(
          `[N8] Agent '${COPILOT_AGENT_CODE}' ở chế độ '${agentDef.hitlMode}' — đã BỎ một đề `
          + 'xuất do mô hình sinh ra. Câu trả lời vẫn được giữ.',
        );
        suggestion = undefined;
      }
    }

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
