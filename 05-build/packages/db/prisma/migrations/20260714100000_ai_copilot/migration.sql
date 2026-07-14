-- Phase 3 — P1 Copilot: phiên hội thoại + tin nhắn (Spec AI Assistant §5.1, §7)
-- RLS fail-closed tenant-bound (chuẩn ai_gateway lát 4a).

CREATE TABLE "ai_conversation" (
  "id"          uuid PRIMARY KEY,
  "tenant_id"   uuid NOT NULL,
  "user_id"     uuid NOT NULL,
  "title"       text NOT NULL,
  "context_ref" jsonb,
  "created_at"  timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"  timestamptz(6) NOT NULL,
  "deleted_at"  timestamptz(6)
);
CREATE INDEX "ai_conversation_tenant_user_updated_idx"
  ON "ai_conversation" ("tenant_id", "user_id", "updated_at");

CREATE TABLE "ai_message" (
  "id"              uuid PRIMARY KEY,
  "tenant_id"       uuid NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "ai_conversation"("id"),
  "role"            text NOT NULL,
  "content"         text NOT NULL,
  "model"           text,
  "tool_calls"      jsonb,
  "suggestion_id"   uuid,
  "tokens_in"       integer,
  "tokens_out"      integer,
  "created_at"      timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX "ai_message_tenant_conv_created_idx"
  ON "ai_message" ("tenant_id", "conversation_id", "created_at");

-- RLS: cô lập tenant; thiếu app.tenant_id ⇒ 0 dòng
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_conversation','ai_message'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO ipms_app', t);
  END LOOP;
END
$$;
