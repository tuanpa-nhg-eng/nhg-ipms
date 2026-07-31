-- [Trục C L5] THỜI HẠN LƯU TRỮ & XOÁ DỮ LIỆU CÁ NHÂN (NĐ13)
--
-- Nghị định 13 nói dữ liệu cá nhân không được giữ lâu hơn mức cần thiết. Nhưng một job xoá
-- dữ liệu là thứ NGUY HIỂM NHẤT lát này có thể thêm vào hệ: nó phá huỷ, không hoàn tác được,
-- và chạy đúng thì im lặng — nên chạy SAI cũng im lặng. Vì vậy toàn bộ thiết kế ở đây xoay
-- quanh một câu: **không ai xoá được gì mà chưa nhìn thấy trước mình sắp xoá cái gì.**
--
-- Bốn chốt:
--   ① CHẠY THỬ BẮT BUỘC TRƯỚC — một lượt `apply` phải trỏ tới một lượt `dry_run` có thật,
--     còn hạn, và có cùng kế hoạch (đối chiếu bằng `plan_hash`). Ràng buộc ở DB, không chỉ ở
--     service: `mode='apply'` mà `dry_run_id IS NULL` là hàng không tồn tại được.
--   ② K6 — KHÔNG ĐỤNG `audit_log` và `export_log`. Hai sổ này là hồ sơ giám sát; xoá chúng
--     theo lịch nghĩa là tự xoá bằng chứng của chính mình. Chốt bằng CHECK trên bảng chính
--     sách: không thể LƯU một chính sách hành động `hard_delete`/`anonymize` cho hai mã đó.
--   ③ K7 — không đụng dữ liệu thuộc kỳ đánh giá CHƯA CHỐT (thực thi ở tầng truy vấn, và mỗi
--     lượt chạy ghi lại số bản ghi đã BỎ QUA vì lý do này — một con số 0 ở đó là dấu hiệu
--     phép lọc đã hỏng, không phải dấu hiệu mọi thứ ổn).
--   ④ Đơn vị chỉ SIẾT NGẮN được thời hạn so với bản chuẩn tập đoàn, không kéo dài (trigger).
--     Giữ lâu hơn là tăng phơi nhiễm dữ liệu cá nhân — đúng chiều mà NĐ13 hạn chế.

CREATE TABLE "retention_policy" (
    "id" UUID NOT NULL,
    -- NULL = bản chuẩn cấp tập đoàn (cùng khuôn `data_asset` ở L0). Đơn vị kế thừa, siết được.
    "tenant_id" UUID,
    -- Trỏ tới `data_asset.code` — chính sách lưu trữ GẮN theo nhóm dữ liệu đã đăng ký, không
    -- theo tên bảng. Người đặt chính sách nghĩ bằng ngôn ngữ nghiệp vụ ("kết quả đánh giá"),
    -- ánh xạ sang bảng/cột là việc của mã (`RETENTION_TARGETS`).
    "asset_code" TEXT NOT NULL,
    "retention_months" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "legal_basis" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "retention_policy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_action_check"
  CHECK (action IN ('hard_delete', 'anonymize', 'cold_archive', 'keep'));
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_months_check"
  CHECK (retention_months >= 1 AND retention_months <= 600);

-- ② K6 ở tầng DB. Không phụ thuộc mã ứng dụng nhớ kiểm: một chính sách xoá sổ vết không LƯU
-- được, nên cũng không có gì để job đọc nhầm.
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_k6_audit_untouchable"
  CHECK (asset_code NOT IN ('audit.log', 'export.log') OR action IN ('cold_archive', 'keep'));

CREATE UNIQUE INDEX "retention_policy_scope_key"
  ON "retention_policy"(COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "asset_code")
  WHERE "deleted_at" IS NULL;

ALTER TABLE retention_policy ENABLE ROW LEVEL SECURITY;
-- Đọc: thấy bản chuẩn tập đoàn (tenant_id NULL) + bản của chính đơn vị mình. Ghi: CHỈ bản của
-- đơn vị mình — bản chuẩn tập đoàn do seed/admin-plane dựng, không sửa qua đường ứng dụng.
CREATE POLICY tenant_read ON retention_policy FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write ON retention_policy FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON retention_policy FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON retention_policy TO ipms_app;

-- ④ Đơn vị chỉ siết NGẮN hơn bản chuẩn. Đối xứng với `data_asset_no_loosen` ở L0 nhưng ngược
-- chiều số học: ở L0 "siết" là NÂNG mức phân loại, ở đây "siết" là GIẢM số tháng giữ.
CREATE OR REPLACE FUNCTION retention_policy_no_extend() RETURNS TRIGGER AS $$
DECLARE
  base INTEGER;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT retention_months INTO base
    FROM retention_policy
   WHERE tenant_id IS NULL AND asset_code = NEW.asset_code AND deleted_at IS NULL;
  IF base IS NOT NULL AND NEW.retention_months > base THEN
    RAISE EXCEPTION 'retention_policy: đơn vị chỉ rút NGẮN được thời hạn (chuẩn tập đoàn % tháng, xin %)', base, NEW.retention_months;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retention_policy_no_extend_ins
  BEFORE INSERT ON retention_policy
  FOR EACH ROW EXECUTE FUNCTION retention_policy_no_extend();
CREATE TRIGGER retention_policy_no_extend_upd
  BEFORE UPDATE ON retention_policy
  FOR EACH ROW EXECUTE FUNCTION retention_policy_no_extend();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Sổ các lượt chạy. Vừa là hồ sơ tuân thủ, vừa là ĐIỀU KIỆN để được chạy thật.
CREATE TABLE "retention_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "retention_months" INTEGER NOT NULL,
    "cutoff_at" TIMESTAMPTZ(6) NOT NULL,
    -- Số bản ghi TRONG PHẠM VI (đã quá hạn) và số thực sự bị tác động. Với `dry_run` hai số
    -- bằng nhau; với `apply` chúng lệch nhau khi có bản ghi được bảo vệ giữa chừng.
    "planned_count" INTEGER NOT NULL DEFAULT 0,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    -- ③ K7: bao nhiêu bản ghi quá hạn nhưng BỎ QUA vì thuộc kỳ chưa chốt. Ghi riêng, không
    -- gộp vào `planned_count` — con số này là bằng chứng phép lọc bảo vệ đang chạy.
    "skipped_protected" INTEGER NOT NULL DEFAULT 0,
    -- Vân tay kế hoạch: mã dữ liệu + hành động + mốc cắt + số bản ghi. `apply` chỉ chạy khi
    -- vân tay khớp lượt thử — dữ liệu đổi giữa hai lượt thì phải thử lại.
    "plan_hash" TEXT NOT NULL,
    "dry_run_id" UUID,
    "report" JSONB NOT NULL DEFAULT '{}',
    "actor_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "retention_run_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "retention_run" ADD CONSTRAINT "retention_run_mode_check"
  CHECK (mode IN ('dry_run', 'apply'));
-- ① Chạy thật BẮT BUỘC trỏ tới một lượt thử. Đây là chốt quan trọng nhất của cả lát, và nó
-- nằm ở DB chứ không ở service vì service sửa được bằng một bản deploy.
ALTER TABLE "retention_run" ADD CONSTRAINT "retention_run_apply_needs_dry_run"
  CHECK (mode <> 'apply' OR dry_run_id IS NOT NULL);

CREATE INDEX "retention_run_tenant_started" ON "retention_run"("tenant_id", "started_at" DESC);

ALTER TABLE retention_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON retention_run FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Không cấp DELETE: sổ lượt chạy là hồ sơ tuân thủ (cùng tinh thần K6).
GRANT SELECT, INSERT, UPDATE ON retention_run TO ipms_app;

-- Một lượt đã chạy thì không viết lại được gì ngoài phần kết thúc (số liệu + mốc xong).
CREATE OR REPLACE FUNCTION retention_run_append_only() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mode <> OLD.mode
     OR NEW.asset_code <> OLD.asset_code
     OR NEW.action <> OLD.action
     OR NEW.retention_months <> OLD.retention_months
     OR NEW.cutoff_at <> OLD.cutoff_at
     OR NEW.plan_hash <> OLD.plan_hash
     OR NEW.actor_user_id <> OLD.actor_user_id
     OR NEW.dry_run_id IS DISTINCT FROM OLD.dry_run_id
     OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'retention_run: hồ sơ một lượt chạy không sửa lại được';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER retention_run_append_only_trg
  BEFORE UPDATE ON retention_run
  FOR EACH ROW EXECUTE FUNCTION retention_run_append_only();
