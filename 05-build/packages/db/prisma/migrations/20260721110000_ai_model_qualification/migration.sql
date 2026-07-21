-- [Last-mile Lát 4] Model-Qualification Gate — cấm silent-swap model phục vụ 1 agent.
-- ai_agent_model: model ĐANG PHỤC VỤ agent khi live (pin tường minh, config-as-data).
-- ai_model_qualification: bằng chứng "model X chạy golden suite của agent Y, đạt bar"
-- — APPEND-ONLY (chuẩn ai_learning_signal/ai_interaction — không sửa/xoá được sau khi
-- cấp, kể cả owner) — điều kiện CẦN duy nhất để setServingModel() chấp nhận đổi model.

-- CreateTable: ai_agent_model
CREATE TABLE "ai_agent_model" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_agent_model_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_agent_model_tenant_agent_key" ON "ai_agent_model"("tenant_id", "agent");

ALTER TABLE ai_agent_model ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_agent_model
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_agent_model TO ipms_app;

-- CreateTable: ai_model_qualification (APPEND-ONLY)
CREATE TABLE "ai_model_qualification" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "pass_rate" DECIMAL(4,3) NOT NULL,
    "cases_total" INTEGER NOT NULL,
    "run_ids" JSONB NOT NULL,
    "qualified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualified_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_qualification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_model_qualification_tenant_agent_model_idx"
  ON "ai_model_qualification"("tenant_id", "agent", "model");

ALTER TABLE "ai_model_qualification" ADD CONSTRAINT "ai_model_qualification_pass_rate_check"
  CHECK (pass_rate >= 0 AND pass_rate <= 1);
ALTER TABLE "ai_model_qualification" ADD CONSTRAINT "ai_model_qualification_cases_total_check"
  CHECK (cases_total >= 0);

ALTER TABLE ai_model_qualification ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_model_qualification
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON ai_model_qualification TO ipms_app;

CREATE OR REPLACE FUNCTION ai_model_qualification_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_model_qualification is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ai_model_qualification_append_only
  BEFORE UPDATE OR DELETE ON ai_model_qualification
  FOR EACH ROW EXECUTE FUNCTION ai_model_qualification_block_mutation();
