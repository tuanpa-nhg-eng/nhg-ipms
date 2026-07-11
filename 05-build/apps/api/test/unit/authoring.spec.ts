/**
 * Unit lát 4j — [F119] pin tầng enforce TRONG CODE của AuthoringService (chuẩn F55):
 * allowlist capability + self-grant + granter scope phải chặn Ở SERVICE, độc lập với
 * DTO @IsIn / ValidationPipe (nếu ai đó sửa/tắt validation, tầng này vẫn đứng).
 */
import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { AuthoringService } from '../../src/modules/authoring/authoring.service';
import type { RequestUser } from '../../src/common/auth/decorators';

// stub PrismaService: đủ cho nhánh audit-ngoài-tx của wrapper grant()
const prismaStub = {
  withTenant: async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ auditLog: { create: async () => ({}) } }),
} as never;

const UUID_A = '019f0000-0000-7000-8000-00000000000a';
const UUID_B = '019f0000-0000-7000-8000-00000000000b';
const UUID_ORG = '019f0000-0000-7000-8000-0000000000c1';
const UUID_ORG2 = '019f0000-0000-7000-8000-0000000000c2';

const granter = (scopes: RequestUser['scopes']): RequestUser => ({
  claims: { sub: UUID_A, tid: 't', email: 'dept@test' } as RequestUser['claims'],
  tenantId: '019f0000-0000-7000-8000-0000000000ff',
  permissions: new Set(['taskcell:delegate']),
  scopes,
});

describe('lát 4j — AuthoringService enforce trong CODE (F55/F119)', () => {
  const svc = new AuthoringService(prismaStub);
  const orgScoped = granter([{ scopeType: 'org_unit', scopeId: UUID_ORG }]);

  it('allowlist: capability ngoài taskcell:author → 422 NGAY TẠI SERVICE (không tin DTO)', async () => {
    for (const capability of ['taskcell:approve', 'library:publish', 'taskcell:delegate', 'config:publish']) {
      await expect(
        svc.grant(orgScoped, { granteeId: UUID_B, orgUnitId: UUID_ORG, capability }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });

  it('self-grant → 409 (chạy TRƯỚC mọi check DB)', async () => {
    await expect(
      svc.grant(orgScoped, { granteeId: UUID_A, orgUnitId: UUID_ORG }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('granter scope: orgUnitId ngoài scope org_unit → 403 (fail-closed, chưa chạm DB)', async () => {
    await expect(
      svc.grant(orgScoped, { granteeId: UUID_B, orgUnitId: UUID_ORG2 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // scope self (không có org_unit) → cũng 403
    const selfScoped = granter([{ scopeType: 'self', scopeId: null }]);
    await expect(
      svc.grant(selfScoped, { granteeId: UUID_B, orgUnitId: UUID_ORG }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('[F115] list: orgUnitId tường minh ngoài scope → 403', () => {
    expect(() => svc.list(orgScoped, UUID_ORG2)).toThrow(ForbiddenException);
  });
});
