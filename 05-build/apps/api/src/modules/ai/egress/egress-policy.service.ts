import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../../prisma.service';
import type { RequestUser } from '../../../common/auth/decorators';
import {
  DataClass, DATA_CLASSES, EgressDecision, EgressDestination, EGRESS_DESTINATIONS, resolveEgress,
} from './egress-policy';

/**
 * [Last-mile Lát 2] Wrapper DB cho egress-policy.ts thuần — nạp policy tenant + CRUD
 * (config-as-data, chuẩn ai_launch_bar). Permission ai:eval (đồng bộ eval/launch-bar).
 */
@Injectable()
export class EgressPolicyService {
  constructor(private prisma: PrismaService) {}

  list(user: RequestUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiEgressPolicy.findMany({ where: { deletedAt: null }, orderBy: [{ dataClass: 'asc' }, { destination: 'asc' }] }),
    );
  }

  async upsert(user: RequestUser, dataClass: string, destination: string, allowed: boolean, note?: string) {
    if (!DATA_CLASSES.includes(dataClass as DataClass)) {
      throw new UnprocessableEntityException(`dataClass phải thuộc ${DATA_CLASSES.join('|')}`);
    }
    if (!EGRESS_DESTINATIONS.includes(destination as EgressDestination)) {
      throw new UnprocessableEntityException(`destination phải thuộc ${EGRESS_DESTINATIONS.join('|')}`);
    }
    if (['confidential', 'pii'].includes(dataClass) && destination !== 'mock' && allowed) {
      // [bất biến cứng] không cho phép TẠO row cố tình mở khoá pii/confidential ra ngoài
      // mock — engine cũng chặn ở runtime, nhưng chặn sớm tại đây để không tạo ảo giác
      // "đã cấu hình cho phép" trong khi thực tế vẫn bị engine chặn.
      throw new UnprocessableEntityException(
        `dữ liệu '${dataClass}' không được phép egress qua '${destination}' (self-host chưa triển khai) — bất biến cứng, không tạo được policy allowed=true`,
      );
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.aiEgressPolicy.upsert({
        where: { tenantId_dataClass_destination: { tenantId: user.tenantId, dataClass, destination } },
        create: {
          id: uuidv7(), tenantId: user.tenantId, dataClass, destination, allowed, note: note ?? null,
          createdBy: user.claims.sub,
        },
        update: { allowed, note: note ?? null, updatedBy: user.claims.sub, version: { increment: 1 }, deletedAt: null },
      }),
    );
  }

  /** Dùng bởi ai-gateway — nạp policy tenant + chạy engine thuần. */
  async resolve(tenantId: string, dataClass: DataClass, destination: EgressDestination): Promise<EgressDecision> {
    if (destination === 'mock') return resolveEgress(dataClass, destination, []); // khỏi truy vấn — luôn cho phép
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.aiEgressPolicy.findMany({ where: { deletedAt: null, destination }, select: { dataClass: true, destination: true, allowed: true } }),
    );
    return resolveEgress(dataClass, destination, rows);
  }
}
