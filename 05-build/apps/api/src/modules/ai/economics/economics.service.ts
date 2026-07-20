import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { buildProjections, callsPerMonth, percentile } from './economics.util';

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

  /** [F167] Gộp giá theo model — row tenant (override) THẮNG row global. */
  private static dedupePrices<T extends { model: string; tenantId: string | null }>(rows: T[]): T[] {
    const m = new Map<string, T>();
    for (const p of rows) {
      const cur = m.get(p.model);
      if (!cur || (cur.tenantId === null && p.tenantId !== null)) m.set(p.model, p);
    }
    return [...m.values()].sort((a, b) => a.model.localeCompare(b.model));
  }

  async listPrices(user: RequestUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiModelPrice.findMany({
        where: { deletedAt: null },
        orderBy: [{ model: 'asc' }],
      }),
    );
    return EconomicsService.dedupePrices(rows);
  }

  async report(user: RequestUser) {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const { rows: rawRows, prices } = await this.prisma.withTenant(user.tenantId, async (tx) => ({
      rows: await tx.aiInteraction.findMany({
        where: { at: { gte: since } },
        select: {
          agent: true, toolName: true, model: true, status: true,
          tokensIn: true, tokensOut: true, costUsd: true, latencyMs: true,
        },
        orderBy: { at: 'desc' },
        take: SAMPLE_CAP,
      }),
      prices: await tx.aiModelPrice.findMany({ where: { deletedAt: null } }),
    }));

    // [F163] LOẠI traffic eval replay (toolName 'eval:*') — chạy golden suite trong
    // CI/dev không phải hành vi người dùng; đếm vào calls/tháng làm projection
    // "chi phí nếu bật live" sai lệch hàng chục lần — đúng con số quyết định PRD §16.
    const rows = rawRows.filter((r) => !r.toolName?.startsWith('eval:'));

    const priceRows = EconomicsService.dedupePrices(prices).map((p) => ({
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
