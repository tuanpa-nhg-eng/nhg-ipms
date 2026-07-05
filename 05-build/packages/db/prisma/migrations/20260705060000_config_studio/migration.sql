-- CreateEnum
CREATE TYPE "config_status" AS ENUM ('draft', 'preview', 'published', 'archived');

-- AlterTable
ALTER TABLE "org_unit" ADD COLUMN     "config_version_id" UUID,
ADD COLUMN     "grade" TEXT;

-- AlterTable
ALTER TABLE "scorecard_item" ADD COLUMN     "config_version_id" UUID,
ADD COLUMN     "manual_override" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "config_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "config_status" NOT NULL DEFAULT 'draft',
    "based_on_id" UUID,
    "note" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "config_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_change" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "op" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "seq" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "display_name" TEXT,
    "logo_light_uri" TEXT,
    "logo_dark_uri" TEXT,
    "favicon_uri" TEXT,
    "custom_domain" TEXT,
    "tokens" JSONB NOT NULL DEFAULT '{}',
    "a11y_checked" BOOLEAN NOT NULL DEFAULT false,
    "status" "config_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "brand_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_function" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "org_function_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_function" (
    "tenant_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "function_id" UUID NOT NULL,
    "weight" DECIMAL(5,2),

    CONSTRAINT "org_unit_function_pkey" PRIMARY KEY ("org_unit_id","function_id")
);

-- CreateTable
CREATE TABLE "sod_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "permission_a" TEXT NOT NULL,
    "permission_b" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'high',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sod_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "method" TEXT,
    "direction" TEXT,
    "unit" TEXT,
    "frequency" TEXT,
    "formula_expr" TEXT,
    "default_tier" JSONB,
    "function_tags" TEXT[],
    "role_family_codes" TEXT[],
    "task_cell_refs" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kpi_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_cell" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "code" TEXT NOT NULL,
    "group_code" TEXT,
    "cluster_code" TEXT,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "responsible_role" TEXT,
    "accountable_role" TEXT,
    "consulted" JSONB,
    "informed" JSONB,
    "inputs" JSONB,
    "outputs" JSONB,
    "measures" JSONB,
    "ai_level" TEXT,
    "ai_dimension" JSONB,
    "governance" JSONB,
    "risk_level" TEXT,
    "lifecycle" JSONB,
    "kpi_ref" TEXT,
    "process_step_id" UUID,
    "attrs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "task_cell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derivation_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "match" JSONB NOT NULL,
    "emit" JSONB NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "derivation_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derivation_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "diff" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "derivation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derivation_result" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "derivation_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cascade_link" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "okr_id" UUID,
    "kgi_id" UUID,
    "kpi_id" UUID,
    "task_cell_ref" TEXT,
    "org_unit_id" UUID,
    "position_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cascade_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_version_tenant_id_status_idx" ON "config_version"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "config_version_tenant_id_label_key" ON "config_version"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "config_change_config_version_id_seq_idx" ON "config_change"("config_version_id", "seq");

-- CreateIndex
CREATE INDEX "brand_kit_tenant_id_config_version_id_idx" ON "brand_kit"("tenant_id", "config_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_function_tenant_id_code_key" ON "org_function"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "org_unit_function_tenant_id_function_id_idx" ON "org_unit_function"("tenant_id", "function_id");

-- CreateIndex
CREATE UNIQUE INDEX "sod_rule_tenant_id_permission_a_permission_b_key" ON "sod_rule"("tenant_id", "permission_a", "permission_b");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_template_tenant_id_code_key" ON "kpi_template"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "task_cell_tenant_id_code_config_version_id_key" ON "task_cell"("tenant_id", "code", "config_version_id");

-- CreateIndex
CREATE INDEX "derivation_rule_tenant_id_config_version_id_idx" ON "derivation_rule"("tenant_id", "config_version_id");

-- CreateIndex
CREATE INDEX "derivation_result_run_id_target_type_idx" ON "derivation_result"("run_id", "target_type");

-- CreateIndex
CREATE INDEX "cascade_link_tenant_id_kpi_id_idx" ON "cascade_link"("tenant_id", "kpi_id");

-- AddForeignKey
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_based_on_id_fkey" FOREIGN KEY ("based_on_id") REFERENCES "config_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_change" ADD CONSTRAINT "config_change_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "config_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_function" ADD CONSTRAINT "org_unit_function_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "org_function"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derivation_result" ADD CONSTRAINT "derivation_result_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "derivation_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

