-- [Learning Loop L0] ai_learning_signal — tín hiệu học từ quyết định người dùng
-- trên ai_suggestion (Chấp nhận / Sửa rồi chấp nhận / Bỏ / hết hạn F158).
-- Corpus học APPEND-ONLY (chuẩn ai_interaction/audit_log): chặn UPDATE/DELETE kể cả owner.

-- CreateTable
CREATE TABLE "ai_learning_signal" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "suggestion_id" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "proposed_payload" JSONB,
    "final_payload" JSONB,
    "edited_fields" JSONB,
    "actor_user_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_learning_signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_learning_signal_tenant_id_agent_outcome_idx"
  ON "ai_learning_signal"("tenant_id", "agent", "outcome");
CREATE INDEX "ai_learning_signal_tenant_id_suggestion_id_idx"
  ON "ai_learning_signal"("tenant_id", "suggestion_id");

-- Whitelist outcome tại tầng DB (chuẩn F137/F72 — row lạ không lọt vào corpus học)
ALTER TABLE "ai_learning_signal" ADD CONSTRAINT "ai_learning_signal_outcome_check"
  CHECK (outcome IN ('accepted', 'accepted_with_edits', 'rejected', 'expired'));

-- RLS tenant-bound fail-closed (thiếu context ⇒ 0 dòng)
ALTER TABLE ai_learning_signal ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_learning_signal
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- APPEND-ONLY: app chỉ SELECT + INSERT; trigger chặn UPDATE/DELETE kể cả owner
GRANT SELECT, INSERT ON ai_learning_signal TO ipms_app;

CREATE OR REPLACE FUNCTION ai_learning_signal_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_learning_signal is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ai_learning_signal_append_only
  BEFORE UPDATE OR DELETE ON ai_learning_signal
  FOR EACH ROW EXECUTE FUNCTION ai_learning_signal_block_mutation();
