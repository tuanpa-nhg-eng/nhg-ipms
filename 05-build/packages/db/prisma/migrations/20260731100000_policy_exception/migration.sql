-- [Trục C L3] NGOẠI LỆ CHÍNH SÁCH CÓ THỜI HẠN
--
-- Bài toán: mọi bất biến của trục này (K1 tầng nền tảng chỉ đọc metadata, J3 quản trị không
-- đọc vết, K11 hỗ trợ không ghi) đều đúng cho ngày thường và đều SAI cho một ca sự cố lúc 2
-- giờ sáng. Hệ nào không có đường nới hợp lệ thì người ta sẽ nới bằng đường không hợp lệ:
-- cấp thẳng vai trong DB, hoặc mượn tài khoản người khác — cả hai đều không để lại vết đọc
-- được. Lát này dựng đúng một đường nới CÓ KIỂM SOÁT để đường lách kia không còn lý do tồn tại.
--
-- Bốn tính chất phải đúng ở TẦNG DB, không chỉ ở tầng ứng dụng (ứng dụng sửa được bằng một
-- lần deploy; hàng trong DB thì sống lâu hơn mọi bản deploy):
--
--   ① HẾT HẠN LÀ HẾT — `user_role.expires_at`. Quyền tạm không phải một vai "nhớ gỡ",
--     nó là một vai TỰ RỤNG. Kiểm tại cửa mỗi request (PermissionGuard), job dọn chỉ là
--     dọn dẹp: nếu job chết thì quyền vẫn phải mất đúng giờ.
--   ② KHÔNG GIA HẠN — trigger chặn mọi UPDATE làm `expires_at` LÙI XA hơn. "Xin thêm 2
--     tiếng" phải là một ngoại lệ MỚI, có người duyệt mới, có vết mới. Đây là chỗ một ngoại
--     lệ 72 giờ biến thành vĩnh viễn nếu để hở.
--   ③ KHÔNG SỬA LẠI QUÁ KHỨ — trigger đóng băng người xin, quyền xin, phạm vi, lý do,
--     và mốc tạo. Một ngoại lệ đã duyệt mà sửa được lý do thì hồ sơ tuân thủ là hồ sơ giả.
--   ④ KHÔNG QUAY NGƯỢC TRẠNG THÁI — approved/rejected/revoked là điểm cuối; chỉ approved
--     đi tiếp được sang revoked/expired.
--
-- K5 (người xin ≠ người duyệt) thực thi ở service, KHÔNG ở đây: nó cần so người duyệt với
-- người xin VÀ với người nhận, mà cả hai đều là quyết định nghiệp vụ có ngoại lệ hợp lệ
-- trong tương lai (vd một quy trình hai người duyệt). Trigger giữ phần bất biến VẬT LÝ.

CREATE TABLE "policy_exception" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- Người XIN và người NHẬN tách nhau: trưởng nhóm hỗ trợ xin quyền cho một kỹ sư trực
    -- là ca có thật. Tách ra để K5 kiểm được cả hai vế (người duyệt ≠ cả hai).
    "requester_user_id" UUID NOT NULL,
    "grantee_user_id" UUID NOT NULL,
    -- Quyền được nới — đối chiếu allowlist trong MÃ (`EXCEPTION_GRANTABLE_PERMISSIONS`),
    -- không phải mọi permission trong catalog. Xem @ipms/shared để biết vì sao chỉ quyền ĐỌC.
    "permission_code" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL DEFAULT 'tenant',
    "scope_id" UUID,
    "reason" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Thời hạn do NGƯỜI DUYỆT chốt lúc duyệt (người xin đề nghị, không tự quyết) ⇒ NULL khi
    -- còn `pending`. Trần cứng 72h + trần hạ được của đơn vị: kiểm ở service.
    "expires_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approver_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    -- Đã dùng bao nhiêu lần / lần gần nhất. Một ngoại lệ được duyệt mà KHÔNG dùng lần nào
    -- cũng là tín hiệu (xin thừa quyền) — đếm để L4 sinh cờ rủi ro từ cả hai phía.
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "policy_exception_pkey" PRIMARY KEY ("id")
);

-- Lý do ≥20 ký tự ở TẦNG DB, song song với validator ở DTO: cùng khuôn `impersonation_session`
-- của trục B. "test" không phải một lý do, và một hàng trong DB không có lý do thật thì hồ sơ
-- tuân thủ rỗng nghĩa.
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_reason_len"
  CHECK (char_length(btrim(reason)) >= 20);

ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_status_check"
  CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'expired'));

ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_scope_check"
  CHECK (scope_type IN ('tenant', 'org_unit', 'self'));

-- Đã duyệt thì BẮT BUỘC có người duyệt + hạn. Không có hàng "approved mà vô hạn".
ALTER TABLE "policy_exception" ADD CONSTRAINT "policy_exception_approved_shape"
  CHECK (status <> 'approved' OR (approver_user_id IS NOT NULL AND expires_at IS NOT NULL));

CREATE INDEX "policy_exception_tenant_status" ON "policy_exception"("tenant_id", "status");
CREATE INDEX "policy_exception_grantee" ON "policy_exception"("grantee_user_id");

ALTER TABLE policy_exception ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON policy_exception FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- KHÔNG cấp DELETE: hồ sơ ngoại lệ là hồ sơ tuân thủ — thu hồi là đổi trạng thái, không
-- phải xoá hàng (cùng tinh thần K6 với audit_log/export_log, dù bảng này cần UPDATE thật).
GRANT SELECT, INSERT, UPDATE ON policy_exception TO ipms_app;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger ② ③ ④ — những thứ ứng dụng KHÔNG được phép tự quyết
CREATE OR REPLACE FUNCTION policy_exception_immutable() RETURNS TRIGGER AS $$
BEGIN
  -- ③ đóng băng phần mô tả "xin cái gì, vì sao, cho ai"
  IF NEW.requester_user_id <> OLD.requester_user_id
     OR NEW.grantee_user_id <> OLD.grantee_user_id
     OR NEW.permission_code <> OLD.permission_code
     OR NEW.scope_type <> OLD.scope_type
     OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
     OR NEW.reason <> OLD.reason
     OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'policy_exception: không sửa được nội dung đơn xin sau khi tạo (K4/K5)';
  END IF;

  -- ② không gia hạn: expires_at chỉ được đặt MỘT LẦN (pending → approved), sau đó chỉ được
  -- giữ nguyên hoặc RÚT NGẮN (thu hồi sớm). Đây là chốt chặn "72 giờ thành vĩnh viễn".
  IF OLD.expires_at IS NOT NULL AND NEW.expires_at > OLD.expires_at THEN
    RAISE EXCEPTION 'policy_exception: không gia hạn — xin thêm thời gian phải là một ngoại lệ MỚI (K4)';
  END IF;

  -- ④ trạng thái chỉ đi một chiều
  IF OLD.status <> NEW.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
      OR (OLD.status = 'approved' AND NEW.status IN ('revoked', 'expired'))
    ) THEN
      RAISE EXCEPTION 'policy_exception: chuyển trạng thái % → % không hợp lệ (K4)', OLD.status, NEW.status;
    END IF;
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_exception_immutable_trg
  BEFORE UPDATE ON policy_exception
  FOR EACH ROW EXECUTE FUNCTION policy_exception_immutable();

-- ═══════════════════════════════════════════════════════════════════════════════
-- `user_role`: quyền TẠM
--
-- Vì sao materialize thành `user_role` chứ không kiểm bảng ngoại lệ ngay trong guard: quyền
-- chỉ tới người QUA MỘT VAI trong hệ này (bài học `export_officer` ở L1). Thêm một đường
-- cấp quyền THỨ HAI song song với `user_role` nghĩa là mọi chỗ đang tính quyền (guard,
-- impersonation, effective-access, /me/access) phải nhớ hỏi cả hai nguồn — và chỗ nào quên
-- thì hoặc chặn oan, hoặc tệ hơn, cho qua thứ đã hết hạn. Một nguồn, thêm một cột hạn.
ALTER TABLE "user_role" ADD COLUMN "expires_at" TIMESTAMPTZ(6);
ALTER TABLE "user_role" ADD COLUMN "policy_exception_id" UUID;

-- Truy vết hai chiều: từ ngoại lệ ra vai đã cấp, và từ một vai lạ trong danh sách quyền của
-- một người tìm ngược ra ai đã duyệt nó.
CREATE INDEX "user_role_policy_exception" ON "user_role"("policy_exception_id")
  WHERE "policy_exception_id" IS NOT NULL;
CREATE INDEX "user_role_expires_at" ON "user_role"("expires_at")
  WHERE "expires_at" IS NOT NULL;

-- ② áp lại ở đúng bảng thi hành: kể cả khi ai đó bỏ qua service và UPDATE thẳng `user_role`,
-- hạn của một vai tạm vẫn không dài ra được. Vai thường (expires_at NULL) không bị đụng.
CREATE OR REPLACE FUNCTION user_role_no_extend() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.expires_at IS NOT NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
    RAISE EXCEPTION 'user_role: không kéo dài (hoặc gỡ bỏ) hạn của một vai tạm (K4)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_role_no_extend_trg
  BEFORE UPDATE ON user_role
  FOR EACH ROW EXECUTE FUNCTION user_role_no_extend();
