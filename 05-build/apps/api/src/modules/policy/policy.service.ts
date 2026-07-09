import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { uuidv7 } from '@ipms/db';
import { PrismaService } from '../../prisma.service';
import type { RequestUser } from '../../common/auth/decorators';
import {
  checkPolicyText, PolicyRow, PolicyTestCase, runPolicyTests, scopeApplies,
} from './cedar.engine';

/** Marker nội bộ — SoD violation trong tx, audit incident ghi ngoài tx (chuẩn F48). */
class SodViolationError extends Error {
  constructor(public severity: string) {
    super('sod_violation');
  }
}

const POLICY_TEXT_MAX = 10_000;
const TESTS_MAX = 50;
const TEST_CASE_MAX_BYTES = 4_096;

/** Cache active policies per tenant — TTL ngắn; mọi mutation qua API invalidate ngay. */
const CACHE_TTL_MS = Number(process.env.POLICY_CACHE_TTL_MS ?? 15_000);

interface CacheEntry {
  at: number;
  rows: Array<PolicyRow & { scope: string | null }>;
}

/**
 * Policy-as-Code (#2) — vòng đời access_policy:
 * draft (config:write, sửa tự do) → active (config:publish + TOÀN BỘ tests PASS,
 * SoD write⟂publish như config version) → disabled (config:publish).
 * PolicyGuard chỉ enforce policy status=active (global + tenant).
 */
@Injectable()
export class PolicyService {
  private cache = new Map<string, CacheEntry>();

  constructor(private prisma: PrismaService) {}

  /** Policies active áp cho action — nguồn cho PolicyGuard (RLS trả global + tenant). */
  async activeForAction(tenantId: string, action: string): Promise<PolicyRow[]> {
    const cached = this.cache.get(tenantId);
    let rows: CacheEntry['rows'];
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      rows = cached.rows;
    } else {
      const found = await this.prisma.withTenant(tenantId, (tx) =>
        tx.accessPolicy.findMany({
          where: { status: 'active', engine: 'cedar', deletedAt: null },
          select: { id: true, name: true, policyText: true, scope: true },
          orderBy: { id: 'asc' }, // thứ tự tất định
        }),
      );
      rows = found;
      this.cache.set(tenantId, { at: Date.now(), rows });
    }
    return rows.filter((r) => scopeApplies(r.scope, action));
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  list(user: RequestUser, status?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.accessPolicy.findMany({
        where: { deletedAt: null, ...(status ? { status } : {}) },
        orderBy: [{ tenantId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      }),
    );
  }

  get(user: RequestUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.accessPolicy.findFirst({ where: { id, deletedAt: null } });
      if (!p) throw new NotFoundException('Policy không tồn tại');
      return p;
    });
  }

  private validateInput(input: { policyText?: string; tests?: PolicyTestCase[] }) {
    if (input.policyText !== undefined) {
      if (input.policyText.length > POLICY_TEXT_MAX) {
        throw new UnprocessableEntityException(`policyText tối đa ${POLICY_TEXT_MAX} ký tự`);
      }
      const parsed = checkPolicyText(input.policyText);
      if (!parsed.ok) {
        throw new UnprocessableEntityException(`Policy không hợp lệ: ${parsed.errors.join('; ')}`);
      }
    }
    if (input.tests !== undefined) {
      if (input.tests.length > TESTS_MAX) {
        throw new UnprocessableEntityException(`Tối đa ${TESTS_MAX} test case`);
      }
      for (const t of input.tests) {
        if (!t.name || !t.action || !['allow', 'deny'].includes(t.expect)) {
          throw new UnprocessableEntityException('Test case cần name, action, expect=allow|deny');
        }
        // [F64-chuẩn] đo BYTES, không đếm ký tự
        if (Buffer.byteLength(JSON.stringify(t), 'utf8') > TEST_CASE_MAX_BYTES) {
          throw new UnprocessableEntityException(`Test case '${t.name}' quá ${TEST_CASE_MAX_BYTES} bytes`);
        }
      }
    }
  }

  create(user: RequestUser, input: {
    name: string; policyText: string; scope?: string; note?: string; tests?: PolicyTestCase[];
  }) {
    this.validateInput(input);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const dup = await tx.accessPolicy.findFirst({
        where: { name: input.name, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Policy '${input.name}' đã tồn tại`);
      const created = await tx.accessPolicy.create({
        data: {
          id: uuidv7(), tenantId: user.tenantId, name: input.name,
          engine: 'cedar', policyText: input.policyText,
          scope: input.scope, note: input.note,
          tests: (input.tests ?? []) as unknown as object,
          status: 'draft',
          createdBy: user.claims.sub, updatedBy: user.claims.sub,
        },
      });
      this.invalidate(user.tenantId);
      return created;
    });
  }

  /** Chỉ sửa được draft — policy active là luật đang chạy, muốn đổi: disable rồi sửa. */
  update(user: RequestUser, id: string, input: {
    policyText?: string; scope?: string; note?: string; tests?: PolicyTestCase[];
  }) {
    this.validateInput(input);
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.accessPolicy.findFirst({ where: { id, deletedAt: null } });
      if (!p) throw new NotFoundException('Policy không tồn tại');
      // [F69] đồng nhất với activate/disable — RLS vốn đã chặn, nhưng trả lỗi rõ nghĩa
      if (!p.tenantId) {
        throw new ConflictException('Policy global chỉ quản trị ở tầng platform (B3)');
      }
      if (p.status !== 'draft') {
        throw new ConflictException(`Chỉ sửa được policy draft (hiện: ${p.status})`);
      }
      const updated = await tx.accessPolicy.update({
        where: { id },
        data: {
          ...(input.policyText !== undefined ? { policyText: input.policyText } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.tests !== undefined ? { tests: input.tests as unknown as object } : {}),
          updatedBy: user.claims.sub, version: { increment: 1 },
        },
      });
      this.invalidate(user.tenantId);
      return updated;
    });
  }

  /** Chạy bộ test của policy (+ case ad-hoc) — không đổi trạng thái, dùng được trong CI. */
  async test(user: RequestUser, id: string, extraCases?: PolicyTestCase[]) {
    if (extraCases !== undefined) this.validateInput({ tests: extraCases });
    const p = await this.get(user, id);
    const cases = [...((p.tests ?? []) as unknown as PolicyTestCase[]), ...(extraCases ?? [])];
    if (cases.length === 0) {
      throw new UnprocessableEntityException('Policy chưa có test case nào');
    }
    const outcome = runPolicyTests(
      { id: p.id, name: p.name, policyText: p.policyText }, cases,
    );
    return { policyId: p.id, name: p.name, ...outcome };
  }

  /**
   * Activate — quality gate fail-closed:
   * ≥1 test + TOÀN BỘ pass + không case nào có lỗi eval (policy tham chiếu attr sai
   * mà activate thì mọi request trong scope sẽ bị deny oan — chặn tại cửa).
   * SoD config:write ⟂ config:publish (như config version publish) + conditional update chống race.
   */
  async activate(user: RequestUser, id: string, expectedVersion: number, ip?: string) {
    try {
      return await this.setStatus(user, id, expectedVersion, 'active', ['draft', 'disabled']);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'access_policy', entityId: id,
              after: { rule: 'config:write ⟂ config:publish', severity: e.severity } as object,
              ip,
            },
          }),
        );
        throw new ConflictException('SoD: người giữ config:write không được activate policy (tách vai Designer/Approver)');
      }
      throw e;
    }
  }

  async disable(user: RequestUser, id: string, expectedVersion: number, ip?: string) {
    try {
      return await this.setStatus(user, id, expectedVersion, 'disabled', ['active']);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.auditLog.create({
            data: {
              tenantId: user.tenantId, actorUserId: user.claims.sub,
              action: 'sod.violation_blocked', entityType: 'access_policy', entityId: id,
              after: { rule: 'config:write ⟂ config:publish', severity: e.severity } as object,
              ip,
            },
          }),
        );
        throw new ConflictException('SoD: người giữ config:write không được disable policy (tách vai Designer/Approver)');
      }
      throw e;
    }
  }

  private setStatus(
    user: RequestUser, id: string, expectedVersion: number,
    target: 'active' | 'disabled', from: string[],
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.accessPolicy.findFirst({ where: { id, deletedAt: null } });
      if (!p) throw new NotFoundException('Policy không tồn tại');
      if (!p.tenantId) {
        throw new ConflictException('Policy global chỉ quản trị ở tầng platform (B3)');
      }

      // SoD runtime — cùng rule với config publish (F48: check TRONG tx, không race window)
      const sod = await tx.sodRule.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { permissionA: 'config:write', permissionB: 'config:publish' },
            { permissionA: 'config:publish', permissionB: 'config:write' },
          ],
        },
      });
      if (sod && user.permissions.has('config:write') && user.permissions.has('config:publish')) {
        throw new SodViolationError(sod.severity);
      }

      if (target === 'active') {
        // [F70] trần policy active per tenant — mỗi request trong scope eval tuần tự cả bộ
        const activeCount = await tx.accessPolicy.count({
          where: { status: 'active', deletedAt: null, NOT: { id } },
        });
        if (activeCount >= 50) {
          throw new UnprocessableEntityException('Tối đa 50 policy active per tenant — disable bớt trước');
        }
        const tests = (p.tests ?? []) as unknown as PolicyTestCase[];
        if (tests.length === 0) {
          throw new UnprocessableEntityException('Policy phải có ≥1 test case trước khi activate (chống hồi quy phân quyền)');
        }
        const outcome = runPolicyTests({ id: p.id, name: p.name, policyText: p.policyText }, tests);
        if (!outcome.passed) {
          const failed = outcome.results.filter((r) => !r.passed).map((r) => r.name);
          throw new UnprocessableEntityException(`Test FAIL — không activate: ${failed.join(', ')}`);
        }
        if (outcome.results.some((r) => r.errors.length > 0)) {
          throw new UnprocessableEntityException(
            'Policy có lỗi eval (tham chiếu attr/context không tồn tại) — activate sẽ deny oan mọi request trong scope',
          );
        }
      }

      const count = await tx.accessPolicy.updateMany({
        where: { id, deletedAt: null, version: expectedVersion, status: { in: from } },
        data: { status: target, updatedBy: user.claims.sub, version: { increment: 1 } },
      });
      if (count.count !== 1) {
        throw new ConflictException(`Không ${target === 'active' ? 'activate' : 'disable'} được — version lệch hoặc trạng thái không hợp lệ (reload)`);
      }

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId, actorUserId: user.claims.sub,
          action: target === 'active' ? 'policy.activate' : 'policy.disable',
          entityType: 'access_policy', entityId: id,
          before: { status: p.status } as object,
          after: { status: target, name: p.name } as object,
        },
      });
      this.invalidate(user.tenantId);
      return tx.accessPolicy.findFirst({ where: { id } });
    });
  }
}
