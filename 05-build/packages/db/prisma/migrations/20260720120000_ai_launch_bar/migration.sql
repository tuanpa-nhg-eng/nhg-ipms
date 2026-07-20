-- [Learning Loop L2] ai_launch_bar — ngưỡng eval per agent (AI-Native PRD §14).
-- Điều kiện CẦN để cân nhắc bật live; readiness fail-closed khi thiếu bar/run.

-- CreateTable
CREATE TABLE "ai_launch_bar" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "min_pass_rate" DECIMAL(4,3) NOT NULL,
    "min_cases" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_launch_bar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_launch_bar_tenant_id_agent_key" ON "ai_launch_bar"("tenant_id", "agent");

-- Ngưỡng hợp lệ tại tầng DB (chuẩn F137/F72)
ALTER TABLE "ai_launch_bar" ADD CONSTRAINT "ai_launch_bar_min_pass_rate_check"
  CHECK (min_pass_rate > 0 AND min_pass_rate <= 1);
ALTER TABLE "ai_launch_bar" ADD CONSTRAINT "ai_launch_bar_min_cases_check"
  CHECK (min_cases >= 1 AND min_cases <= 1000);

-- RLS tenant-bound fail-closed + grants
ALTER TABLE ai_launch_bar ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_launch_bar
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_launch_bar TO ipms_app;
