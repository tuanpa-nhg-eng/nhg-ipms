import {
  Body, Controller, ForbiddenException, NotFoundException, Post, Get,
  OnModuleDestroy,
} from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient, PrismaClient } from '@ipms/db';
import type { IpmsJwtClaims } from '@ipms/shared';
import { Public } from '../../common/auth/decorators';
import { getJwtSecret } from '../../common/auth/jwt.guard';

class DevTokenDto {
  @IsString() tenantCode!: string;
  @IsEmail() email!: string;
}

/**
 * DEV-ONLY token issuer — bật bằng ALLOW_DEV_TOKEN=true, CẤM ở production.
 * [F7] Owner client singleton (lazy) — không tạo pool mới mỗi request;
 * message lỗi gộp chung — chống tenant/user enumeration.
 * Phase sau: thay bằng OIDC/PKCE Entra ID (TDD §11) — endpoint này bị xoá,
 * OWNER_DATABASE_URL bị rút khỏi API deployment.
 */
@Controller('auth')
export class AuthController implements OnModuleDestroy {
  private owner?: PrismaClient;

  private ownerClient(): PrismaClient {
    if (!this.owner) this.owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    return this.owner;
  }

  async onModuleDestroy() {
    await this.owner?.$disconnect();
  }

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
    const owner = this.ownerClient();
    const tenant = await owner.tenant.findUnique({ where: { code: dto.tenantCode } });
    const user = tenant
      ? await owner.appUser.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
        })
      : null;
    // [F7] một message duy nhất — không phân biệt tenant/user sai
    if (!tenant || !user || user.status !== 'active') {
      throw new NotFoundException('invalid credentials');
    }

    const claims: IpmsJwtClaims = {
      sub: user.id,
      tid: tenant.id,
      email: user.email,
      person_id: user.personId ?? undefined,
    };
    const token = jwt.sign(claims, getJwtSecret(), { expiresIn: '8h' });
    return { access_token: token, tenant_id: tenant.id, user_id: user.id };
  }
}
