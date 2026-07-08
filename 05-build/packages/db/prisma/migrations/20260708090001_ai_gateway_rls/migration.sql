-- Phase 3 lát 4a — RLS + grants: ai-gateway + MCP + eval harness
-- Chuẩn RLS fail-closed: tenant_id = current_setting('app.tenant_id') — thiếu context ⇒ 0 dòng.

-- 1. Bảng tenant-bound thường: ai_suggestion + ai_eval_*
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_suggestion','ai_eval_suite','ai_eval_case','ai_eval_run','ai_eval_result'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;

-- 2. mcp_tool: catalog global (NULL) hoặc tenant — chuẩn F44 (SELECT tách khỏi WRITE;
--    app KHÔNG ghi được row global qua kẽ hở policy OR)
ALTER TABLE mcp_tool ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON mcp_tool FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write ON mcp_tool FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON mcp_tool FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON mcp_tool TO ipms_app;

-- 3. ai_interaction: log gọi AI — APPEND-ONLY như audit_log (INSERT + SELECT; chặn cả owner)
ALTER TABLE ai_interaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_interaction
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON ai_interaction TO ipms_app;
GRANT USAGE ON SEQUENCE ai_interaction_id_seq TO ipms_app;

CREATE OR REPLACE FUNCTION ai_interaction_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ai_interaction is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ai_interaction_append_only
  BEFORE UPDATE OR DELETE ON ai_interaction
  FOR EACH ROW EXECUTE FUNCTION ai_interaction_block_mutation();
