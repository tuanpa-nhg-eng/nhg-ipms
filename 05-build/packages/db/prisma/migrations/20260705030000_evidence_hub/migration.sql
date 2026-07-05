-- CreateEnum
CREATE TYPE "evidence_status" AS ENUM ('pending', 'verified', 'rejected', 'duplicated');

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "owner_id" UUID,
    "related_goal_id" UUID,
    "related_kpi_id" UUID,
    "task_cell_ref" TEXT,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT,
    "uri" TEXT,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(6),
    "status" "evidence_status" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "confidentiality" TEXT NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_tenant_id_related_kpi_id_idx" ON "evidence"("tenant_id", "related_kpi_id");

-- CreateIndex
CREATE INDEX "evidence_tenant_id_owner_id_occurred_at_idx" ON "evidence"("tenant_id", "owner_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_tenant_id_source_system_external_id_key" ON "evidence"("tenant_id", "source_system", "external_id");

