-- Phase 3 lát 4c — Policy-as-Code (#2): bảng access_policy (Cedar)
-- CreateTable
CREATE TABLE "access_policy" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'cedar',
    "policy_text" TEXT NOT NULL,
    "scope" TEXT,
    "tests" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "access_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_policy_tenant_id_name_key" ON "access_policy"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "access_policy_tenant_id_status_idx" ON "access_policy"("tenant_id", "status");

-- [chuẩn F56] unique NULL không chặn nhau trong Postgres — partial unique cho policy global
CREATE UNIQUE INDEX "access_policy_global_name_key" ON "access_policy"("name")
  WHERE "tenant_id" IS NULL AND "deleted_at" IS NULL;
