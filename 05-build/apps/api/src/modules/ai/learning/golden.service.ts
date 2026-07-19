import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { goldenAssertions } from './golden.assertions';

/** Trần mỗi lần harvest — chạy lại được (idempotent theo unique signal_id). */
const HARVEST_BATCH_CAP = 200;
/** Suite đích cho case thu hoạch từ hành vi người dùng thật. */
export const LEARNED_SUITE_NAME = 'golden-learned';

/**
 * [Learning Loop L1] Golden Set có SoD — vòng: tín hiệu accepted(_with_edits)
 * → harvest thành ứng viên → CURATOR duyệt → ai_eval_case (suite 'golden-learned').
 *
 * Bất biến:
 * - SoD trên THƯỚC ĐO (bài học E2 red-team): người duyệt ≠ người tạo tín hiệu —
 *   chặn CẢ ADMIN (như SoD 4f "không tự duyệt bài mình") + incident audit ngoài tx.
 * - Candidate.input = replay {prompt, context} đúng request đã gửi LLM — case
 *   chạy lại tất định; suggestion thiếu replay (trước L1) bị skip minh bạch.
 * - expected = finalPayload (người dùng đã sửa) ?? proposedPayload — chuẩn vàng
 *   là CÁI NGƯỜI DÙNG THẬT SỰ DÙNG, không phải cái AI đề xuất.
 */
@Injectable()
export class GoldenService {
  constructor(private prisma: PrismaService) {}

  /** Quét tín hiệu dương chưa có candidate → tạo ứng viên proposed (idempotent). */
  harvest(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const signals = await tx.aiLearningSignal.findMany({
        where: {
          outcome: { in: ['accepted', 'accepted_with_edits'] },
          agent: { startsWith: 'inline.' },
        },
        orderBy: { at: 'asc' },
        take: 2000, // trần scan — corpus phình thì harvest nhiều lượt (idempotent)
      });
      const existing = await tx.aiGoldenCandidate.findMany({
        where: { signalId: { in: signals.map((s) => s.id) } },
        select: { signalId: true },
      });
      const seen = new Set(existing.map((e) => e.signalId));
      let created = 0;
      let skippedNoReplay = 0;
      for (const sig of signals) {
        if (seen.has(sig.id)) continue;
        if (created >= HARVEST_BATCH_CAP) break;
        const suggestion = await tx.aiSuggestion.findFirst({
          where: { id: sig.suggestionId, deletedAt: null },
        });
        const replay = (suggestion?.payload as any)?.replay;
        if (!replay?.prompt || replay.context === undefined) {
          skippedNoReplay += 1; // suggestion trước L1 không lưu replay — không dựng lại được input
          continue;
        }
        const expected = (sig.finalPayload ?? sig.proposedPayload) as Record<string, unknown> | null;
        if (!expected) { skippedNoReplay += 1; continue; }
        await tx.aiGoldenCandidate.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId,
            signalId: sig.id, suggestionId: sig.suggestionId, agent: sig.agent,
            sourceActorUserId: sig.actorUserId,
            input: { task: sig.agent.replace(/^inline\./, ''), agent: sig.agent, prompt: replay.prompt, context: replay.context } as any,
            expected: expected as any,
            status: 'proposed', createdBy: user.claims.sub,
          },
        });
        created += 1;
      }
      return {
        created, skippedNoReplay,
        alreadyHarvested: seen.size,
        capped: created === HARVEST_BATCH_CAP,
      };
    });
  }

  list(user: RequestUser, status?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiGoldenCandidate.findMany({
        where: { deletedAt: null, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /**
   * Duyệt ứng viên → ai_eval_case trong suite 'golden-learned' của agent.
   * SoD: decider ≠ sourceActorUserId — vi phạm 409 + incident audit NGOÀI tx (chuẩn F48/F117).
   */
  async approve(user: RequestUser, id: string, note?: string, ip?: string) {
    const cand = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiGoldenCandidate.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!cand) throw new NotFoundException('Candidate không tồn tại');
    if (cand.status !== 'proposed') throw new ConflictException(`Candidate đã ${cand.status}`);
    if (cand.sourceActorUserId && cand.sourceActorUserId === user.claims.sub) {
      // SoD trên thước đo — chặn cả admin; để lại vết incident (ghi NGOÀI tx)
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: user.tenantId, actorUserId: user.claims.sub,
            action: 'ai_golden.sod_denied', entityType: 'ai_golden_candidate', entityId: id,
            after: { rule: 'nguoi-duyet-khac-nguoi-tao-tin-hieu', agent: cand.agent } as object, ip,
          },
        }),
      );
      throw new ConflictException('SoD: không duyệt golden case từ tín hiệu do CHÍNH MÌNH tạo');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      let suite = await tx.aiEvalSuite.findFirst({
        where: { agent: cand.agent, name: LEARNED_SUITE_NAME, deletedAt: null },
      });
      if (!suite) {
        suite = await tx.aiEvalSuite.create({
          data: {
            id: uuidv7(), tenantId: user.tenantId,
            agent: cand.agent, name: LEARNED_SUITE_NAME, createdBy: user.claims.sub,
          },
        });
      }
      const evalCase = await tx.aiEvalCase.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, suiteId: suite.id,
          name: `golden ${cand.agent} ${cand.id.slice(-8)}`,
          input: cand.input as any,
          expected: cand.expected as any,
          assertions: goldenAssertions(cand.agent, cand.expected as Record<string, unknown>) as any,
        },
      });
      const updated = await tx.aiGoldenCandidate.updateMany({
        where: { id, status: 'proposed', version: cand.version },
        data: {
          status: 'approved', caseId: evalCase.id,
          decidedBy: user.claims.sub, decidedAt: new Date(), decisionNote: note ?? null,
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Candidate vừa bị quyết định (reload)'); // rollback cả case
      return { candidate: await tx.aiGoldenCandidate.findFirst({ where: { id } }), suiteId: suite.id, caseId: evalCase.id };
    });
  }

  reject(user: RequestUser, id: string, note?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const cand = await tx.aiGoldenCandidate.findFirst({ where: { id, deletedAt: null } });
      if (!cand) throw new NotFoundException('Candidate không tồn tại');
      if (cand.status !== 'proposed') throw new ConflictException(`Candidate đã ${cand.status}`);
      const updated = await tx.aiGoldenCandidate.updateMany({
        where: { id, status: 'proposed', version: cand.version },
        data: {
          status: 'rejected', decidedBy: user.claims.sub, decidedAt: new Date(),
          decisionNote: note ?? null, updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('Candidate vừa bị quyết định (reload)');
      return tx.aiGoldenCandidate.findFirst({ where: { id } });
    });
  }
}
