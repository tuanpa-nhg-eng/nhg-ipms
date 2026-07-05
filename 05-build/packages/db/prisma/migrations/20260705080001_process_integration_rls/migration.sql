-- Phase 3 lát 3 — RLS + grants: Process Designer + Integration Hub
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'process','process_step','process_edge',
    'integration_connection','integration_binding','integration_run','sync_record','outbox_event'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;
GRANT USAGE ON SEQUENCE outbox_event_id_seq TO ipms_app;

-- data_contract: global (NULL) hoặc tenant — chuẩn F44 (SELECT tách khỏi WRITE)
ALTER TABLE data_contract ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON data_contract FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write ON data_contract FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON data_contract FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON data_contract TO ipms_app;
