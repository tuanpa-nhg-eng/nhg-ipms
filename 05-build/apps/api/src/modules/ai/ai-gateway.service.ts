import { ForbiddenException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DataClassification, dataClassRank } from '@ipms/shared';
import { PrismaService } from '../../prisma.service';
import { DataCatalogService } from '../datacatalog/datacatalog.service';
import { AiAgentService } from './agents/ai-agent.service';
import type { RequestUser } from '../../common/auth/decorators';
import { LlmClient, LlmRequest, LlmResponse, LlmStreamChunk, selectLlmBackend } from './llm/llm-client';
import { MockLlmClient } from './llm/mock-llm-client';
import { AnthropicLlmClient } from './llm/anthropic-llm-client';
import { PiiScrubService } from './pii/pii-scrub.service';
import type { PiiKind } from './pii/pii-scrubber';
import { EgressPolicyService } from './egress/egress-policy.service';
import type { DataClass, EgressDestination } from './egress/egress-policy';
import { EconomicsService } from './economics/economics.service';
import { costForUsage } from './economics/economics.util';

/**
 * ai-gateway (#3 hạ tầng) — cổng DUY NHẤT gọi LLM:
 * - Backend chọn theo feature flag `ai_gateway_live` (tenant override > global) + API key.
 *   Mặc định OFF ⇒ MockLlmClient (tất định, 0 chi phí) — RED-LINE không gọi API thật.
 * - MỌI lượt gọi ghi `ai_interaction` (append-only) — nền cho AI governance dashboard.
 * - [F59 trả nợ] PII scrub THUẬN trước khi request rời gateway (client mock/thật chỉ thấy
 *   bản đã scrub — log ai_interaction cũng ghi bản NÀY) và NGHỊCH trên response cho caller
 *   nội bộ (rehydrate ở RAM, không persist map ra DB).
 * - [Last-mile Lát 2] Egress Policy — lớp gác THỨ HAI, cắt ngang, độc lập với cờ
 *   ai_gateway_live: dữ liệu confidential/pii KHÔNG BAO GIỜ rời mock (self-host chưa
 *   triển khai), dù cờ bật + có key. Chặn → status='blocked', KHÔNG gọi client.
 * - [Last-mile Lát 3] costUsd cho backend=anthropic tính THẬT qua EconomicsService
 *   (ai_model_price, tenant override thắng global — F167) NGAY TẠI ĐÂY (client chỉ
 *   báo cáo usage, không tự định giá — 1 nơi giữ luật giá, dùng chung với báo cáo §16).
 */
@Injectable()
export class AiGatewayService {
  private mock: LlmClient = new MockLlmClient();

  // [F202] Lỗi khi GHI VẾT chặn phải nhìn thấy được — nuốt im lặng là mất vết mà không ai biết.
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private prisma: PrismaService, private pii: PiiScrubService,
    private egress: EgressPolicyService, private economics: EconomicsService,
    // [Lát 3] DI (không `new` cứng) — test override bằng withTransport() giả.
    private anthropic: AnthropicLlmClient,
    // [Trục D L1] Hai sổ mà gateway PHẢI tra trước khi cho một lượt gọi đi tiếp:
    // danh bạ agent (agent là ai, trần bao nhiêu) + sổ đăng ký dữ liệu (nhóm này mức nào).
    // Không nơi nào trong lớp AI được tự nhớ hai thứ đó lần thứ hai.
    private agents: AiAgentService,
    private catalog: DataCatalogService,
  ) {}

  /** [Lát 3] Giá THẬT cho 1 lượt anthropic — chỉ gọi khi backend='anthropic' (mock giữ
   *  nguyên costUsd=0 từ MockLlmClient, không tra giá, không đổi hành vi cũ). */
  private async realCost(tenantId: string, model: string, tokensIn: number, tokensOut: number): Promise<number> {
    const price = await this.economics.priceForModel(tenantId, model);
    return costForUsage(tokensIn, tokensOut, price);
  }

  /**
   * [Last-mile Lát 2] Chặn TRƯỚC khi gọi client — nhận `req` ĐÃ SCRUB (gọi SAU pii.scrubRequest
   * trong complete()/stream()) để nếu bị chặn, audit log VẪN không bao giờ giữ PII gốc
   * (dù chính request đó bị đánh dấu confidential/pii và không đi đâu cả).
   */
  private async guardEgress(
    user: RequestUser, scrubbedReq: LlmRequest, piiCounts: Partial<Record<PiiKind, number>>,
    // [Trục D L1] Kiểu SIẾT từ `DataClass` (có bí danh 'pii') xuống `DataClassification` (đúng
    // bốn mức). Từ nay mức LUÔN suy ra từ `data_asset`, nên bí danh tương thích ngược không
    // còn đường nào vào đây — để kiểu rộng hơn thực tế là mời một vựng thứ hai quay lại.
    backend: 'anthropic' | 'mock', dataClass: DataClassification, toolName?: string,
  ) {
    const destination: EgressDestination = backend === 'anthropic' ? 'anthropic' : 'mock';
    const decision = await this.egress.resolve(user.tenantId, dataClass, destination);
    if (!decision.allowed) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { blocked: true, reason: decision.reason },
        latencyMs: 0, status: 'blocked', piiCounts, dataClass,
      });
      throw new ForbiddenException(`ai-gateway: egress bị chặn — ${decision.reason}`);
    }
  }

  /**
   * [Trục D L1] BA CỔNG TRƯỚC EGRESS — N1 · N2 · N3. Chạy TRƯỚC `guardEgress` có chủ đích:
   * hai lớp trả lời hai câu hỏi khác nhau và gộp lại là mất một lớp.
   *
   *   · N1/N3 (ở đây): **agent này có TƯ CÁCH chạm dữ liệu này không?**
   *   · Egress Policy (lớp sau): **dữ liệu mức này có được RỜI MÁY tới đích kia không?**
   *
   * Một agent trần `internal` xin xử lý `review.result` phải bị chặn NGAY CẢ KHI đích là
   * `mock` (không rời máy) — vì vi phạm ở đây là vi phạm hiến chương, không phải vi phạm
   * egress. Ngược lại `restricted` không rời máy kể cả agent có trần đủ. Hai luật độc lập.
   *
   * Trả về mức phân loại đã SUY RA để phần còn lại của lượt gọi dùng chung một con số.
   */
  private async resolveAndGuardAgent(
    user: RequestUser, req: LlmRequest, toolName?: string,
  ): Promise<{ dataClass: DataClassification; assets: string[] }> {
    // ── N1: agent phải TỒN TẠI và đang `active` trong danh bạ ────────────────────────────
    // `resolve()` ném 404 nếu chưa đăng ký (fail-closed, không mặc định về agent chung chung).
    // [F202] Bắt để GHI VẾT rồi ném lại — không đổi hành vi chặn, chỉ thôi im lặng.
    let agent;
    try {
      agent = await this.agents.resolve(user.tenantId, req.agent);
    } catch (e) {
      await this.logGateBlocked(user, req, toolName, `N1: ${(e as Error).message}`);
      throw e;
    }
    if (agent.status !== 'active') {
      const reason = `N1: agent '${req.agent}' đang ở trạng thái '${agent.status}', chưa được `
        + 'phép chạy. Bật một agent là quyết định của chủ dữ liệu (aiagent:write), không phải '
        + 'hệ quả của việc có người gọi nó.';
      await this.logGateBlocked(user, req, toolName, reason);
      throw new UnprocessableEntityException(`ai-gateway [${reason}`);
    }

    // ── N2: mức phân loại SUY RA từ sổ đăng ký, KHÔNG do người gọi khai ──────────────────
    const raw: unknown[] = Array.isArray(req.dataAssets) ? req.dataAssets : [];
    // [F207] Phần tử dị dạng ⇒ CHẶN, không cắt gọt rồi chạy tiếp. Cắt gọt im lặng ở cổng gác
    // là fail-open có điều kiện: `[{code:'hr.profile'}, 'objective.kpi']` sẽ suy mức chỉ từ
    // phần sống sót và cho đi. [F216] Chuỗi rỗng/toàn khoảng trắng tính là dị dạng — nếu để
    // nó đi tiếp thì cùng một lỗi khai mã trả về hai loại lỗi khác nhau tuỳ hình dạng chuỗi.
    const malformed = raw.filter((a) => typeof a !== 'string' || a.trim().length === 0);
    if (malformed.length > 0) {
      const reason = `N2: \`dataAssets\` của agent '${req.agent}' có ${malformed.length} phần tử `
        + 'không phải mã hợp lệ (phải là chuỗi không rỗng). Cổng gác KHÔNG cắt gọt đầu vào — '
        + 'khai sai thì sửa chỗ khai, không để hệ thống đoán phần còn lại.';
      await this.logGateBlocked(user, req, toolName, reason);
      throw new UnprocessableEntityException(`ai-gateway [${reason}`);
    }
    // [F204] Dedup TRƯỚC mọi việc còn lại. Trùng lặp qua được kiểm hiến chương (mọi bản sao
    // đều hợp lệ), nên không dedup ở đây nghĩa là người gọi quyết định được số lượt tra sổ.
    // Sau dedup, độ dài bị chặn bởi chính hiến chương agent — không cần trần rời thứ hai.
    const assets = [...new Set(raw as string[])];
    if (assets.length === 0) {
      // Đây là dòng thay cho `?? 'internal'` cũ. Trước đây quên khai = mức CHO PHÉP ĐI; nay
      // quên khai = CHẶN. Không có chế độ cảnh báo-rồi-cho-qua (cùng ngữ nghĩa K2 của trục C).
      const reason = `N2: lượt gọi agent '${req.agent}' không khai nhóm dữ liệu nào `
        + '(`dataAssets`). Mức phân loại phải SUY RA từ sổ đăng ký dữ liệu, không do người gọi '
        + 'tự khai — không khai được thì không chạy (fail-closed).';
      await this.logGateBlocked(user, req, toolName, reason);
      throw new UnprocessableEntityException(`ai-gateway [${reason}`);
    }

    // ── N3': phạm vi — nhóm khai phải nằm TRONG hiến chương của agent ────────────────────
    const outOfCharter = assets.filter((a) => !agent.dataAssetCodes.includes(a));
    if (outOfCharter.length > 0) {
      const reason = `N3: agent '${req.agent}' không được phép chạm nhóm dữ liệu `
        + `${outOfCharter.join(', ')} — ngoài phạm vi trong danh bạ `
        + `(${agent.dataAssetCodes.join(', ') || 'rỗng'}).`;
      await this.logGateBlocked(user, req, toolName, reason);
      throw new ForbiddenException(`ai-gateway [${reason}`);
    }

    // Mức của lượt gọi = MAX rank của các nhóm chạm tới. [F205] Tra sổ MỘT LƯỢT cho cả danh
    // sách (trước đây một `withTenant` cho mỗi mã — N+1 ngay trong cổng gác, ngược đúng bài
    // học F171 mà `eval.service` áp trong cùng commit). Mã chưa đăng ký ⇒ `resolveMany()` ném
    // và nêu ĐỦ các mã thiếu: một đường dữ liệu chưa đăng ký phải bị chặn và bị phát hiện.
    let dataClass: DataClassification = 'public';
    try {
      const classes = await this.catalog.resolveMany(user.tenantId, assets);
      for (const cls of classes.values()) {
        if (dataClassRank(cls) > dataClassRank(dataClass)) dataClass = cls;
      }
    } catch (e) {
      await this.logGateBlocked(user, req, toolName, `N2: ${(e as Error).message}`);
      throw e;
    }

    // ── N6: `restricted` KHÔNG BAO GIỜ là mức của một lượt gọi AI ─────────────────────────
    // [F203] Cổng phát biểu N6 TRỰC TIẾP, và đứng ĐỘC LẬP với trần agent. Trước bản vá này,
    // N6 chỉ đúng NHỜ một sự tình cờ: không agent nào trong danh bạ khai trần `restricted`.
    // Nhưng `ai_agent_max_data_class_check` CHO PHÉP giá trị đó, trong khi
    // `ai_interaction_no_restricted_check` lại CẤM ghi nó — hai DDL nói ngược nhau, và cây
    // cầu duy nhất là một unit test trên dữ liệu seed. Một agent trần `restricted` sẽ qua
    // được kiểm trần bên dưới (rank bằng nhau), chạy tới mock, RỒI mới nổ ở CHECK lúc ghi
    // sổ ⇒ 500 sau khi việc đã xảy ra, thay vì 403 trước khi nó xảy ra. Nay chặn tại đây.
    if (dataClass === 'restricted') {
      const reason = `N6: lượt gọi agent '${req.agent}' chạm dữ liệu mức 'restricted' `
        + `(${assets.join(', ')}). Dữ liệu 'restricted' không tới BẤT KỲ nhà cung cấp nào, kể `
        + 'cả self-host, kể cả mock, kể cả khi trần của agent đủ cao — không có ngoại lệ.';
      // CỐ Ý không truyền `dataClass`: `ai_interaction_no_restricted_check` cấm ghi giá trị
      // đó, và đúng như vậy — cột ghi mức của một lượt gọi ĐÃ CHẠY. Lý do đã nêu đủ trong
      // `reason`, nên vết vẫn tra được mà không phải nới một CHECK đang giữ N6.
      await this.logGateBlocked(user, req, toolName, reason);
      throw new ForbiddenException(`ai-gateway [${reason}`);
    }

    // ── N3: TRẦN của agent ───────────────────────────────────────────────────────────────
    if (dataClassRank(dataClass) > dataClassRank(agent.maxDataClass)) {
      const reason = `N3: agent '${req.agent}' có trần '${agent.maxDataClass}' nhưng lượt gọi `
        + `chạm dữ liệu mức '${dataClass}' (${assets.join(', ')}). Trần là thuộc tính của AGENT, `
        + 'không phải của phiên gọi — người gọi có đủ quyền cũng không nới được.';
      await this.logGateBlocked(user, req, toolName, reason, dataClass);
      throw new ForbiddenException(`ai-gateway [${reason}`);
    }

    return { dataClass, assets };
  }

  /**
   * [F202] Vết của MỘT nhánh chặn ở ba cổng. Kế hoạch trục D §Lát-1 yêu cầu tường minh:
   * *"⇒ 422, không gọi client, ghi `ai_interaction` `status='blocked'` kèm lý do đọc được"*.
   * Bản đầu của L1 chỉ ghi cho nhánh vượt-trần; ba nhánh còn lại (agent lạ · agent `planned`
   * · ngoài phạm vi) ném câm ⇒ dò mã agent là hành vi không để lại dấu.
   *
   * ⚠️ [F201] KHÔNG ghi `prompt`/`context`. Ba cổng chạy TRƯỚC `pii.scrubRequest` có chủ đích
   * (một lượt gọi của agent không tồn tại thì không có lý do gì đi xa hơn), nên đây là đường
   * log DUY NHẤT không đi qua scrub — bản đầu truyền thẳng `req` THÔ vào `log()`, tức ghi
   * prompt chưa khử PII vào một bảng append-only mà trigger chặn cả UPDATE lẫn DELETE. Nhánh
   * này lại kích hoạt đúng lúc lượt gọi chạm dữ liệu trên trần agent — đường rò trùng với dữ
   * liệu nhạy cảm nhất. Vết của một lượt BỊ CHẶN cần danh tính + lý do, không cần nội dung.
   *
   * Lỗi ghi vết KHÔNG được nuốt im lặng (mất vết mà không ai biết) và cũng KHÔNG được biến
   * một lượt bị-chặn-đúng thành 500 — nên: báo qua logger, rồi vẫn ném lỗi chặn gốc.
   */
  private async logGateBlocked(
    user: RequestUser, req: LlmRequest, toolName: string | undefined,
    reason: string, dataClass?: DataClassification,
  ): Promise<void> {
    await this.log(user, req, toolName, {
      model: 'blocked', output: { blocked: true, reason },
      latencyMs: 0, status: 'blocked', dataClass, omitPrompt: true,
    }).catch((e: unknown) => {
      this.logger.error(
        `[F202] không ghi được vết chặn cho agent '${req.agent}': ${(e as Error).message}`,
      );
    });
  }

  /** Flag tenant override thắng global; không có row nào ⇒ OFF (fail-closed). */
  async resolveBackend(tenantId: string): Promise<'anthropic' | 'mock'> {
    const { backend } = await this.liveStatus(tenantId);
    return backend;
  }

  /**
   * [Last-mile Lát 5] Vỡ nhỏ các điều kiện gộp trong resolveBackend() — cho FE
   * "Checklist sẵn sàng Live" biết ĐANG THIẾU đúng cái gì (cờ hay key), không chỉ
   * kết quả cuối 'mock'/'anthropic'. KHÔNG lộ giá trị key — chỉ boolean có/không.
   */
  async liveStatus(tenantId: string): Promise<{ flagEnabled: boolean; hasApiKey: boolean; backend: 'anthropic' | 'mock' }> {
    const flags = await this.prisma.withTenant(tenantId, (tx) =>
      tx.featureFlag.findMany({ where: { key: 'ai_gateway_live' } }),
    );
    const tenantFlag = flags.find((f) => f.tenantId === tenantId);
    const globalFlag = flags.find((f) => f.tenantId === null);
    const flagEnabled = (tenantFlag ?? globalFlag)?.enabled ?? false;
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    return { flagEnabled, hasApiKey, backend: selectLlmBackend({ liveFlagEnabled: flagEnabled, hasApiKey }) };
  }

  /** Gọi LLM + log ai_interaction (kể cả khi lỗi — status='error'). */
  async complete(user: RequestUser, req: LlmRequest, toolName?: string): Promise<LlmResponse> {
    // [Trục D L1] N1/N2/N3 chạy TRƯỚC MỌI THỨ — trước cả khi chọn backend và trước scrub.
    // Một lượt gọi của agent không tồn tại / vượt trần thì không có lý do gì để đi xa hơn.
    const { dataClass, assets } = await this.resolveAndGuardAgent(user, req, toolName);
    const backend = await this.resolveBackend(user.tenantId);
    const client = backend === 'anthropic' ? this.anthropic : this.mock;
    const t0 = Date.now();
    // [F59] scrub TRƯỚC khi rời gateway — client (mock hay thật) chỉ thấy bản đã scrub.
    const { prompt, context, map, counts } = await this.pii.scrubRequest(user.tenantId, req.prompt, req.context);
    const scrubbedReq: LlmRequest = { ...req, prompt, context, dataAssets: assets };
    await this.guardEgress(user, scrubbedReq, counts, backend, dataClass, toolName); // [Lát 2] throws nếu bị chặn — đã tự log
    try {
      const res = await client.complete(scrubbedReq);
      // [Lát 3] anthropic → costUsd THẬT (client chỉ trả 0 placeholder); mock giữ nguyên.
      const costUsd = backend === 'anthropic'
        ? await this.realCost(user.tenantId, res.model, res.tokensIn, res.tokensOut)
        : res.costUsd;
      await this.log(user, scrubbedReq, toolName, {
        model: res.model, output: res.json ?? res.text,
        tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd,
        latencyMs: Date.now() - t0, status: 'ok', piiCounts: counts, dataClass,
      });
      // Nghịch — caller nội bộ nhận bản THẬT (map chỉ tồn tại trong RAM lượt gọi này).
      return {
        ...res,
        costUsd,
        text: this.pii.rehydrateText(res.text, map),
        json: res.json !== undefined ? this.pii.rehydrateValue(res.json, map) : res.json,
      };
    } catch (e) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { error: (e as Error).message },
        latencyMs: Date.now() - t0, status: 'error', piiCounts: counts, dataClass,
      });
      throw e;
    }
  }

  /**
   * [P1 Copilot] Stream LLM + log ai_interaction khi kết thúc.
   * [Lát 3] AnthropicLlmClient.stream() giờ THẬT (không còn stub) — nhánh fallback dưới
   * đây là lưới an toàn thuần tuý (LlmClient tương lai lỡ không implement stream), KHÔNG
   * còn phải là đường đi thường trực như trước lát 3.
   */
  async *stream(user: RequestUser, req: LlmRequest, toolName?: string): AsyncIterable<LlmStreamChunk> {
    // [Trục D L1] Cùng ba cổng như complete() — đường stream KHÔNG được là cửa sau.
    // (Bài học `POST /ai/chat` ở trục C: một đường chạy không qua cổng là đủ để vô hiệu cổng.)
    const { dataClass, assets } = await this.resolveAndGuardAgent(user, req, toolName);
    const backend = await this.resolveBackend(user.tenantId);
    const chosen = backend === 'anthropic' ? this.anthropic : this.mock;
    if (backend === 'anthropic' && !chosen.stream) {
      // eslint-disable-next-line no-console
      console.warn('[ai-gateway] backend=anthropic nhưng client hiện tại thiếu stream() — tạm fallback MockLlmClient.');
    }
    const client = chosen.stream ? chosen : this.mock;
    const t0 = Date.now();
    // [F59] scrub TRƯỚC khi rời gateway; rehydrate TĂNG DẦN trên đường ra (StreamRehydrator
    // giữ lại đuôi token vỡ giữa 2 chunk — không lộ nửa token, không rơi ký tự thật).
    const { prompt, context, map, counts } = await this.pii.scrubRequest(user.tenantId, req.prompt, req.context);
    const scrubbedReq: LlmRequest = { ...req, prompt, context, dataAssets: assets };
    // [Lát 2] Đánh giá theo `backend` ĐÃ RESOLVE (ý định cấu hình: flag+key), KHÔNG theo
    // `client` fallback thực tế — nếu không, hành vi chặn sẽ đổi âm thầm giữa "trước/sau
    // khi AnthropicLlmClient hỗ trợ stream()" dù cấu hình egress không đổi. throws nếu bị
    // chặn — đã tự log.
    await this.guardEgress(user, scrubbedReq, counts, backend, dataClass, toolName);
    const rehydrator = this.pii.createStreamRehydrator(map);
    let acc = ''; // tích luỹ bản ĐÃ SCRUB (đúng những gì client LLM thực sự thấy) — dùng để log
    let usage: LlmStreamChunk['usage'];
    try {
      for await (const chunk of client.stream!(scrubbedReq)) {
        if (chunk.type === 'text' && chunk.text) {
          acc += chunk.text;
          const safe = rehydrator.push(chunk.text);
          if (safe) yield { ...chunk, text: safe };
          continue;
        }
        if (chunk.type === 'done') {
          usage = chunk.usage;
          const tail = rehydrator.flush();
          if (tail) yield { type: 'text', text: tail };
          yield chunk;
          continue;
        }
        if (chunk.type === 'suggestion' && chunk.suggestion) {
          yield {
            ...chunk,
            suggestion: {
              ...chunk.suggestion,
              summary: this.pii.rehydrateText(chunk.suggestion.summary, map),
              reason: chunk.suggestion.reason ? this.pii.rehydrateText(chunk.suggestion.reason, map) : chunk.suggestion.reason,
              payload: chunk.suggestion.payload !== undefined ? this.pii.rehydrateValue(chunk.suggestion.payload, map) : chunk.suggestion.payload,
            },
          };
          continue;
        }
        if (chunk.type === 'tool_use' && chunk.toolInput !== undefined) {
          yield { ...chunk, toolInput: this.pii.rehydrateValue(chunk.toolInput, map) };
          continue;
        }
        yield chunk;
      }
      // [Lát 3] anthropic → costUsd THẬT cho log (chunk 'done' ĐÃ yield cho caller với
      // placeholder 0 — không ai đọc costUsd từ chunk stream hiện tại, chỉ ai_interaction
      // cần số đúng cho báo cáo economics §16).
      const costUsd = backend === 'anthropic' && usage
        ? await this.realCost(user.tenantId, usage.model, usage.tokensIn, usage.tokensOut)
        : usage?.costUsd;
      await this.log(user, scrubbedReq, toolName, {
        model: usage?.model ?? backend, output: acc.slice(0, 4000),
        tokensIn: usage?.tokensIn, tokensOut: usage?.tokensOut, costUsd,
        latencyMs: Date.now() - t0, status: 'ok', piiCounts: counts, dataClass,
      });
    } catch (e) {
      await this.log(user, scrubbedReq, toolName, {
        model: backend, output: { error: (e as Error).message },
        latencyMs: Date.now() - t0, status: 'error', piiCounts: counts, dataClass,
      });
      throw e;
    }
  }

  /** Log tool-call KHÔNG qua LLM (MCP read-only tools) — vẫn phải vào ai_interaction (§9). */
  logToolCall(
    user: RequestUser, toolName: string, input: unknown, output: unknown,
    latencyMs: number, status: 'ok' | 'error' | 'blocked' = 'ok',
  ) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiInteraction.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub, agent: 'mcp',
          toolName, input: (input ?? undefined) as any,
          // Output tool đọc có thể lớn — chỉ log metadata (đã có audit_log cho hành vi)
          output: (output ?? undefined) as any,
          latencyMs, status,
        },
      }),
    );
  }

  private log(
    user: RequestUser, req: LlmRequest, toolName: string | undefined,
    r: { model: string; output: unknown; tokensIn?: number; tokensOut?: number;
         costUsd?: number; latencyMs: number; status: string; piiCounts?: Partial<Record<PiiKind, number>>;
         /** [Trục D L1] mức ĐÃ SUY RA từ sổ đăng ký — không phải lời khai của người gọi. */
         dataClass?: DataClassification;
         /** [F201] Không ghi nội dung — dùng cho nhánh chặn chạy TRƯỚC scrub. */
         omitPrompt?: boolean },
  ) {
    // [F59 + F201] Bất biến ĐÚNG của hàm này, sau khi bản đầu của trục D L1 phá nó:
    // nội dung vào đây HOẶC là bản đã scrub (complete()/stream() truyền `scrubbedReq`),
    // HOẶC không được ghi (`omitPrompt` — ba cổng N1/N2/N3 chạy TRƯỚC scrub). Không có
    // đường thứ ba. Bản đầu chỉ khẳng định vế thứ nhất, trong khi một caller mới đã đi vào
    // bằng `req` thô — đúng họ F191: chú thích khẳng định được đọc như bằng chứng ở lần sửa
    // sau. piiScrubbed = số lượng theo loại, minh bạch cho dashboard mà KHÔNG lộ giá trị.
    const piiScrubbed = r.piiCounts && Object.keys(r.piiCounts).length > 0 ? r.piiCounts : undefined;
    const input = r.omitPrompt
      ? { promptOmitted: 'gate-blocked', piiScrubbed }
      : { prompt: req.prompt, context: req.context ?? null, piiScrubbed };
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiInteraction.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub, agent: req.agent,
          toolName, model: r.model, promptVersion: req.promptVersion,
          input: input as any,
          output: (r.output ?? undefined) as any,
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd,
          latencyMs: r.latencyMs, status: r.status,
          // [Trục D L1] Spec_AI_Assistant §211 khai hai trường này từ đầu, tới nay mới có cột.
          dataClass: r.dataClass ?? null,
          dataAssets: (req.dataAssets ?? undefined) as any,
        },
      }),
    );
  }
}
