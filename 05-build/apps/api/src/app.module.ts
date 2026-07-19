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
import { CanvasController } from './modules/config/canvas.controller';
import { TaskCellController } from './modules/config/taskcell.controller';
import { DerivationController } from './modules/derivation/derivation.controller';
import { DerivationService } from './modules/derivation/derivation.service';
import { ProcessController } from './modules/process/process.controller';
import { ProcessService } from './modules/process/process.service';
import { IntegrationController } from './modules/integration/integration.controller';
import { IntegrationService } from './modules/integration/integration.service';
import { ConnectorRegistry } from './modules/integration/connectors/connector.registry';
import { OutboxDispatcher } from './modules/integration/outbox.dispatcher';
import { MorningTodosService } from './modules/integration/morning-todos.service';
import { AiGatewayService } from './modules/ai/ai-gateway.service';
import { AiChatService } from './modules/ai/ai-chat.service';
import { AiChatController } from './modules/ai/ai-chat.controller';
import { McpController } from './modules/ai/mcp/mcp.controller';
import { McpService } from './modules/ai/mcp/mcp.service';
import { EvalController } from './modules/ai/eval/eval.controller';
import { EvalService } from './modules/ai/eval/eval.service';
import { InlineAssistController } from './modules/ai/inline/inline-assist.controller';
import { InlineAssistService } from './modules/ai/inline/inline-assist.service';
import { LearningController } from './modules/ai/learning/learning.controller';
import { LearningService } from './modules/ai/learning/learning.service';
import { GoldenController } from './modules/ai/learning/golden.controller';
import { GoldenService } from './modules/ai/learning/golden.service';
import { LibraryController } from './modules/library/library.controller';
import { LibraryService } from './modules/library/library.service';
import { AuthoringController } from './modules/authoring/authoring.controller';
import { AuthoringService } from './modules/authoring/authoring.service';
import { DictionaryController } from './modules/dictionary/dictionary.controller';
import { DictionaryService } from './modules/dictionary/dictionary.service';
import { TaskLoopController } from './modules/taskloop/taskloop.controller';
import { TaskLoopService } from './modules/taskloop/taskloop.service';
import { PolicyController } from './modules/policy/policy.controller';
import { PolicyService } from './modules/policy/policy.service';
import { PolicyGuard } from './modules/policy/policy.guard';

@Module({
  controllers: [
    AuthController, TenantController, OrgController, PersonController,
    KpiController, ScorecardController, StrategyController, GoalController,
    EvidenceController, CheckinController, ReviewController, CalibrationController,
    ExportController,
    ConfigController, BrandController, OrgFunctionController, CanvasController,
    TaskCellController, DerivationController,
    ProcessController, IntegrationController,
    McpController, AiChatController, EvalController, InlineAssistController, LearningController, GoldenController, PolicyController, LibraryController,
    AuthoringController, DictionaryController, TaskLoopController,
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
    ConnectorRegistry,
    OutboxDispatcher,
    MorningTodosService,
    AiGatewayService,
    AiChatService,
    McpService,
    EvalService,
    InlineAssistService,
    LearningService,
    GoldenService,
    PolicyService,
    LibraryService,
    AuthoringService,
    DictionaryService,
    TaskLoopService,
    // Guard pipeline Spec Config Studio §7: Jwt → Tenant → Permission (RBAC) → Policy (ABAC #2)
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
})
export class AppModule {}
