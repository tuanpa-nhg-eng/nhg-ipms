-- [Trục B L4] Impersonation CHỈ ĐỌC có kiểm soát — bảng ghi lại PHIÊN đóng vai (bằng
-- chứng ai/khi nào/vì sao), KHÔNG phải cơ chế enforce (enforce ở PermissionGuard, J11).
-- "Chỉ được cập nhật đúng MỘT đường: kết thúc phiên" — không phải append-only tuyệt đối
-- như audit_log (khác audit_log ở chỗ có đúng 1 lần chuyển trạng thái hợp lệ sau khi tạo).
CREATE TABLE "impersonation_session" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "ended_reason" TEXT,
    "token_jti" TEXT NOT NULL,

    CONSTRAINT "impersonation_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "impersonation_session_token_jti_key" ON "impersonation_session"("token_jti");
CREATE INDEX "impersonation_session_tenant_id_actor_user_id_idx" ON "impersonation_session"("tenant_id", "actor_user_id");
CREATE INDEX "impersonation_session_tenant_id_target_user_id_idx" ON "impersonation_session"("tenant_id", "target_user_id");

ALTER TABLE "impersonation_session" ADD CONSTRAINT "impersonation_session_ended_reason_check"
  CHECK (ended_reason IS NULL OR ended_reason IN ('manual', 'expired', 'target_disabled'));

-- Reason phải có nội dung thật ("test" không phải lý do) — chốt cứng ở DB, không chỉ ở
-- validator tầng API (validator có thể bị bỏ qua nếu ai đó thêm đường ghi khác sau này).
ALTER TABLE "impersonation_session" ADD CONSTRAINT "impersonation_session_reason_length_check"
  CHECK (char_length(trim(reason)) >= 20);

-- Chặn UPDATE ngoài đúng 1 đường (kết thúc phiên) + chặn DELETE hoàn toàn + chặn sửa lại
-- một phiên đã kết thúc (không "mở lại" bằng cách set ended_at=NULL).
CREATE OR REPLACE FUNCTION forbid_impersonation_session_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'impersonation_session không được xoá — kết thúc qua ended_at/ended_reason';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.token_jti IS DISTINCT FROM OLD.token_jti THEN
    RAISE EXCEPTION 'impersonation_session: chỉ được cập nhật ended_at/ended_reason (kết thúc phiên)';
  END IF;
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'impersonation_session: phiên đã kết thúc — không sửa lại được';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER impersonation_session_guarded_update
  BEFORE UPDATE OR DELETE ON impersonation_session
  FOR EACH ROW EXECUTE FUNCTION forbid_impersonation_session_mutation();

-- RLS tenant-bound fail-closed (chuẩn F44)
ALTER TABLE impersonation_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON impersonation_session
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON impersonation_session TO ipms_app;
