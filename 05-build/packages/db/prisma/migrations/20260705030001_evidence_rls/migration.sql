-- Evidence Hub — RLS + grants (đồng nhất chuẩn Phase 0)
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON evidence TO ipms_app;
