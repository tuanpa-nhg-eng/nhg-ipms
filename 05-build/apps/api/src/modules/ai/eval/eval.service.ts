import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { AiGatewayService } from '../ai-gateway.service';
import { evaluateAssertions, EvalAssertion } from './assertions';
import { INLINE_EVAL_AGENTS, parseInlineOutput } from './inline-replay';

interface CreateSuiteInput {
  agent: string;
  name: string;
  cases: Array<{
    name?: string;
    input: { prompt: string; context?: unknown; promptVersion?: string };
    expected?: unknown;
    assertions: EvalAssertion[];
  }>;
}

/**
 * AI eval harness (#10) — chạy bộ test-case qua ai-gateway (mock ⇒ TẤT ĐỊNH, chạy được CI).
 * Chống hồi quy chất lượng khi đổi prompt/model; kết quả vào ai_eval_run/result.
 */
@Injectable()
export class EvalService {
  constructor(private prisma: PrismaService, private gateway: AiGatewayService) {}

  createSuite(user: RequestUser, input: CreateSuiteInput) {
    if (!input.cases?.length) throw new UnprocessableEntityException('Suite cần ≥1 case');
    if (input.cases.length > 100) {
      throw new UnprocessableEntityException('Suite tối đa 100 case — chia nhiều suite');
    }
    for (const c of input.cases) {
      if (!c.assertions?.length) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}' thiếu assertions — eval fail-closed`);
      }
      // [F60] cap kích thước — chặn JSON khổng lồ vào DB/log
      if (c.assertions.length > 20) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}' quá 20 assertions`);
      }
      if (typeof c.input?.prompt !== 'string' || c.input.prompt.length === 0 || c.input.prompt.length > 4_000) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}': prompt bắt buộc, tối đa 4000 ký tự`);
      }
      // [F64] đo BYTES (không đếm ký tự — multibyte lách được) + cap TỔNG mỗi case:
      // expected/assertions to cũng vòng qua được cap context nếu chỉ cap từng phần
      if (c.input.context !== undefined
        && Buffer.byteLength(JSON.stringify(c.input.context), 'utf8') > 8_192) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}': context tối đa 8KB`);
      }
      const totalBytes = Buffer.byteLength(
        JSON.stringify({ input: c.input, expected: c.expected ?? null, assertions: c.assertions }), 'utf8',
      );
      if (totalBytes > 32_768) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}': tổng JSON tối đa 32KB (hiện ${totalBytes} bytes)`);
      }
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const suite = await tx.aiEvalSuite.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, agent: input.agent, name: input.name,
          createdBy: user.claims.sub,
        },
      });
      for (const c of input.cases) {
        await tx.aiEvalCase.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, suiteId: suite.id, name: c.name,
            input: c.input as any, expected: (c.expected ?? undefined) as any,
            assertions: c.assertions as any,
          },
        });
      }
      return tx.aiEvalSuite.findFirst({ where: { id: suite.id }, include: { cases: true } });
    });
  }

  listSuites(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiEvalSuite.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { cases: true, runs: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Chạy suite: mỗi case → gateway.complete (mock) → assertion → result; summary vào run. */
  async run(user: RequestUser, suiteId: string) {
    const { suite, cases } = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const suite = await tx.aiEvalSuite.findFirst({ where: { id: suiteId, deletedAt: null } });
      if (!suite) throw new NotFoundException('Suite không tồn tại');
      const cases = await tx.aiEvalCase.findMany({ where: { suiteId, deletedAt: null } });
      if (!cases.length) throw new UnprocessableEntityException('Suite không có case');
      return { suite, cases };
    });

    const backend = await this.gateway.resolveBackend(user.tenantId);
    const runId = uuidv7();
    const startedAt = new Date();
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiEvalRun.create({
        data: {
          id: runId, tenantId: user.tenantId, suiteId, model: backend,
          status: 'running', startedAt, createdBy: user.claims.sub,
        },
      }),
    );

    // [F58] mọi lỗi ngoài per-case (đã catch riêng) → run kết thúc status='error',
    // không kẹt 'running' vĩnh viễn
    try {
      return await this.executeRun(user, runId, suite, cases, backend);
    } catch (e) {
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.aiEvalRun.update({
          where: { id: runId },
          data: { status: 'error', finishedAt: new Date(), summary: { error: (e as Error).message } as any },
        }),
      ).catch(() => undefined);
      throw e;
    }
  }

  private async executeRun(
    user: RequestUser, runId: string,
    suite: { agent: string; name: string },
    cases: Array<{ id: string; input: unknown; assertions: unknown }>,
    backend: string,
  ) {
    let pass = 0;
    let scoreSum = 0;
    const results: Array<{ caseId: string; passed: boolean; score: number; judgeOutput: unknown }> = [];
    for (const c of cases) {
      const input = c.input as { prompt: string; context?: unknown; promptVersion?: string };
      let verdict;
      let output: unknown;
      try {
        const res = await this.gateway.complete(
          user,
          { agent: suite.agent, prompt: input.prompt, context: input.context, promptVersion: input.promptVersion },
          `eval:${suite.name}`,
        );
        output = res.json ?? res.text;
        // [Learning L2] golden case inline.* chấm trên PROPOSAL đã qua parser
        // fail-closed của tác vụ (không chấm raw output) — parse lỗi = case fail có note
        if (INLINE_EVAL_AGENTS.has(suite.agent)) {
          output = parseInlineOutput(suite.agent, res.json, input.context);
        }
        verdict = evaluateAssertions(output, (c.assertions ?? []) as unknown as EvalAssertion[]);
      } catch (e) {
        verdict = { passed: false, score: 0, details: [{ assertion: { type: 'exists' as const }, passed: false, note: (e as Error).message }] };
      }
      if (verdict.passed) pass += 1;
      scoreSum += verdict.score;
      results.push({
        caseId: c.id, passed: verdict.passed, score: verdict.score,
        judgeOutput: { output, details: verdict.details },
      });
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      for (const r of results) {
        await tx.aiEvalResult.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId, runId, caseId: r.caseId,
            score: r.score, passed: r.passed, judgeOutput: r.judgeOutput as any,
          },
        });
      }
      const summary = {
        pass, fail: cases.length - pass,
        avg_score: Number((scoreSum / cases.length).toFixed(3)),
        deterministic: backend === 'mock',
      };
      await tx.aiEvalRun.update({
        where: { id: runId },
        data: { status: 'done', finishedAt: new Date(), summary: summary as any },
      });
      return tx.aiEvalRun.findFirst({ where: { id: runId }, include: { results: true } });
    });
  }

  getRun(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.aiEvalRun.findFirst({ where: { id }, include: { results: true, suite: true } });
      if (!run) throw new NotFoundException('Run không tồn tại');
      return run;
    });
  }

  // ===== [Learning Loop L2] Launch bar + readiness (AI-Native PRD §14) =====

  listBars(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiLaunchBar.findMany({ where: { deletedAt: null }, orderBy: { agent: 'asc' } }),
    );
  }

  /** Upsert ngưỡng per agent — validate tại cửa, unique (tenant, agent). */
  upsertBar(user: RequestUser, agent: string, input: { minPassRate: number; minCases: number; note?: string }) {
    if (!Number.isFinite(input.minPassRate) || input.minPassRate <= 0 || input.minPassRate > 1) {
      throw new UnprocessableEntityException('minPassRate phải trong (0, 1]');
    }
    if (!Number.isInteger(input.minCases) || input.minCases < 1 || input.minCases > 1000) {
      throw new UnprocessableEntityException('minCases phải là số nguyên 1–1000');
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiLaunchBar.upsert({
        where: { tenantId_agent: { tenantId: user.tenantId, agent } },
        create: {
          id: uuidv7(), tenantId: user.tenantId, agent,
          minPassRate: input.minPassRate, minCases: input.minCases, note: input.note ?? null,
          createdBy: user.claims.sub,
        },
        update: {
          minPassRate: input.minPassRate, minCases: input.minCases, note: input.note ?? null,
          updatedBy: user.claims.sub, version: { increment: 1 }, deletedAt: null,
        },
      }),
    );
  }

  /**
   * Readiness per agent = run DONE mới nhất của TỪNG suite (learned + baseline)
   * so với launch bar. FAIL-CLOSED mọi nhánh: thiếu bar / thiếu suite / suite chưa
   * chạy / thiếu case / dưới ngưỡng → ready=false + reasons explainable.
   * `liveQualified` TÁCH riêng: ready && có kết quả trên model KHÔNG PHẢI mock —
   * kết quả mock chỉ chứng minh pipeline, KHÔNG chứng minh chất lượng model thật.
   */
  readiness(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const bars = await tx.aiLaunchBar.findMany({ where: { deletedAt: null } });
      const suites = await tx.aiEvalSuite.findMany({
        where: { deletedAt: null, agent: { startsWith: 'inline.' } },
      });
      const agents = [...new Set([...bars.map((b) => b.agent), ...suites.map((s) => s.agent)])].sort();
      const out = [];
      for (const agent of agents) {
        const bar = bars.find((b) => b.agent === agent) ?? null;
        const agentSuites = suites.filter((s) => s.agent === agent);
        const reasons: string[] = [];
        const suiteViews = [];
        const models = new Set<string>();
        let pass = 0;
        let total = 0;
        let uncovered = 0;
        for (const s of agentSuites) {
          const run = await tx.aiEvalRun.findFirst({
            where: { suiteId: s.id, status: 'done' },
            orderBy: { finishedAt: 'desc' },
          });
          if (!run) {
            uncovered += 1;
            reasons.push(`suite '${s.name}' chưa có run hoàn tất`);
            suiteViews.push({ suiteId: s.id, name: s.name, latestRun: null });
            continue;
          }
          const sum = (run.summary ?? {}) as { pass?: number; fail?: number; avg_score?: number };
          pass += sum.pass ?? 0;
          total += (sum.pass ?? 0) + (sum.fail ?? 0);
          if (run.model) models.add(run.model);
          suiteViews.push({
            suiteId: s.id, name: s.name,
            latestRun: {
              id: run.id, finishedAt: run.finishedAt, model: run.model,
              pass: sum.pass ?? 0, fail: sum.fail ?? 0, avgScore: sum.avg_score ?? null,
            },
          });
        }
        const passRate = total > 0 ? Number((pass / total).toFixed(3)) : null;
        if (!bar) reasons.push('chưa cấu hình launch bar');
        if (agentSuites.length === 0) reasons.push('chưa có eval suite');
        if (bar && total < bar.minCases) reasons.push(`cần ≥${bar.minCases} case có kết quả (hiện ${total})`);
        if (bar && passRate !== null && passRate < Number(bar.minPassRate)) {
          reasons.push(`pass-rate ${passRate} < ngưỡng ${Number(bar.minPassRate)}`);
        }
        const ready = !!bar && agentSuites.length > 0 && uncovered === 0
          && total >= bar.minCases && passRate !== null && passRate >= Number(bar.minPassRate);
        const mockOnly = models.size === 0 || [...models].every((m) => m === 'mock');
        if (ready && mockOnly) {
          reasons.push('kết quả mới chỉ trên MOCK — pipeline OK nhưng CHƯA chứng minh chất lượng model thật');
        }
        out.push({
          agent,
          bar: bar ? { minPassRate: Number(bar.minPassRate), minCases: bar.minCases, note: bar.note } : null,
          cases: total, pass, fail: total - pass, passRate,
          models: [...models].sort(),
          suites: suiteViews,
          ready,
          liveQualified: ready && !mockOnly,
          reasons,
        });
      }
      return { agents: out };
    });
  }
}
