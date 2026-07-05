-- Phase 2 — RLS + grants: checkin, review, calibration (đồng nhất chuẩn Phase 0)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'checkin','checkin_goal_update',
    'review_cycle','review','review_item_score',
    'calibration_session','calibration_decision'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;
