-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('draft', 'active', 'at_risk', 'off_track', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "objective_kind" AS ENUM ('okr', 'kgi');

-- CreateTable
CREATE TABLE "strategic_theme" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "period" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "strategic_theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objective" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "objective_kind" NOT NULL,
    "theme_id" UUID,
    "parent_id" UUID,
    "org_unit_id" UUID,
    "owner_id" UUID,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "period" TEXT NOT NULL,
    "weight" DECIMAL(5,2),
    "status" "goal_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "objective_id" UUID,
    "owner_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "period" TEXT NOT NULL,
    "weight" DECIMAL(5,2),
    "parent_goal_id" UUID,
    "status" "goal_status" NOT NULL DEFAULT 'draft',
    "health_score" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_category" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_formula" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "expression" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_formula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "definition" TEXT,
    "method" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "formula_id" UUID,
    "data_source" TEXT,
    "unit" TEXT,
    "frequency" TEXT NOT NULL,
    "evidence_required" BOOLEAN NOT NULL DEFAULT true,
    "risk_level" TEXT,
    "kpi_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approval_owner_id" UUID,
    "task_cell_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_score_tier" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kpi_id" UUID,
    "scorecard_item_id" UUID,
    "min_pct" DECIMAL(5,2) NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_score_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_applicability" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "position_id" UUID,
    "role_family_id" UUID,
    "min_seniority_months" INTEGER,
    "person_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_applicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "role_family_id" UUID,
    "org_unit_id" UUID,
    "period" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "group_label" TEXT,
    "weight" DECIMAL(5,2),
    "group_weight" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "scorecard_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objective_tenant_id_kind_idx" ON "objective"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "goal_tenant_id_owner_id_period_idx" ON "goal"("tenant_id", "owner_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_tenant_id_code_kpi_version_key" ON "kpi"("tenant_id", "code", "kpi_version");

-- CreateIndex
CREATE INDEX "kpi_score_tier_tenant_id_kpi_id_idx" ON "kpi_score_tier"("tenant_id", "kpi_id");

-- CreateIndex
CREATE INDEX "scorecard_item_tenant_id_scorecard_id_idx" ON "scorecard_item"("tenant_id", "scorecard_id");

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "strategic_theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_parent_goal_id_fkey" FOREIGN KEY ("parent_goal_id") REFERENCES "goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_category" ADD CONSTRAINT "kpi_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "kpi_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "kpi_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi" ADD CONSTRAINT "kpi_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "kpi_formula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_score_tier" ADD CONSTRAINT "kpi_score_tier_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_applicability" ADD CONSTRAINT "kpi_applicability_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_item" ADD CONSTRAINT "scorecard_item_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_item" ADD CONSTRAINT "scorecard_item_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

