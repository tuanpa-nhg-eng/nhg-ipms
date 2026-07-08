-- CreateTable
CREATE TABLE "mcp_tool" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "name" TEXT NOT NULL,
    "description_vi" TEXT,
    "input_schema" JSONB NOT NULL DEFAULT '{}',
    "scope_permission" TEXT NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "mcp_tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interaction" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "agent" TEXT NOT NULL,
    "tool_name" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "input" JSONB,
    "output" JSONB,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_version_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by_tool" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_suite" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_eval_suite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_case" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "name" TEXT,
    "input" JSONB NOT NULL,
    "expected" JSONB,
    "assertions" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_eval_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_eval_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_result" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "score" DECIMAL(4,3),
    "passed" BOOLEAN NOT NULL,
    "judge_output" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_eval_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tool_tenant_id_name_key" ON "mcp_tool"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "ai_interaction_tenant_id_at_idx" ON "ai_interaction"("tenant_id", "at");

-- CreateIndex
CREATE INDEX "ai_interaction_tenant_id_tool_name_idx" ON "ai_interaction"("tenant_id", "tool_name");

-- CreateIndex
CREATE INDEX "ai_suggestion_tenant_id_status_idx" ON "ai_suggestion"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_eval_suite_tenant_id_agent_name_key" ON "ai_eval_suite"("tenant_id", "agent", "name");

-- CreateIndex
CREATE INDEX "ai_eval_case_tenant_id_suite_id_idx" ON "ai_eval_case"("tenant_id", "suite_id");

-- CreateIndex
CREATE INDEX "ai_eval_run_tenant_id_suite_id_idx" ON "ai_eval_run"("tenant_id", "suite_id");

-- CreateIndex
CREATE INDEX "ai_eval_result_run_id_idx" ON "ai_eval_result"("run_id");

-- AddForeignKey
ALTER TABLE "ai_eval_case" ADD CONSTRAINT "ai_eval_case_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "ai_eval_suite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_eval_run" ADD CONSTRAINT "ai_eval_run_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "ai_eval_suite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_eval_result" ADD CONSTRAINT "ai_eval_result_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_eval_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

