-- Phase 3 lát 4c — RLS + grants cho access_policy
-- Chuẩn F44 (như mcp_tool): SELECT thấy global (tenant_id NULL) + tenant mình;
-- INSERT/UPDATE chỉ trong tenant mình — app KHÔNG ghi được policy global.
ALTER TABLE access_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_or_global ON access_policy FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_write ON access_policy FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_update ON access_policy FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON access_policy TO ipms_app;
