-- ============================================================
-- NHG iPMS — RLS, DB roles & append-only audit (Phase 0)
-- Nguyên tắc bất biến #1: multi-tenant by default, cô lập bằng RLS.
-- App runtime kết nối bằng role `ipms_app` (KHÔNG phải table owner)
-- → RLS được enforce. Migration/seed chạy bằng owner (bypass RLS như owner).
-- ============================================================

-- 1. Runtime role (ít quyền — least privilege)
-- [F3] KHÔNG hard-code password trong migration (chạy cả ở prod).
-- Dev: role được pre-create bởi docker-entrypoint-initdb (infra/dev-init.sql) với password dev.
-- Prod: ops pre-create role + password mạnh TRƯỚC khi migrate; migration chỉ đảm bảo tồn tại (NOLOGIN).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ipms_app') THEN
    CREATE ROLE ipms_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ipms_app;

-- Bảng nghiệp vụ: SELECT/INSERT/UPDATE (KHÔNG DELETE — soft delete only)
-- [F1] role & feature_flag: app CHỈ ĐỌC — catalog/flag do admin-plane quản lý,
-- tránh app-path ghi hàng global (tenant_id NULL) ảnh hưởng mọi tenant.
GRANT SELECT, INSERT, UPDATE ON
  tenant, org_unit, role_family, "position", person,
  app_user, user_role
TO ipms_app;
GRANT SELECT ON role, permission, role_permission, feature_flag TO ipms_app;

-- audit_log: APPEND-ONLY cho app (INSERT + SELECT, không UPDATE/DELETE)
GRANT SELECT, INSERT ON audit_log TO ipms_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO ipms_app;

-- 2. Append-only audit_log — chặn cả owner (defense in depth)
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- 3. Row-Level Security
-- Quy ước: app set `SELECT set_config('app.tenant_id', '<uuid>', true)` đầu mỗi transaction.
-- current_setting(..., true) trả NULL nếu chưa set → policy fail-closed (không thấy dòng nào).

-- 3a. tenant: chỉ thấy tenant của chính mình
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 3b. Bảng nghiệp vụ có tenant_id
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_unit','role_family','position','person','app_user','user_role','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;

-- 3c. role & feature_flag: global (tenant_id NULL) hoặc của tenant hiện tại
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON role
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE feature_flag ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON feature_flag
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 3d. permission & role_permission: catalog toàn cục, chỉ đọc với app (đã chỉ GRANT SELECT ở mục 1)

-- 4. Ghi chú vận hành:
-- - KHÔNG cấp BYPASSRLS cho ipms_app trong bất kỳ hoàn cảnh nào.
-- - Cross-tenant (Group Dashboard, Phase 4–5) dùng service account riêng `group_aggregator`
--   theo NHG_iPMS_Spec_Group_Master_Dashboard.md — CHƯA tạo ở Phase 0.
