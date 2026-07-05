-- Phase 3 hardening theo review đối kháng (F44/F51/F53)

-- [F44] Policy permissive OR với nhau → FOR ALL 'tenant_or_global' kế thừa USING làm
-- WITH CHECK → app ghi được global rows. Fix: thu hẹp thành FOR SELECT (không có WITH CHECK)
-- → mọi INSERT/UPDATE buộc qua tenant_write/tenant_update (tenant_id = context).
DROP POLICY tenant_or_global ON kpi_template;
CREATE POLICY tenant_or_global ON kpi_template FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- [F51] SECURITY DEFINER hygiene: pin search_path
CREATE OR REPLACE FUNCTION resolve_tenant_id(p_code text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM tenant WHERE code = p_code AND deleted_at IS NULL LIMIT 1;
$$;

-- [F53] config_change: append-only + chống trùng seq giữa 2 transaction song song
REVOKE UPDATE ON config_change FROM ipms_app;
CREATE UNIQUE INDEX IF NOT EXISTS config_change_version_seq_uq
  ON config_change (config_version_id, seq);
