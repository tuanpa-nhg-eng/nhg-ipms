import { Body, Controller, ForbiddenException, NotFoundException, Post, Get } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient } from '@ipms/db';
import type { IpmsJwtClaims } from '@ipms/shared';
import { Public } from '../../common/auth/decorators';
import { getJwtSecret } from '../../common/auth/jwt.guard';

class DevTokenDto {
  @IsString() tenantCode!: string;
  @IsEmail() email!: string;
}

/**
 * DEV-ONLY token issuer — bật bằng ALLOW_DEV_TOKEN=true, CẤM ở production.
 * Lookup dùng OWNER_DATABASE_URL (bypass RLS) vì chưa có tenant context trước khi đăng nhập.
 * Phase sau: thay bằng OIDC/PKCE Entra ID (TDD §11) — endpoint này bị xoá.
 */
@Controller('auth')
export class AuthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ipms-api' };
  }

  @Public()
  @Post('dev-token')
  async devToken(@Body() dto: DevTokenDto) {
    if (process.env.ALLOW_DEV_TOKEN !== 'true' || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('dev-token disabled');
    }
    const owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    try {
      const tenant = await owner.tenant.findUnique({ where: { code: dto.tenantCode } });
      if (!tenant) throw new NotFoundException('tenant not found');
      const user = await owner.appUser.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      });
      if (!user || user.status !== 'active') throw new NotFoundException('user not found');

      const claims: IpmsJwtClaims = {
        sub: user.id,
        tid: tenant.id,
        email: user.email,
        person_id: user.personId ?? undefined,
      };
      const token = jwt.sign(claims, getJwtSecret(), { expiresIn: '8h' });
      return { access_token: token, tenant_id: tenant.id, user_id: user.id };
    } finally {
      await owner.$disconnect();
    }
  }
}
