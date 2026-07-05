import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import type { IpmsJwtClaims } from '@ipms/shared';
import { PUBLIC_KEY } from './decorators';

/**
 * AuthN — Phase 0: JWT HS256 nội bộ (dev). Claims map sẵn theo chuẩn Entra (sub/tid/oid/email)
 * → Phase sau thay verify bằng JWKS Entra ID (RS256, issuer/audience) mà không đổi contract.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const claims = jwt.verify(header.slice(7), getJwtSecret()) as IpmsJwtClaims;
      if (!claims.sub || !claims.tid) throw new Error('missing sub/tid');
      req.ipmsClaims = claims;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

/**
 * [F2] Fail-closed: secret BẮT BUỘC tồn tại. Fallback dev chỉ khi opt-in tường minh
 * ALLOW_INSECURE_DEV_SECRET=true — không dựa vào sự vắng mặt của NODE_ENV=production.
 */
export function getJwtSecret(): string {
  const s = process.env.DEV_JWT_SECRET;
  if (s) return s;
  if (process.env.ALLOW_INSECURE_DEV_SECRET === 'true') {
    return 'ipms-dev-secret-do-not-use-in-prod';
  }
  throw new Error('DEV_JWT_SECRET is required (or set ALLOW_INSECURE_DEV_SECRET=true for local dev only)');
}
