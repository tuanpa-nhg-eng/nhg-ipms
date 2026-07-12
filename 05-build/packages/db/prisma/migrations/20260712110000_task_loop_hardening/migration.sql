-- [Lát 4k · F133] Hardening backfill: Q1 KHÔNG có ngoại lệ kể cả migration.
-- Backfill 20260712100000 kích hoạt vô điều kiện — cell canonical có kpi_ref NULL/treo
-- (tạo tay/test artifact) cũng thành active. Sửa fail-closed: demote về draft +
-- gỡ revision v1 sai của chúng (revision là lịch sử ACTIVE — chưa từng active hợp lệ).
DO $$
DECLARE bad_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(tc.id), '{}') INTO bad_ids
  FROM task_cell tc
  WHERE tc.config_version_id IS NULL AND tc.deleted_at IS NULL AND tc.status = 'active'
    AND (tc.kpi_ref IS NULL OR NOT EXISTS (
      SELECT 1 FROM kpi_template k
      WHERE k.code = tc.kpi_ref AND k.deleted_at IS NULL
        AND (k.tenant_id = tc.tenant_id OR k.tenant_id IS NULL)
    ));

  IF array_length(bad_ids, 1) IS NOT NULL THEN
    ALTER TABLE task_revision DISABLE TRIGGER task_revision_append_only;
    DELETE FROM task_revision WHERE task_cell_id = ANY(bad_ids);
    ALTER TABLE task_revision ENABLE TRIGGER task_revision_append_only;
    UPDATE task_cell SET status = 'draft', active_version = 0 WHERE id = ANY(bad_ids);
  END IF;
END
$$;
