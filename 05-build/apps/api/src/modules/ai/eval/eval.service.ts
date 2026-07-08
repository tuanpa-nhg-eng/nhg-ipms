import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { AiGatewayService } from '../ai-gateway.service';
import { evaluateAssertions, EvalAssertion } from './assertions';

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
      if (c.input.context !== undefined && JSON.stringify(c.input.context).length > 8_000) {
        throw new UnprocessableEntityException(`Case '${c.name ?? '?'}': context tối đa 8KB`);
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
}
