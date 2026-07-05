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
import { StrategyController } from './modules/strategy/strategy.controller';
import { StrategyService } from './modules/strategy/strategy.service';
import { GoalController } from './modules/strategy/goal.controller';
import { GoalService } from './modules/strategy/goal.service';
import { EvidenceController } from './modules/evidence/evidence.controller';
import { EvidenceService } from './modules/evidence/evidence.service';
import { CheckinController } from './modules/checkin/checkin.controller';
import { CheckinService } from './modules/checkin/checkin.service';
import { ReviewController } from './modules/review/review.controller';
import { ReviewService } from './modules/review/review.service';
import { CalibrationController } from './modules/review/calibration.controller';
import { CalibrationService } from './modules/review/calibration.service';
import { ExportController } from './modules/review/export.controller';
import { ConfigController } from './modules/config/config.controller';
import { ConfigService } from './modules/config/config.service';
import { BrandController } from './modules/config/brand.controller';
import { OrgFunctionController } from './modules/config/org-function.controller';
import { DerivationController } from './modules/derivation/derivation.controller';
import { DerivationService } from './modules/derivation/derivation.service';
import { ProcessController } from './modules/process/process.controller';
import { ProcessService } from './modules/process/process.service';
import { IntegrationController } from './modules/integration/integration.controller';
import { IntegrationService } from './modules/integration/integration.service';

@Module({
  controllers: [
    AuthController, TenantController, OrgController, PersonController,
    KpiController, ScorecardController, StrategyController, GoalController,
    EvidenceController, CheckinController, ReviewController, CalibrationController,
    ExportController,
    ConfigController, BrandController, OrgFunctionController, DerivationController,
    ProcessController, IntegrationController,
  ],
  providers: [
    PrismaService,
    OrgService,
    PersonService,
    KpiService,
    ScorecardService,
    StrategyService,
    GoalService,
    EvidenceService,
    CheckinService,
    ReviewService,
    CalibrationService,
    ConfigService,
    DerivationService,
    ProcessService,
    IntegrationService,
    // Guard pipeline TDD §11: Jwt → Tenant → Permission (Scope Phase 0 = tenant-level)
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
})
export class AppModule {}
