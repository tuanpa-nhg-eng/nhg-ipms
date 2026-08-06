import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { buildProjections, callsPerMonth, dedupeModelPrices, percentile } from './economics.util';

/** Cửa sổ quan sát mặc định + trần mẫu (cờ sampled minh bạch khi chạm trần). */
const WINDOW_DAYS = 30;
const SAMPLE_CAP = 10_000;

/**
 * [Learning Loop L3] Unit economics (AI-Native PRD §16) — đo từ ai_interaction:
 * token/latency P50/P95 per agent + chi phí THỰC (mock = 0, RED-LINE) + projection
 * chi phí/tháng nếu bật live per model (giá từ ai_model_price, sensitivity ×0.5/×1/×2).
 * MỌI số projection dán nhãn estimated — token là heuristic mock (chars/4),
 * không mạo nhận số đo từ model thật.
 */
@Injectable()
export class EconomicsService {
  constructor(private prisma: PrismaService) {}

  async listPrices(user: RequestUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiModelPrice.findMany({
        where: { deletedAt: null },
        orderBy: [{ model: 'asc' }],
      }),
    );
    return dedupeModelPrices(rows);
  }

  /** [Last-mile Lát 3] Giá 1 model — tenant override thắng global, dùng bởi ai-gateway
   *  để tính costUsd THẬT khi backend=anthropic (cùng luật ưu tiên với báo cáo). */
  async priceForModel(tenantId: string, model: string) {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.aiModelPrice.findMany({ where: { deletedAt: null, model } }),
    );
    const row = dedupeModelPrices(rows)[0];
    return row ? { model: row.model, inputUsdPerMTok: Number(row.inputUsdPerMTok), outputUsdPerMTok: Number(row.outputUsdPerMTok) } : null;
  }

  async report(user: RequestUser) {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    /**
     * [Trục D L1] Chỉ đếm lượt gọi của agent CÓ TRONG DANH BẠ.
     *
     * Vì sao đây là bản vá đúng chứ không phải một bộ lọc tên nữa: tới hết L0 đo được **100%
     * chi phí trong báo cáo 30 ngày ($0,30645) đến từ agent BỊA của test**, trong khi bộ lọc
     * duy nhất ở đây là `toolName startsWith 'eval:'`. Thêm một tiền tố tên nữa (`egress-`,
     * `anthropic-live-`, `inline.test.`…) là đúng cách mà lỗi này đã tái diễn BA LẦN — F163
     * (đếm lượt eval), F191 (ghi chú sai về NULL), rồi lần này.
     *
     * Danh bạ là câu trả lời có nguyên tắc: một agent không đăng ký thì KHÔNG PHẢI đường chạy
     * sản phẩm, theo đúng định nghĩa mà N1 vừa cưỡng chế ở gateway. Bộ lọc không còn phải
     * đoán tên nữa, và mọi agent test tương lai tự động nằm ngoài mà không ai phải nhớ gì.
     */
    const registered = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiAgent.findMany({ where: { deletedAt: null }, select: { code: true } }),
    );
    const agentCodes = [...new Set(registered.map((a) => a.code))];
    const { rows: rawRows, prices } = await this.prisma.withTenant(user.tenantId, async (tx) => ({
      rows: await tx.aiInteraction.findMany({
        // [F163 — vá lần hai, tự bắt khi chạy L3] Lọc traffic eval NGAY TRONG TRUY VẤN, không
        // chỉ ở bộ nhớ sau khi đã `take`.
        //
        // Bản đầu lọc sau: `take: SAMPLE_CAP` lấy 10.000 dòng MỚI NHẤT rồi mới bỏ eval. Chừng
        // nào tổng số dòng còn dưới trần thì hai cách cho kết quả giống hệt nhau — nên lỗi ngủ
        // yên rất lâu. Vượt trần thì mẫu bão hoà: mỗi dòng eval mới ĐẨY một dòng người dùng
        // thật ra khỏi mẫu, và con số "calls" TỤT XUỐNG khi hệ thống chạy eval nhiều hơn. DB
        // dev hiện có 11.287 dòng / 8.765 trong đó là eval — tức mẫu gần như toàn eval và
        // báo cáo unit economics đang ĐẾM THIẾU hành vi người dùng thật.
        //
        // Đây đúng là con số PRD §16 dùng để quyết "có bật live không", nên sai lệch theo
        // hướng đếm thiếu còn nguy hiểm hơn đếm thừa. `toolName` NULL (hầu hết traffic thật)
        // phải được GIỮ, nên viết tường minh hai nhánh.
        //
        // [F191 — đính chính 05/08] Câu chú thích cũ ở đây giải thích nhánh `{ toolName: null }`
        // là BẮT BUỘC vì "NOT trên cột nullable loại luôn NULL". Đúng với SQL thuần, SAI với
        // Prisma từ 4.0: `NOT`/`not` ở tầng Prisma TRẢ VỀ cả hàng NULL. Truy vấn này vẫn đúng
        // (nhánh thừa chứ không thiếu), nhưng chính câu giải thích sai đó đã được đọc lại như
        // bằng chứng khi viết bộ lọc khử danh ở `retention.targets.ts` — nơi thiếu vế NULL gây
        // ghi đè không hoàn tác được. Giữ nguyên hai nhánh cho rõ ý định, sửa lại lý do.
        where: {
          at: { gte: since },
          OR: [{ toolName: null }, { NOT: { toolName: { startsWith: 'eval:' } } }],
          // [Trục D L1] agent phải có trong danh bạ — xem chú thích ở đầu report().
          // Giữ CẢ hai bộ lọc: `eval:` loại traffic kiểm định của agent THẬT (agent có trong
          // danh bạ, nhưng lượt gọi không phải hành vi người dùng); danh bạ loại agent không
          // tồn tại. Hai bộ lọc trả lời hai câu hỏi khác nhau, không thay thế nhau.
          agent: { in: agentCodes },
        },
        select: {
          agent: true, toolName: true, model: true, status: true,
          tokensIn: true, tokensOut: true, costUsd: true, latencyMs: true,
        },
        orderBy: { at: 'desc' },
        take: SAMPLE_CAP,
      }),
      prices: await tx.aiModelPrice.findMany({ where: { deletedAt: null } }),
    }));

    // [F163] Lớp thứ hai của cùng một luật — giữ lại có chủ đích. Truy vấn ở trên là chỗ
    // quyết định (nó ảnh hưởng cả MẪU), còn dòng này là lưới chắn cho trường hợp ai đó sửa
    // `where` mà quên: thà lọc hai lần còn hơn để traffic CI lọt vào con số chi phí.
    const rows = rawRows.filter((r) => !r.toolName?.startsWith('eval:'));

    const priceRows = dedupeModelPrices(prices).map((p) => ({
      model: p.model,
      inputUsdPerMTok: Number(p.inputUsdPerMTok),
      outputUsdPerMTok: Number(p.outputUsdPerMTok),
    }));

    const byAgent = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byAgent.get(r.agent);
      if (list) list.push(r);
      else byAgent.set(r.agent, [r]);
    }

    const agents = [...byAgent.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([agent, list]) => {
      const ok = list.filter((r) => r.status === 'ok');
      const tokensIn = ok.map((r) => r.tokensIn ?? 0).filter((v) => v > 0);
      const tokensOut = ok.map((r) => r.tokensOut ?? 0).filter((v) => v > 0);
      const latencies = list.map((r) => r.latencyMs ?? 0).filter((v) => v > 0);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
      const avgIn = Math.round(avg(tokensIn));
      const avgOut = Math.round(avg(tokensOut));
      const cpm = callsPerMonth(list.length, WINDOW_DAYS);
      return {
        agent,
        calls: list.length,
        errors: list.length - ok.length,
        models: [...new Set(list.map((r) => r.model).filter(Boolean))].sort(),
        // Chi phí THỰC đã ghi nhận (mock ⇒ 0 — RED-LINE còn nguyên)
        actualCostUsd: Number(list.reduce((s, r) => s + Number(r.costUsd ?? 0), 0).toFixed(6)),
        tokens: {
          avgIn, avgOut,
          p50In: percentile(tokensIn, 50), p95In: percentile(tokensIn, 95),
          p50Out: percentile(tokensOut, 50), p95Out: percentile(tokensOut, 95),
        },
        latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
        callsPerMonth: cpm,
        // Projection nếu bật live — sensitivity ×0.5/×1/×2 (PRD §16)
        projections: buildProjections(avgIn, avgOut, cpm, priceRows),
      };
    });

    return {
      windowDays: WINDOW_DAYS,
      sampled: rows.length === SAMPLE_CAP,
      estimated: true,
      basis: 'token = heuristic mock (~4 ký tự/token, gồm context) · giá = niêm yết Anthropic (as-of theo ai_model_price) · ĐÃ LOẠI traffic eval replay (F163) · KHÔNG phải hóa đơn thật',
      totalActualCostUsd: Number(rows.reduce((s, r) => s + Number(r.costUsd ?? 0), 0).toFixed(6)),
      agents,
    };
  }
}
