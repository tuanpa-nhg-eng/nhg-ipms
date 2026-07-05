-- Phase 3 — RLS + grants: Configuration Studio (đồng nhất chuẩn Phase 0)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_version','config_change','brand_kit',
    'org_function','org_unit_function','sod_rule',
    'task_cell','derivation_rule','derivation_run','derivation_result','cascade_link'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;

-- org_unit_function: bảng mapping thuần (PK composite, không audit cols/soft-delete)
-- → cho phép DELETE để thay bộ mapping idempotent (ngoại lệ có chủ đích, RLS vẫn enforce)
GRANT DELETE ON org_unit_function TO ipms_app;

-- kpi_template: global (tenant_id NULL) hoặc của tenant — như role/feature_flag
ALTER TABLE kpi_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON kpi_template
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- app ghi được template CỦA TENANT MÌNH (WITH CHECK chặn ghi global — kế thừa ngữ nghĩa F1)
CREATE POLICY tenant_write ON kpi_template FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON kpi_template FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON kpi_template TO ipms_app;

-- Resolver theming public (trước đăng nhập chưa có tenant context):
-- SECURITY DEFINER chỉ trả về ID theo code chính xác — không lộ gì khác.
CREATE OR REPLACE FUNCTION resolve_tenant_id(p_code text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM tenant WHERE code = p_code AND deleted_at IS NULL LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_tenant_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_tenant_id(text) TO ipms_app;
