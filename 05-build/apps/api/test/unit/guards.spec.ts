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
  const prismaMock = (perms: string[], status: string | null = 'active', sessionEnded = false) =>
    ({
      withTenant: async (_t: string, fn: any) =>
        fn({
          appUser: { findFirst: async () => (status === null ? null : { status }) },
          impersonationSession: { findFirst: async () => (sessionEnded ? null : { id: 'sid' }) },
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

  // [Trục B L1 — J8] Token còn hạn (8h) nhưng tài khoản bị khoá SAU khi phát token —
  // guard đọc lại status mỗi request, không tin claim trong JWT (JWT không có status).
  it('[J8] rejects khi app_user.status khác active — dù đủ quyền', async () => {
    const guard = new PermissionGuard(
      reflectorReturning({ 'ipms:permission': 'org:read' }),
      prismaMock(['org:read'], 'disabled'),
    );
    await expect(guard.canActivate(ctxWith(baseReq()))).rejects.toThrow(UnauthorizedException);
  });

  it('[J8] rejects khi app_user đã bị xoá (không còn row) — fail-closed', async () => {
    const guard = new PermissionGuard(
      reflectorReturning({ 'ipms:permission': 'org:read' }),
      prismaMock(['org:read'], null),
    );
    await expect(guard.canActivate(ctxWith(baseReq()))).rejects.toThrow(UnauthorizedException);
  });

  // [Trục B L4 — J11] Đang đóng vai (`act` có mặt) → giao đúng GIAO của quyền target với
  // whitelist chỉ-đọc, dù target THẬT SỰ giữ quyền ghi được yêu cầu.
  describe('[J11] Impersonation — whitelist chỉ-đọc', () => {
    const impReq = () => ({ ipmsTenantId: T1, ipmsClaims: { sub: U1, act: 'actor-1', imp_sid: 'sid' } });

    it('chặn quyền GHI dù target thật sự giữ (org:write không nằm trong whitelist)', async () => {
      const guard = new PermissionGuard(
        reflectorReturning({ 'ipms:permission': 'org:write' }),
        prismaMock(['org:write']),
      );
      await expect(guard.canActivate(ctxWith(impReq()))).rejects.toThrow(ForbiddenException);
    });

    it('cho qua quyền ĐỌC target giữ (org:read nằm trong whitelist)', async () => {
      const guard = new PermissionGuard(
        reflectorReturning({ 'ipms:permission': 'org:read' }),
        prismaMock(['org:read', 'org:write']),
      );
      const req: any = impReq();
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      // [Tự bắt — J4] permissions gắn vào RequestUser phải là bộ ĐÃ LỌC, không phải bộ thật
      // của target — nếu không, /me/access sẽ báo sai (hiện org:write trong khi mọi request
      // ghi thực tế đều bị chặn), FE hiện nút rồi ăn 403.
      expect(req.ipmsUser.permissions.has('org:read')).toBe(true);
      expect(req.ipmsUser.permissions.has('org:write')).toBe(false);
    });

    it('không ảnh hưởng khi KHÔNG đóng vai — permissions giữ nguyên đầy đủ', async () => {
      const guard = new PermissionGuard(
        reflectorReturning({ 'ipms:permission': 'org:write' }),
        prismaMock(['org:write']),
      );
      const req: any = baseReq(); // không có claim `act`
      await expect(guard.canActivate(ctxWith(req))).resolves.toBe(true);
      expect(req.ipmsUser.permissions.has('org:write')).toBe(true);
    });

    it('[Tự bắt] "Thoát" phải có hiệu lực NGAY — token cũ dùng lại sau khi phiên đã kết thúc → 401', async () => {
      const guard = new PermissionGuard(
        reflectorReturning({ 'ipms:permission': 'org:read' }),
        prismaMock(['org:read'], 'active', /* sessionEnded */ true),
      );
      await expect(guard.canActivate(ctxWith(impReq()))).rejects.toThrow(UnauthorizedException);
    });
  });
});
