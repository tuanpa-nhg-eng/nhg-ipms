-- [Trục C L0] SỔ ĐĂNG KÝ DỮ LIỆU — data_asset
--
-- Vì sao bảng này đi TRƯỚC mọi thứ khác của trục C: export control (L1), thời hạn lưu trữ
-- (L5) và ranh giới AI (đã có) đều phải trả lời được "dữ liệu này thuộc nhóm nào, mức phân
-- loại nào, ai là chủ". Hiện phân loại chỉ tồn tại rải rác dưới dạng hằng số trong mã
-- (modules/ai/egress/*) — không tra được, không kiểm toán được, không ai sở hữu.
--
-- Bốn mức theo NHG Strategic Context §7: public | internal | confidential | restricted.
--
-- Khuôn tenant_id NULL = bản chuẩn cấp tập đoàn (như access_policy, chuẩn F44/F56):
--   · SELECT thấy bản chuẩn + bản của tenant mình
--   · INSERT/UPDATE chỉ trong tenant mình — app KHÔNG ghi được bản chuẩn (seed dùng owner)
--   · Đơn vị chỉ được SIẾT CHẶT hơn bản chuẩn, KHÔNG được nới lỏng (trigger bên dưới)

CREATE TABLE "data_asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "description" TEXT,
    "source_system" TEXT,
    "owner_role" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "legal_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_asset_pkey" PRIMARY KEY ("id")
);

-- Bốn mức, không hơn. Thêm mức mới phải sửa migration + hàm xếp hạng bên dưới cùng lúc.
ALTER TABLE "data_asset" ADD CONSTRAINT "data_asset_classification_check"
  CHECK (classification IN ('public', 'internal', 'confidential', 'restricted'));

-- Chủ dữ liệu ghi theo VAI TRÒ/KHỐI ('B1', 'B3', 'OpCo'…), KHÔNG theo tên người — nhất
-- quán với quy ước ẩn danh của dự án, và để hồ sơ không chết khi người đó đổi việc.
ALTER TABLE "data_asset" ADD CONSTRAINT "data_asset_owner_role_check"
  CHECK (char_length(trim(owner_role)) >= 2);

ALTER TABLE "data_asset" ADD CONSTRAINT "data_asset_code_check"
  CHECK (code ~ '^[a-z][a-z0-9_.]{2,63}$');

-- [chuẩn F56] NULL không chặn nhau trong unique index Postgres ⇒ partial unique riêng
-- cho bản chuẩn cấp tập đoàn.
CREATE UNIQUE INDEX "data_asset_global_code_key" ON "data_asset"("code")
  WHERE "tenant_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "data_asset_tenant_code_key" ON "data_asset"("tenant_id", "code")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "data_asset_tenant_id_classification_idx" ON "data_asset"("tenant_id", "classification");

-- Xếp hạng mức phân loại — dùng chung cho trigger, cho truy vấn báo cáo, và (quan trọng)
-- để tầng ứng dụng KHÔNG phải tự định nghĩa lại thứ tự này ở một chỗ thứ hai.
CREATE OR REPLACE FUNCTION data_class_rank(c TEXT) RETURNS INTEGER AS $$
BEGIN
  RETURN CASE c
    WHEN 'public' THEN 0
    WHEN 'internal' THEN 1
    WHEN 'confidential' THEN 2
    WHEN 'restricted' THEN 3
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- BẤT BIẾN: đơn vị chỉ SIẾT CHẶT được, không nới lỏng.
--
-- Cùng ngữ nghĩa guardrail mà Cedar đã áp cho chính sách quyền (tenant thu hẹp, không mở
-- rộng). Đặt ở DB chứ không chỉ ở service vì đây là loại ràng buộc mà một đường ghi mới
-- thêm sau này rất dễ bỏ sót — và bỏ sót ở đây nghĩa là một đơn vị tự hạ dữ liệu lương
-- xuống 'internal' rồi đẩy ra dịch vụ AI ngoài.
CREATE OR REPLACE FUNCTION data_asset_no_loosen() RETURNS trigger AS $$
DECLARE
  global_class TEXT;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;                       -- bản chuẩn tập đoàn: không có gì để so
  END IF;
  SELECT classification INTO global_class
    FROM data_asset
   WHERE tenant_id IS NULL AND code = NEW.code AND deleted_at IS NULL;
  IF global_class IS NULL THEN
    RETURN NEW;                       -- mã riêng của đơn vị, không có bản chuẩn tương ứng
  END IF;
  IF data_class_rank(NEW.classification) < data_class_rank(global_class) THEN
    RAISE EXCEPTION 'data_asset "%": đơn vị chỉ được siết chặt hơn bản chuẩn tập đoàn (chuẩn=%, đơn vị đặt=%)',
      NEW.code, global_class, NEW.classification;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER data_asset_no_loosen_check
  BEFORE INSERT OR UPDATE ON data_asset
  FOR EACH ROW EXECUTE FUNCTION data_asset_no_loosen();

-- RLS (chuẩn F44, giống access_policy)
ALTER TABLE data_asset ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_or_global ON data_asset FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_write ON data_asset FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_update ON data_asset FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON data_asset TO ipms_app;
