-- Phase 1 — RLS + grants cho nhóm bảng chiến lược & KPI (đồng nhất chuẩn Phase 0)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'strategic_theme','objective','goal',
    'kpi_category','kpi_formula','kpi','kpi_score_tier','kpi_applicability',
    'scorecard','scorecard_item'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    -- app: SELECT/INSERT/UPDATE, KHÔNG DELETE (soft-delete only)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;
