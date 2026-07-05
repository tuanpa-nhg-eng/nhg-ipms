import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiErrorFilter } from './common/api-error.filter';
import { PrismaService } from './prisma.service';
import { JwtGuard } from './common/auth/jwt.guard';
import { TenantGuard } from './common/auth/tenant.guard';
import { PermissionGuard } from './common/auth/permission.guard';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { AuthController } from './modules/auth/auth.controller';
import { TenantController } from './modules/tenant/tenant.controller';
import { OrgController } from './modules/org/org.controller';
import { OrgService } from './modules/org/org.service';
import { PersonController } from './modules/person/person.controller';
import { PersonService } from './modules/person/person.service';
import { KpiController } from './modules/kpi/kpi.controller';
import { KpiService } from './modules/kpi/kpi.service';
import { ScorecardController } from './modules/kpi/scorecard.controller';
import { ScorecardService } from './modules/kpi/scorecard.service';

@Module({
  controllers: [
    AuthController, TenantController, OrgController, PersonController,
    KpiController, ScorecardController,
  ],
  providers: [
    PrismaService,
    OrgService,
    PersonService,
    KpiService,
    ScorecardService,
    // Guard pipeline TDD §11: Jwt → Tenant → Permission (Scope Phase 0 = tenant-level)
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
})
export class AppModule {}
