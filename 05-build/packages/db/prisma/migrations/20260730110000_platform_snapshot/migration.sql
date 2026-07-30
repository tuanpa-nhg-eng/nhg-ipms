-- [Trục C L2] QUẢN TRỊ NỀN TẢNG — read model xuyên đơn vị `platform_snapshot`
--
-- Bài toán: B3 phải thấy được "đơn vị nào đang có vấn đề" trên TOÀN HỆ, trong khi bất biến
-- K1 cấm cấp BYPASSRLS cho bất kỳ người thật nào, và mọi bảng nghiệp vụ đều bị RLS chốt theo
-- `app.tenant_id`. Ba cách làm sai mà migration này cố ý KHÔNG chọn:
--
--   ✗ cấp BYPASSRLS cho một role người dùng          → phá K1, mở toàn bộ nội dung nghiệp vụ
--   ✗ nới policy `tenant_isolation` của bảng nghiệp vụ → cùng hệ quả, chỉ khó thấy hơn
--   ✗ job chạy bằng OWNER connection để đọc chéo      → owner bỏ qua RLS; một lỗi trong job
--                                                        là một lần đọc chéo toàn bộ nội dung
--
-- Cách chọn — hai chiều tách hẳn nhau:
--   · GHI (làm mới snapshot): job đi TỪNG ĐƠN VỊ MỘT bằng `withTenant(t)` — tức vẫn nằm
--     trong RLS như mọi truy vấn nghiệp vụ khác, đếm dữ liệu của đúng đơn vị đó rồi ghi
--     đúng dòng của đơn vị đó. KHÔNG có một truy vấn xuyên đơn vị nào trong đường ghi.
--   · ĐỌC (B3 xem toàn hệ): `withPlatform()` bật GUC `app.platform_read` và CỐ Ý KHÔNG set
--     `app.tenant_id`. Chỉ hai bảng dưới đây có policy nhìn GUC đó. Vì `app.tenant_id` không
--     được set, MỌI bảng nghiệp vụ khác trả về 0 dòng — bán kính nổ của GUC này chứng minh
--     được bằng test, không phải bằng lời hứa (`platform-admin.spec`: đọc review/person/
--     evidence trong `withPlatform` → rỗng).
--
-- Nội dung snapshot: CHỈ số đếm + trạng thái. Không tên người, không email, không điểm, không
-- nội dung bằng chứng. Test đóng đinh: không khoá nào trong `metrics` khớp mẫu PII.

CREATE TABLE "platform_snapshot" (
    "id" UUID NOT NULL,
    -- Đơn vị mà dòng này MÔ TẢ (không phải đơn vị "sở hữu quyền đọc" — đọc do GUC quyết).
    "tenant_id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Số đếm + chi phí. jsonb để thêm chỉ số mới không cần migration; đánh đổi: không có
    -- kiểu ở tầng DB, nên hình dạng được chốt bằng test + type trong @ipms/shared.
    "metrics" JSONB NOT NULL DEFAULT '{}',
    -- Trạng thái sức khoẻ suy từ metrics: ok | warn | alert. Suy ở tầng ứng dụng (một chỗ),
    -- không phải mỗi màn tự tính lại một kiểu.
    "health" TEXT NOT NULL DEFAULT 'ok',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "platform_snapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_snapshot" ADD CONSTRAINT "platform_snapshot_health_check"
  CHECK (health IN ('ok', 'warn', 'alert'));

-- Một dòng HIỆN HÀNH cho mỗi đơn vị (job upsert). Lịch sử theo thời gian là việc của L4
-- (cờ rủi ro) — không dựng sẵn bảng lịch sử ở đây để tránh chỉ số chết không ai đọc.
CREATE UNIQUE INDEX "platform_snapshot_tenant_key" ON "platform_snapshot"("tenant_id");

ALTER TABLE platform_snapshot ENABLE ROW LEVEL SECURITY;

-- ĐỌC: đơn vị tự xem dòng của mình (bình thường), HOẶC đường nền tảng bật GUC.
-- Hai policy PERMISSIVE cùng FOR SELECT được Postgres OR với nhau.
CREATE POLICY tenant_isolation ON platform_snapshot FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY platform_read ON platform_snapshot FOR SELECT
  USING (current_setting('app.platform_read', true) = 'on');

-- GHI: LUÔN tenant-bound. Không có policy nào cho phép ghi bằng GUC nền tảng — nghĩa là
-- đường làm mới snapshot KHÔNG THỂ ghi cho đơn vị khác dù có lỗi lập trình.
CREATE POLICY tenant_write ON platform_snapshot FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON platform_snapshot FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON platform_snapshot TO ipms_app;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Bảng `tenant`: thêm ĐÚNG MỘT policy đọc metadata cho đường nền tảng.
--
-- Cần vì cả hai chiều đều phải biết danh sách đơn vị: đường đọc để hiển thị, và đường GHI
-- để biết phải lặp qua những đơn vị nào (job không thể `withTenant(t)` nếu không biết `t`).
-- Bảng này chỉ chứa mã/tên/loại đơn vị — đúng nghĩa metadata mà K1 cho phép.
CREATE POLICY platform_read_metadata ON tenant FOR SELECT
  USING (current_setting('app.platform_read', true) = 'on');

-- TẠO ĐƠN VỊ MỚI (`tenant:create`): bảng `tenant` có RLS với policy chỉ USING ⇒ Postgres
-- TỪ CHỐI mọi INSERT vì không có WITH CHECK nào. Nên tới lát này chưa ai tạo được đơn vị qua
-- API (seed dùng owner connection). Mở bằng GUC RIÊNG `app.platform_write` — tách khỏi
-- `app.platform_read` có chủ đích: đường đọc (mọi request của B3) không được mang theo khả
-- năng ghi, và trong mã chỉ đúng một hàm bật GUC này.
CREATE POLICY platform_create ON tenant FOR INSERT
  WITH CHECK (current_setting('app.platform_write', true) = 'on');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Cờ tính năng: kế thừa quyết định [F1] "app CHỈ ĐỌC feature_flag — flag do ADMIN-PLANE
-- quản lý, tránh app-path ghi hàng global ảnh hưởng mọi tenant". Lát này CHÍNH LÀ admin-plane
-- đó (snapshot rbac-matrix từ trục B đã ghi `flag:write` → "KHÔNG AI — tầng ① Platform
-- Admin"). Nên F1 không bị phá, nó được KẾ TỤC: quyền ghi mở ra, nhưng khoá không còn là
-- "không grant" mà là GUC `app.platform_write` + permission `flag:write` (không vai nghiệp
-- vụ nào có).
GRANT INSERT, UPDATE ON feature_flag TO ipms_app;

CREATE POLICY platform_flag_write ON feature_flag FOR INSERT
  WITH CHECK (current_setting('app.platform_write', true) = 'on');
CREATE POLICY platform_flag_update ON feature_flag FOR UPDATE
  USING (current_setting('app.platform_write', true) = 'on')
  WITH CHECK (current_setting('app.platform_write', true) = 'on');
