-- DropIndex
DROP INDEX "config_change_config_version_id_seq_idx";

-- CreateTable
CREATE TABLE "process" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_step" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "responsible_role" TEXT,
    "config" JSONB,
    "task_cell_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "process_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_edge" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "from_step_id" UUID,
    "to_step_id" UUID,
    "condition" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "process_edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connection" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT,
    "auth_ref" TEXT,
    "scopes" TEXT[],
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_binding" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "connection_id" UUID NOT NULL,
    "local_type" TEXT NOT NULL,
    "local_id" UUID,
    "direction" TEXT NOT NULL,
    "external_target" JSONB,
    "field_map" JSONB NOT NULL,
    "sync_policy" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_contract" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "provider" TEXT NOT NULL,
    "direction" TEXT,
    "schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "connection_id" UUID,
    "binding_id" UUID,
    "type" TEXT NOT NULL,
    "cursor" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'running',
    "stats" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_record" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "binding_id" UUID,
    "local_type" TEXT,
    "local_id" UUID,
    "external_id" TEXT NOT NULL,
    "external_etag" TEXT,
    "last_synced_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'in_sync',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "process_tenant_id_code_config_version_id_key" ON "process"("tenant_id", "code", "config_version_id");

-- CreateIndex
CREATE INDEX "process_step_tenant_id_process_id_seq_idx" ON "process_step"("tenant_id", "process_id", "seq");

-- CreateIndex
CREATE INDEX "integration_run_tenant_id_status_idx" ON "integration_run"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_record_tenant_id_binding_id_external_id_key" ON "sync_record"("tenant_id", "binding_id", "external_id");

-- CreateIndex
CREATE INDEX "outbox_event_status_created_at_idx" ON "outbox_event"("status", "created_at");

-- AddForeignKey
ALTER TABLE "process_step" ADD CONSTRAINT "process_step_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_edge" ADD CONSTRAINT "process_edge_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_binding" ADD CONSTRAINT "integration_binding_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_run" ADD CONSTRAINT "integration_run_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "config_change_version_seq_uq" RENAME TO "config_change_config_version_id_seq_key";

