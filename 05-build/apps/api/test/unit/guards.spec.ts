import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtGuard, getJwtSecret } from '../../src/common/auth/jwt.guard';
import { TenantGuard } from '../../src/common/auth/tenant.guard';
import { PermissionGuard } from '../../src/common/auth/permission.guard';

const T1 = '018f0000-0000-7000-8000-000000000001';
const U1 = '018f0000-0000-7000-8000-000000000002';

function ctxWith(req: any, handlerMeta: Record<string, any> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handlerMeta,
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflectorReturning(map: Record<string, any>): Reflector {
  return {
    getAllAndOverride: (key: string) => map[key],
    get: (key: string) => map[key],
  } as unknown as Reflector;
}

describe('JwtGuard', () => {
  it('rejects missing bearer', () => {
    const guard = new JwtGuard(reflectorReturning({}));
    expect(() => guard.canActivate(ctxWith({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('rejects tampered token', () => {
    const guard = new JwtGuard(reflectorReturning({}));
    const bad = jwt.sign({ sub: U1, tid: T1, email: 'a@b.c' }, 'WRONG-SECRET');
    expect(() =>
      guard.canActivate(ctxWith({ headers: { authorization: `Bearer ${bad}` } })),
    ).toThrow(UnauthorizedException);
  });

  it('accepts valid token and attaches claims', () => {
    const guard = new JwtGuard(reflectorReturning({}));
    const good = jwt.sign({ sub: U1, tid: T1, email: 'a@b.c' }, getJwtSecret());
    const req: any = { headers: { authorization: `Bearer ${good}` } };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect(req.ipmsClaims.tid).toBe(T1);
  });
});

describe('TenantGuard', () => {
  const guard = new TenantGuard(reflectorReturning({}));

  it('rejects missing X-Tenant-Id', () => {
    const req: any = { headers: {}, ipmsClaims: { tid: T1 } };
    expect(() => guard.canActivate(ctxWith(req))).toThrow(ForbiddenException);
  });

  it('rejects tenant mismatch (chống nhầm tenant)', () => {
    const req: any = { headers: { 'x-tenant-id': 'other' }, ipmsClaims: { tid: T1 } };
    expect(() => guard.canActivate(ctxWith(req))).toThrow(ForbiddenException);
  });

  it('accepts matching tenant', () => {
    const req: any = { headers: { 'x-tenant-id': T1 }, ipmsClaims: { tid: T1 } };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect(req.ipmsTenantId).toBe(T1);
  });
});

describe('PermissionGuard (fail-closed)', () => {
  const prismaMock = (perms: string[]) =>
    ({
      withTenant: async (_t: string, fn: any) =>
        fn({
          userRole: { findMany: async () => (perms.length ? [{ roleId: 'r1' }] : []) },
          rolePermission: {
            findMany: async () => perms.map((code) => ({ permission: { code } })),
          },
        }),
    }) as any;

  const baseReq = () => ({ ipmsTenantId: T1, ipmsClaims: { sub: U1 } });

  it('rejects endpoint WITHOUT @RequirePermission (fail-closed)', async () => {
    const guard = new PermissionGuard(reflectorReturning({ 'ipms:permission': undefined }), prismaMock(['org:read']));
    await expect(guard.canActivate(ctxWith(baseReq()))).rejects.toThrow(ForbiddenException);
  });

  it('rejects user missing the permission', async () => {
    const guard = new PermissionGuard(reflectorReturning({ 'ipms:permission': 'org:write' }), prismaMock(['org:read']));
    await expect(guard.canActivate(ctxWith(baseReq()))).rejects.toThrow(ForbiddenException);
  });

  it('accepts user with permission', async () => {
    const guard = new PermissionGuard(reflectorReturning({ 'ipms:permission': 'org:read' }), prismaMock(['org:read']));
    const req: any = baseReq();
    await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
    expect(req.ipmsUser.permissions.has('org:read')).toBe(true);
  });
});
