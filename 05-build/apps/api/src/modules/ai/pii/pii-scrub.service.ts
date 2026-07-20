import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { PiiKind, rehydrateText, rehydrateValue, scrubRequestPure, StreamRehydrator } from './pii-scrubber';

interface CacheEntry {
  names: string[];
  at: number;
}

/**
 * [F59 trả nợ] Wrapper DB cho pii-scrubber thuần — nạp person.fullName của tenant để
 * đối chiếu scrub tên nhân sự. Cache in-memory per-tenant TTL (chuẩn PolicyGuard §4c,
 * env PII_NAME_CACHE_TTL_MS — test=0 để không dính state cũ giữa các case).
 * KHÔNG persist map scrub xuống DB — map chỉ sống trong 1 lượt gọi gateway (RAM),
 * tránh dựng thêm 1 kho PII thứ hai chính là thứ mình đang bảo vệ.
 */
@Injectable()
export class PiiScrubService {
  private cache = new Map<string, CacheEntry>();
  private ttlMs = Number(process.env.PII_NAME_CACHE_TTL_MS ?? 60_000);

  constructor(private prisma: PrismaService) {}

  private async knownNames(tenantId: string): Promise<string[]> {
    const now = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && now - hit.at < this.ttlMs) return hit.names;
    const persons = await this.prisma.withTenant(tenantId, (tx) =>
      tx.person.findMany({ where: { deletedAt: null }, select: { fullName: true }, take: 5_000 }),
    );
    const names = [...new Set(persons.map((p) => p.fullName).filter((n): n is string => !!n && n.length >= 4))];
    this.cache.set(tenantId, { names, at: now });
    return names;
  }

  async scrubRequest(tenantId: string, prompt: string, context: unknown) {
    const names = await this.knownNames(tenantId);
    return scrubRequestPure(prompt, context, names);
  }

  rehydrateText(text: string, map: Record<string, string>): string {
    return rehydrateText(text, map);
  }

  rehydrateValue(value: unknown, map: Record<string, string>): unknown {
    return rehydrateValue(value, map);
  }

  createStreamRehydrator(map: Record<string, string>): StreamRehydrator {
    return new StreamRehydrator(map);
  }
}

export type { PiiKind };
