import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7, TenantTx } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import { diffEditedFields, resolveOutcome, LearningOutcome } from './learning-signal';

/** Trần mỗi lần expire — job chạy lại được (idempotent), không ôm tx dài. */
const EXPIRE_BATCH_CAP = 500;
/** Trần mẫu stats — đọc mới nhất trước (analytics, không phải báo cáo kiểm toán). */
const STATS_SAMPLE_CAP = 5000;

export interface RecordSignalInput {
  suggestionId: string;
  /** createdByTool của suggestion (vd 'inline.taskcell.draft') — fallback type. */
  agent: string;
  decision: 'accepted' | 'rejected' | 'expired';
  /** Cờ "Sửa rồi chấp nhận" từ FE — dùng khi không có finalPayload để diff. */
  edited?: boolean;
  proposedPayload?: Record<string, unknown> | null;
  finalPayload?: Record<string, unknown> | null;
  actorUserId?: string | null;
}

/**
 * [Learning Loop L0] Corpus học từ HITL — mọi quyết định trên ai_suggestion
 * thành 1 tín hiệu append-only. KHÔNG ảnh hưởng vòng nghiệp vụ: ghi CÙNG tx
 * với việc chốt suggestion (không lệch trạng thái), đọc chỉ là analytics.
 */
@Injectable()
export class LearningService {
  constructor(private prisma: PrismaService) {}

  /** Ghi 1 tín hiệu trong tx đang mở (gọi từ decide()/expire — cùng tx, chuẩn F5). */
  async record(tx: TenantTx, tenantId: string, input: RecordSignalInput) {
    const editedFields = input.finalPayload
      ? diffEditedFields(input.proposedPayload ?? null, input.finalPayload)
      : null;
    const outcome: LearningOutcome = resolveOutcome(input.decision, input.edited, editedFields);
    return tx.aiLearningSignal.create({
      data: {
        id: uuidv7(), tenantId,
        suggestionId: input.suggestionId, agent: input.agent, outcome,
        proposedPayload: (input.proposedPayload ?? undefined) as any,
        finalPayload: (input.finalPayload ?? undefined) as any,
        editedFields: (editedFields ?? undefined) as any,
        actorUserId: input.actorUserId ?? null,
      },
    });
  }

  /**
   * [F158] Dọn suggestion PENDING mồ côi quá TTL → status 'expired' + tín hiệu
   * 'expired' (abandoned = tín hiệu âm nhẹ cho learning loop). Idempotent —
   * chạy lại không đổi gì thêm; conditional update version (F28) chống race
   * với người dùng vừa quyết đúng lúc job chạy.
   */
  async expireOrphans(user: RequestUser, ttlDaysOverride?: number) {
    const ttlDays = ttlDaysOverride ?? Number(process.env.AI_SUGGESTION_TTL_DAYS ?? 14);
    if (!Number.isFinite(ttlDays) || ttlDays < 1 || ttlDays > 365) {
      throw new UnprocessableEntityException('ttlDays phải trong khoảng 1–365');
    }
    const cutoff = new Date(Date.now() - ttlDays * 86_400_000);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const orphans = await tx.aiSuggestion.findMany({
        where: { status: 'pending', deletedAt: null, createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' },
        take: EXPIRE_BATCH_CAP,
      });
      let expired = 0;
      for (const s of orphans) {
        const updated = await tx.aiSuggestion.updateMany({
          where: { id: s.id, status: 'pending', version: s.version },
          data: {
            status: 'expired',
            decisionNote: `[auto-expire F158] pending quá ${ttlDays} ngày`,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) continue; // vừa được người dùng quyết — nhường
        await this.record(tx, user.tenantId, {
          suggestionId: s.id,
          agent: s.createdByTool ?? s.type,
          decision: 'expired',
          proposedPayload: ((s.payload as any)?.proposal ?? s.payload) as Record<string, unknown>,
          actorUserId: null, // hệ thống, không phải người
        });
        expired += 1;
      }
      return { expired, ttlDays, scanned: orphans.length, capped: orphans.length === EXPIRE_BATCH_CAP };
    });
  }

  /**
   * Analytics per agent: đếm outcome + tỷ lệ chấp nhận + field AI hay bị sửa nhất.
   * acceptRate tính trên quyết định NGƯỜI THẬT (loại expired); editedFields gộp
   * từ mẫu mới nhất (trần STATS_SAMPLE_CAP — cờ sampled minh bạch).
   */
  async stats(user: RequestUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiLearningSignal.findMany({
        select: { agent: true, outcome: true, editedFields: true },
        orderBy: { at: 'desc' },
        take: STATS_SAMPLE_CAP,
      }),
    );
    const byAgent = new Map<string, {
      accepted: number; acceptedWithEdits: number; rejected: number; expired: number;
      editedFieldCounts: Map<string, number>;
    }>();
    for (const r of rows) {
      let a = byAgent.get(r.agent);
      if (!a) {
        a = { accepted: 0, acceptedWithEdits: 0, rejected: 0, expired: 0, editedFieldCounts: new Map() };
        byAgent.set(r.agent, a);
      }
      if (r.outcome === 'accepted') a.accepted += 1;
      else if (r.outcome === 'accepted_with_edits') a.acceptedWithEdits += 1;
      else if (r.outcome === 'rejected') a.rejected += 1;
      else if (r.outcome === 'expired') a.expired += 1;
      if (Array.isArray(r.editedFields)) {
        for (const f of r.editedFields) {
          if (typeof f === 'string') a.editedFieldCounts.set(f, (a.editedFieldCounts.get(f) ?? 0) + 1);
        }
      }
    }
    const agents = [...byAgent.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([agent, a]) => {
      const decided = a.accepted + a.acceptedWithEdits + a.rejected;
      return {
        agent,
        accepted: a.accepted, acceptedWithEdits: a.acceptedWithEdits,
        rejected: a.rejected, expired: a.expired,
        total: decided + a.expired,
        acceptRate: decided > 0 ? Math.round(((a.accepted + a.acceptedWithEdits) / decided) * 1000) / 1000 : null,
        editRate: decided > 0 ? Math.round((a.acceptedWithEdits / decided) * 1000) / 1000 : null,
        topEditedFields: [...a.editedFieldCounts.entries()]
          .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
          .slice(0, 5)
          .map(([field, count]) => ({ field, count })),
      };
    });
    return { totalSignals: rows.length, sampled: rows.length === STATS_SAMPLE_CAP, agents };
  }
}
