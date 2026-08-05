-- [Trục D L0] DANH BẠ AGENT — ai_agent
--
-- Vì sao bảng này đi TRƯỚC mọi thứ khác của trục D: trần phân loại (L1), quyền hữu hiệu
-- (L2) và định tuyến nhà cung cấp (L3) đều phải trả lời được "agent này là ai, chủ quản
-- nào, trần bao nhiêu, được cấp quyền gì, chạm được nhóm dữ liệu nào".
--
-- Hiện trạng trước migration này (ĐO trên DB dev, không phải suy đoán): `LlmRequest.agent`
-- là CHUỖI TỰ DO. `SELECT count(DISTINCT agent) FROM ai_interaction` = 397 trong khi chỉ
-- SÁU mã là thật; 391 mã còn lại do test đẻ ra, mỗi lượt chạy mint một "agent" mới và nằm
-- lại vĩnh viễn trong bảng append-only. Hệ quả không chỉ là sổ bẩn: `ai_launch_bar`,
-- `ai_agent_model`, `ai_model_qualification`, `ai_eval_suite` đều khoá theo chính chuỗi
-- đó — một agent không tồn tại thì KHÔNG CÓ BAR NÀO ĐỂ TRƯỢT, tức là Model-Qualification
-- Gate im lặng cho qua.
--
-- L0 chỉ DỰNG SỔ. Cưỡng chế "agent lạ ⇒ 422" (N1) là việc của L1 — tách ra có chủ đích:
-- bật chặn trước khi sổ phủ hết mã đang chạy là gãy sản phẩm.
--
-- Khuôn tenant_id NULL = bản chuẩn cấp tập đoàn, dùng lại nguyên xi của `data_asset`
-- (trục C L0) và `access_policy` (chuẩn F44/F56):
--   · SELECT thấy bản chuẩn + bản của đơn vị mình
--   · INSERT/UPDATE chỉ trong đơn vị mình — app KHÔNG ghi được bản chuẩn (seed dùng owner)
--   · Đơn vị chỉ được SIẾT CHẶT hơn bản chuẩn, KHÔNG được nới (trigger bên dưới)

CREATE TABLE "ai_agent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "purpose" TEXT NOT NULL,
    -- Chủ quản ghi theo VAI/KHỐI ('B1','B3','B5'), KHÔNG theo tên người — nhất quán với
    -- `data_asset.owner_role` và với quy ước ẩn danh của dự án.
    "owner_role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "max_data_class" TEXT NOT NULL,
    "data_asset_codes" JSONB NOT NULL DEFAULT '[]',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "hitl_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_agent_pkey" PRIMARY KEY ("id")
);

-- Cùng bốn mức của `data_asset` — KHÔNG dựng thang thứ hai. Hàm `data_class_rank()` đã tồn
-- tại từ migration 20260729100000_data_asset và được dùng lại nguyên vẹn ở trigger bên dưới.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_max_data_class_check"
  CHECK (max_data_class IN ('public', 'internal', 'confidential', 'restricted'));

-- Mã agent: cho phép dấu chấm vì các agent inline đang chạy mang dạng `inline.taskcell.draft`.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_code_check"
  CHECK (code ~ '^[a-z][a-z0-9_.]{2,63}$');

ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_owner_role_check"
  CHECK (char_length(trim(owner_role)) >= 2);

-- `business` = agent nghiệp vụ trong BRD · `infrastructure` = agent hạ tầng chỉ tồn tại
-- trong mã (vd `mcp`). Tách ra để bảng đối chiếu BRD ⟷ mã không phải bịa cho khớp.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_kind_check"
  CHECK (kind IN ('business', 'infrastructure'));

-- BẤT BIẾN CẤP LƯỢC ĐỒ: KHÔNG có giá trị nào của `hitl_mode` cho phép AI ghi thẳng nghiệp vụ.
-- Đây là ranh giới AI của BRD (§ranh_gioi_ai) phát biểu ở tầng DDL chứ không ở tầng ý định:
-- muốn có agent tự ghi thì phải sửa CHECK này trong một migration có người đọc, không phải
-- truyền một chuỗi khác vào một cột tự do.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_hitl_mode_check"
  CHECK (hitl_mode IN ('read_only', 'propose_only'));

-- `planned` = đã khai danh tính nhưng CHƯA có đường chạy hợp lệ (vd hai agent BRD đòi mô
-- hình nội bộ, mà self-host là việc của L3). Khai ra và để `planned` là ghi nhận trung
-- thực; bật sớm mới là hứa thứ hệ thống chưa làm được.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_status_check"
  CHECK (status IN ('active', 'planned', 'retired'));

-- Hai cột danh sách phải THỰC SỰ là mảng — jsonb nhận cả object/scalar nếu không chặn, và
-- phép kiểm tập con `<@` ở trigger sẽ cho kết quả vô nghĩa thay vì báo lỗi.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_data_asset_codes_is_array"
  CHECK (jsonb_typeof(data_asset_codes) = 'array');
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_permissions_is_array"
  CHECK (jsonb_typeof(permissions) = 'array');

-- [chuẩn F56] NULL không chặn nhau trong unique index Postgres ⇒ partial unique riêng cho
-- bản chuẩn cấp tập đoàn.
CREATE UNIQUE INDEX "ai_agent_global_code_key" ON "ai_agent"("code")
  WHERE "tenant_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "ai_agent_tenant_code_key" ON "ai_agent"("tenant_id", "code")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "ai_agent_tenant_id_status_idx" ON "ai_agent"("tenant_id", "status");

-- Thang "mức độ agent được phép làm". Đơn vị chỉ đi XUỐNG thang này, không đi lên.
-- `retired` và `planned` đều KHÔNG chạy; tách hai giá trị vì chúng nói hai chuyện khác nhau
-- với người đọc sổ (chưa từng bật ⟂ đã tắt), nhưng về quyền năng thì `planned` > `retired`
-- theo đúng nghĩa "đang trên đường bật".
CREATE OR REPLACE FUNCTION ai_agent_status_rank(s TEXT) RETURNS INTEGER AS $$
BEGIN
  RETURN CASE s
    WHEN 'retired' THEN 0
    WHEN 'planned' THEN 1
    WHEN 'active'  THEN 2
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- `read_only` chặt hơn `propose_only` (không đẻ nổi cả đề xuất chờ duyệt).
CREATE OR REPLACE FUNCTION ai_agent_hitl_rank(m TEXT) RETURNS INTEGER AS $$
BEGIN
  RETURN CASE m
    WHEN 'read_only'    THEN 0
    WHEN 'propose_only' THEN 1
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- BẤT BIẾN N5: đơn vị chỉ SIẾT CHẶT được hiến chương agent, không nới.
--
-- NĂM chiều nới lỏng, chặn cả năm. Đặt ở DB chứ không chỉ ở service vì cùng lý do đã ghi ở
-- `data_asset_no_loosen`: một đường ghi mới thêm sau này rất dễ bỏ sót — và bỏ sót ở đây
-- nghĩa là một đơn vị tự nâng trần agent tóm tắt đánh giá rồi đẩy nội dung đánh giá cá nhân
-- ra nhà cung cấp ngoài.
CREATE OR REPLACE FUNCTION ai_agent_no_loosen() RETURNS trigger AS $$
DECLARE
  g RECORD;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;                       -- bản chuẩn tập đoàn: không có gì để so
  END IF;
  SELECT max_data_class, permissions, data_asset_codes, hitl_mode, status
    INTO g
    FROM ai_agent
   WHERE tenant_id IS NULL AND code = NEW.code AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;                       -- agent riêng của đơn vị, không có bản chuẩn tương ứng
  END IF;

  -- ① trần phân loại: đơn vị không được nâng
  IF data_class_rank(NEW.max_data_class) > data_class_rank(g.max_data_class) THEN
    RAISE EXCEPTION 'ai_agent "%": đơn vị không được NÂNG trần phân loại (chuẩn=%, đơn vị đặt=%)',
      NEW.code, g.max_data_class, NEW.max_data_class;
  END IF;

  -- ② hiến chương quyền: phải là TẬP CON của bản chuẩn
  IF NOT (NEW.permissions <@ g.permissions) THEN
    RAISE EXCEPTION 'ai_agent "%": quyền của đơn vị phải là tập con của bản chuẩn (chuẩn=%, đơn vị đặt=%)',
      NEW.code, g.permissions, NEW.permissions;
  END IF;

  -- ③ phạm vi dữ liệu: phải là TẬP CON của bản chuẩn
  IF NOT (NEW.data_asset_codes <@ g.data_asset_codes) THEN
    RAISE EXCEPTION 'ai_agent "%": phạm vi dữ liệu của đơn vị phải là tập con của bản chuẩn (chuẩn=%, đơn vị đặt=%)',
      NEW.code, g.data_asset_codes, NEW.data_asset_codes;
  END IF;

  -- ④ chế độ HITL: đơn vị không được nới từ read_only lên propose_only
  IF ai_agent_hitl_rank(NEW.hitl_mode) > ai_agent_hitl_rank(g.hitl_mode) THEN
    RAISE EXCEPTION 'ai_agent "%": đơn vị không được NỚI chế độ HITL (chuẩn=%, đơn vị đặt=%)',
      NEW.code, g.hitl_mode, NEW.hitl_mode;
  END IF;

  -- ⑤ trạng thái: đơn vị KHÔNG tự bật một agent mà tập đoàn để `planned`/`retired`.
  -- Đây là chiều nới lỏng dễ bị bỏ sót nhất — bốn chiều trên đều nói về "được làm gì",
  -- chiều này nói về "có được chạy không", và nó vô hiệu hoá cả bốn chiều kia nếu hở.
  IF ai_agent_status_rank(NEW.status) > ai_agent_status_rank(g.status) THEN
    RAISE EXCEPTION 'ai_agent "%": đơn vị không được tự BẬT agent mà bản chuẩn để "%" (đơn vị đặt=%)',
      NEW.code, g.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_agent_no_loosen_check
  BEFORE INSERT OR UPDATE ON ai_agent
  FOR EACH ROW EXECUTE FUNCTION ai_agent_no_loosen();

-- RLS (chuẩn F44, y hệt data_asset)
ALTER TABLE ai_agent ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_or_global ON ai_agent FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_write ON ai_agent FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_update ON ai_agent FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Không cấp DELETE (soft-delete qua deleted_at) — cùng khuôn data_asset.
GRANT SELECT, INSERT, UPDATE ON ai_agent TO ipms_app;
