import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { AiGatewayService } from '../ai-gateway.service';
import { DEFAULT_MODEL } from '../llm/llm-client';
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

  /**
   * Chạy suite: mỗi case → gateway.complete → assertion → result; summary vào run.
   * [Last-mile Lát 4] `opts.model` — chỉ có tác dụng khi backend=anthropic (mock luôn
   * bỏ qua, MockLlmClient không đọc req.model). `aiEvalRun.model` giờ ghi MODEL THẬT
   * SẼ DÙNG ('mock' hoặc model cụ thể) — không còn ghi tên backend chung chung — để
   * qualify()/readiness() biết CHÍNH XÁC model nào đã chứng minh, không suy diễn.
   */
  async run(user: RequestUser, suiteId: string, opts?: { model?: string }) {
    const { suite, cases } = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const suite = await tx.aiEvalSuite.findFirst({ where: { id: suiteId, deletedAt: null } });
      if (!suite) throw new NotFoundException('Suite không tồn tại');
      const cases = await tx.aiEvalCase.findMany({ where: { suiteId, deletedAt: null } });
      if (!cases.length) throw new UnprocessableEntityException('Suite không có case');
      return { suite, cases };
    });

    const backend = await this.gateway.resolveBackend(user.tenantId);
    // [Lát 4] model THẬT sẽ chạy — tính TRƯỚC, dùng NHẤT QUÁN cho cả label lẫn request
    // (không suy ngược từ response — tự đảm bảo mọi case trong 1 run cùng 1 model).
    const model = backend === 'anthropic' ? (opts?.model ?? DEFAULT_MODEL) : 'mock';
    const runId = uuidv7();
    const startedAt = new Date();
    await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiEvalRun.create({
        data: {
          id: runId, tenantId: user.tenantId, suiteId, model,
          status: 'running', startedAt, createdBy: user.claims.sub,
        },
      }),
    );

    // [F58] mọi lỗi ngoài per-case (đã catch riêng) → run kết thúc status='error',
    // không kẹt 'running' vĩnh viễn
    try {
      return await this.executeRun(user, runId, suite, cases, model);
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
    model: string,
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
          {
            agent: suite.agent, prompt: input.prompt, context: input.context, promptVersion: input.promptVersion,
            model, // [Lát 4] mock bỏ qua field này — anthropic dùng ĐÚNG model đã chốt ở run()
          },
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
        deterministic: model === 'mock',
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
   * [Last-mile Lát 4] `liveQualified` KHÔNG còn suy từ "có kết quả không-phải-mock
   * TỪNG chạy qua" (dễ bị silent-swap: đổi model đang phục vụ mà không re-run vẫn
   * đọc nhầm liveQualified cũ) — giờ đòi ĐÚNG 3 điều: model đang PHỤC VỤ agent
   * (ai_agent_model, mặc định DEFAULT_MODEL) phải có 1 qualification (a) CHƯA HẾT
   * HẠN (b) đạt bar HIỆN TẠI (re-check tại lúc đọc — bar bị siết sau khi qualify
   * thì qualification cũ coi như vô hiệu, không đọc số cũ).
   */
  readiness(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const bars = await tx.aiLaunchBar.findMany({ where: { deletedAt: null } });
      const suites = await tx.aiEvalSuite.findMany({
        where: { deletedAt: null, agent: { startsWith: 'inline.' } },
      });
      const agentModels = await tx.aiAgentModel.findMany({ where: { deletedAt: null } });
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
        // [F164] So NGƯỠNG trên giá trị CHƯA làm tròn (0.89975 không được "0.900" hóa
        // để lách bar); passRate làm tròn CHỈ để hiển thị.
        const rawRate = total > 0 ? pass / total : null;
        const passRate = rawRate !== null ? Number(rawRate.toFixed(3)) : null;
        if (!bar) reasons.push('chưa cấu hình launch bar');
        if (agentSuites.length === 0) reasons.push('chưa có eval suite');
        if (bar && total < bar.minCases) reasons.push(`cần ≥${bar.minCases} case có kết quả (hiện ${total})`);
        if (bar && rawRate !== null && rawRate < Number(bar.minPassRate)) {
          reasons.push(`pass-rate ${passRate} < ngưỡng ${Number(bar.minPassRate)}`);
        }
        const ready = !!bar && agentSuites.length > 0 && uncovered === 0
          && total >= bar.minCases && rawRate !== null && rawRate >= Number(bar.minPassRate);

        // [Lát 4] Model-Qualification Gate — cấm silent-swap
        const servingModel = agentModels.find((m) => m.agent === agent)?.model ?? DEFAULT_MODEL;
        let liveQualified = false;
        if (ready) {
          if (servingModel === 'mock') {
            reasons.push('model đang phục vụ là MOCK — pipeline OK nhưng CHƯA chứng minh chất lượng model thật (đổi qua PUT /ai/eval/agent-model sau khi qualify)');
          } else {
            const q = await tx.aiModelQualification.findFirst({
              where: { agent, model: servingModel, expiresAt: { gt: new Date() } },
              orderBy: { qualifiedAt: 'desc' },
            });
            if (!q) {
              reasons.push(`model đang phục vụ '${servingModel}' CHƯA qualify (hoặc đã hết hạn) — chạy POST /ai/eval/qualify/${agent}`);
            } else if (Number(q.passRate) < Number(bar!.minPassRate) || q.casesTotal < bar!.minCases) {
              reasons.push(`qualification của '${servingModel}' không còn đạt bar HIỆN TẠI (bar đã siết sau khi qualify) — cần qualify lại`);
            } else {
              liveQualified = true;
            }
          }
        }
        out.push({
          agent,
          bar: bar ? { minPassRate: Number(bar.minPassRate), minCases: bar.minCases, note: bar.note } : null,
          cases: total, pass, fail: total - pass, passRate,
          models: [...models].sort(),
          servingModel,
          suites: suiteViews,
          ready,
          liveQualified,
          reasons,
        });
      }
      return { agents: out };
    });
  }

  // ===== [Last-mile Lát 4] Model-Qualification Gate — cấm silent-swap =====

  /** Model đang phục vụ agent — mặc định DEFAULT_MODEL nếu chưa pin tường minh. */
  async getServingModel(user: RequestUser, agent: string): Promise<string> {
    const row = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiAgentModel.findFirst({ where: { agent, deletedAt: null } }),
    );
    return row?.model ?? DEFAULT_MODEL;
  }

  listAgentModels(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiAgentModel.findMany({ where: { deletedAt: null }, orderBy: { agent: 'asc' } }),
    );
  }

  /**
   * Đổi model phục vụ agent — CHỈ chấp nhận khi model đích ('mock' luôn được, không
   * cần chứng minh gì) đã có qualification CHƯA HẾT HẠN và đạt bar HIỆN TẠI. Đây là
   * điểm CHẶN DUY NHẤT của "cấm silent-swap": không có đường nào khác đổi model phục
   * vụ mà bỏ qua kiểm tra này (readiness() re-check độc lập tại thời điểm đọc, không
   * tin tưởng mù quáng cờ này — 2 lớp).
   */
  async setServingModel(user: RequestUser, agent: string, model: string, note?: string) {
    if (typeof model !== 'string' || model.length === 0 || model.length > 64) {
      throw new UnprocessableEntityException('model bắt buộc, tối đa 64 ký tự');
    }
    if (model !== 'mock') {
      const bar = await this.prisma.withTenant(user.tenantId, (tx) => tx.aiLaunchBar.findFirst({ where: { agent, deletedAt: null } }));
      if (!bar) throw new UnprocessableEntityException(`Agent '${agent}' chưa có launch bar — không xác định được ngưỡng để chấp nhận model`);
      const q = await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.aiModelQualification.findFirst({
          where: { agent, model, expiresAt: { gt: new Date() } },
          orderBy: { qualifiedAt: 'desc' },
        }),
      );
      if (!q || Number(q.passRate) < Number(bar.minPassRate) || q.casesTotal < bar.minCases) {
        throw new UnprocessableEntityException(
          `Chưa có qualification hợp lệ (chưa hết hạn, đạt bar hiện tại ${Number(bar.minPassRate)}/${bar.minCases}) cho agent '${agent}' + model '${model}' — chạy POST /ai/eval/qualify/${agent} trước (cấm silent-swap).`,
        );
      }
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiAgentModel.upsert({
        where: { tenantId_agent: { tenantId: user.tenantId, agent } },
        create: { id: uuidv7(), tenantId: user.tenantId, agent, model, note: note ?? null, createdBy: user.claims.sub },
        update: { model, note: note ?? null, updatedBy: user.claims.sub, version: { increment: 1 }, deletedAt: null },
      }),
    );
  }

  /**
   * Chạy LẠI (fresh, không tái dùng run cũ) toàn bộ suite của agent trên `opts.model`
   * (chỉ có tác dụng khi backend=anthropic — mock luôn tự chạy model='mock' bất kể
   * yêu cầu gì, nên KHÔNG BAO GIỜ "qualify hộ" được 1 model thật trong khi offline —
   * đúng chủ đích: qualification chỉ có giá trị khi THẬT SỰ đã live cho lượt chạy đó).
   * Đạt bar → ghi `ai_model_qualification` (APPEND-ONLY — bằng chứng vĩnh viễn, TTL
   * qua expiresAt). Các suite lỡ chạy LẪN nhiều model khác nhau (VD nửa chừng đổi
   * cờ/key) → từ chối, không chứng nhận mập mờ.
   */
  async qualify(user: RequestUser, agent: string, opts?: { model?: string; note?: string }) {
    const bar = await this.prisma.withTenant(user.tenantId, (tx) => tx.aiLaunchBar.findFirst({ where: { agent, deletedAt: null } }));
    if (!bar) throw new UnprocessableEntityException(`Agent '${agent}' chưa có launch bar — không qualify được`);
    const suites = await this.prisma.withTenant(user.tenantId, (tx) => tx.aiEvalSuite.findMany({ where: { agent, deletedAt: null } }));
    if (suites.length === 0) throw new UnprocessableEntityException(`Agent '${agent}' chưa có eval suite`);

    const runIds: string[] = [];
    const modelsSeen = new Set<string>();
    let pass = 0;
    let total = 0;
    for (const s of suites) {
      const run = await this.run(user, s.id, { model: opts?.model });
      runIds.push(run!.id);
      if (run!.model) modelsSeen.add(run!.model);
      const sum = (run!.summary ?? {}) as { pass?: number; fail?: number };
      pass += sum.pass ?? 0;
      total += (sum.pass ?? 0) + (sum.fail ?? 0);
    }
    if (modelsSeen.size !== 1) {
      throw new UnprocessableEntityException(
        `Các suite chạy lẫn ${modelsSeen.size} model khác nhau trong 1 lượt qualify (${[...modelsSeen].join(', ')}) — không xác định được model để chứng nhận, chạy lại`,
      );
    }
    const model = [...modelsSeen][0];
    const rawRate = total > 0 ? pass / total : 0;
    if (total < bar.minCases || rawRate < Number(bar.minPassRate)) {
      throw new UnprocessableEntityException(
        `Chưa đạt launch bar: ${pass}/${total} case (cần ≥${bar.minCases}), pass-rate ${rawRate.toFixed(3)} (cần ≥${Number(bar.minPassRate)}) — KHÔNG cấp qualification`,
      );
    }
    const ttlDays = Number(process.env.AI_QUALIFICATION_TTL_DAYS ?? 90);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiModelQualification.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, agent, model,
          passRate: rawRate, casesTotal: total, runIds: runIds as any,
          qualifiedBy: user.claims.sub, expiresAt, note: opts?.note ?? null,
        },
      }),
    );
  }

  listQualifications(user: RequestUser, agent?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiModelQualification.findMany({
        where: agent ? { agent } : {},
        orderBy: { qualifiedAt: 'desc' },
        take: 200,
      }),
    );
  }
}
