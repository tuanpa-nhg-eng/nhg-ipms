-- [Trục C L1] SỔ NHẬT KÝ XUẤT DỮ LIỆU — export_log
--
-- BR-M13-02: "kiểm soát xuất dữ liệu — MỘT cổng duy nhất, ghi vết đủ bốn thông tin".
-- Trước lát này dữ liệu ra khỏi iPMS qua nhiều đường (xuất sang hệ lương, đẩy outbox ra hệ
-- ngoài, job morning-todos) mà KHÔNG đường nào ghi vết đủ: audit_log ghi "ai gọi endpoint
-- nào", nhưng không trả lời được câu mà B0/B5 thực sự cần — *dữ liệu NÀO, mức phân loại
-- gì, đi ĐÂU, bao nhiêu bản ghi*.
--
-- Bốn thông tin bắt buộc, NOT NULL hết, không có đường ghi thiếu:
--   asset_code · classification · destination · record_count
--
-- Quan hệ với audit_log: KHÔNG thay thế. audit_log = vết hành động; export_log = vết DÒNG
-- DỮ LIỆU RA. Một lần xuất sinh cả hai. Cả hai append-only (K6).

CREATE TABLE "export_log" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- `actor_user_id` = người CHỊU TRÁCH NHIỆM, luôn là actor THẬT (claim `act` nếu đang
    -- đóng vai, ngược lại `sub`) — cùng quy ước danh tính kép J13 mà audit_log đang dùng.
    -- `on_behalf_of_user_id` = danh tính đang bị đóng vai (`sub`), NULL ngoài phiên đóng vai.
    -- J11 cấm MỌI hành động khi đóng vai ⇒ trong sản phẩm đúng thì cột này luôn NULL; nó tồn
    -- tại như BẰNG CHỨNG chống hồi quy: một dòng khác NULL nghĩa là J11 đã vỡ ở đâu đó.
    "actor_user_id" UUID NOT NULL,
    "on_behalf_of_user_id" UUID,
    "asset_code" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destination_kind" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "route" TEXT NOT NULL,
    -- [nối L3] ngoại lệ chính sách nào cho phép lần xuất này (NULL = đi trong trần mặc định).
    -- Cột có sẵn từ L1 để L3 không phải migrate lại bảng append-only đang có dữ liệu thật.
    "policy_exception_id" UUID,
    "rule" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_log_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "export_log" ADD CONSTRAINT "export_log_classification_check"
  CHECK (classification IN ('public', 'internal', 'confidential', 'restricted'));
ALTER TABLE "export_log" ADD CONSTRAINT "export_log_dest_kind_check"
  CHECK (destination_kind IN ('internal_system', 'file_download', 'external_service'));
-- Xuất 0 bản ghi vẫn là một lần xuất và vẫn phải ghi vết (một truy vấn rỗng cũng là bằng
-- chứng ai đó đã thử lấy gì); âm thì là lỗi lập trình, chặn ở DB.
ALTER TABLE "export_log" ADD CONSTRAINT "export_log_record_count_check"
  CHECK (record_count >= 0);

CREATE INDEX "export_log_tenant_at_idx" ON "export_log"("tenant_id", "at" DESC);
CREATE INDEX "export_log_tenant_asset_idx" ON "export_log"("tenant_id", "asset_code");
CREATE INDEX "export_log_tenant_actor_idx" ON "export_log"("tenant_id", "actor_user_id");

-- [K6] APPEND-ONLY — cùng khuôn audit_log. Job lưu trữ ở L5 KHÔNG được đụng bảng này:
-- một sổ vết xuất mà sửa/xoá được thì không phải sổ vết, chỉ là bảng ghi chú.
CREATE OR REPLACE FUNCTION forbid_export_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'export_log is append-only (K6)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER export_log_append_only
  BEFORE UPDATE OR DELETE ON export_log
  FOR EACH ROW EXECUTE FUNCTION forbid_export_log_mutation();

-- RLS tenant-bound fail-closed (chuẩn F44)
ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON export_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- KHÔNG cấp UPDATE/DELETE cho ipms_app — trigger là lớp thứ hai, quyền là lớp thứ nhất.
GRANT SELECT, INSERT ON export_log TO ipms_app;
GRANT USAGE, SELECT ON SEQUENCE export_log_id_seq TO ipms_app;
