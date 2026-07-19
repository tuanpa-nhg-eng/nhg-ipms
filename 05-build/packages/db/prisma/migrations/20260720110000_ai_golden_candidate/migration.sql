-- [Learning Loop L1] ai_golden_candidate — ứng viên golden case từ tín hiệu học,
-- curator duyệt (SoD trên thước đo) mới thành ai_eval_case.

-- CreateTable
CREATE TABLE "ai_golden_candidate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "signal_id" UUID NOT NULL,
    "suggestion_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "source_actor_user_id" UUID,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "case_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_golden_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: 1 tín hiệu → tối đa 1 candidate (harvest idempotent)
CREATE UNIQUE INDEX "ai_golden_candidate_tenant_id_signal_id_key"
  ON "ai_golden_candidate"("tenant_id", "signal_id");
CREATE INDEX "ai_golden_candidate_tenant_id_status_idx"
  ON "ai_golden_candidate"("tenant_id", "status");

-- Whitelist status tại tầng DB (chuẩn F137)
ALTER TABLE "ai_golden_candidate" ADD CONSTRAINT "ai_golden_candidate_status_check"
  CHECK (status IN ('proposed', 'approved', 'rejected'));

-- RLS tenant-bound fail-closed + grants (bảng vòng đời thường — có UPDATE, không DELETE)
ALTER TABLE ai_golden_candidate ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_golden_candidate
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_golden_candidate TO ipms_app;
