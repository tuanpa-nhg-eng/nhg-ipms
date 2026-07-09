-- Phase 3 lát 4c — hardening theo Reviewer:
-- [F71] unique tenant đồng bộ với global: partial theo deleted_at IS NULL
--       (soft-delete xong phải tạo lại được policy cùng tên)
DROP INDEX "access_policy_tenant_id_name_key";
CREATE UNIQUE INDEX "access_policy_tenant_id_name_key" ON "access_policy"("tenant_id", "name")
  WHERE "deleted_at" IS NULL;

-- [F72] fail-closed ở tầng DB: engine lạ (vd 'opa' ghi qua đường owner) sẽ bị
-- activeForAction lọc 'cedar' âm thầm bỏ qua = forbid biến mất không cảnh báo.
-- Chặn cứng cho tới khi engine khác được hỗ trợ thật.
ALTER TABLE "access_policy" ADD CONSTRAINT "access_policy_engine_check" CHECK ("engine" = 'cedar');
