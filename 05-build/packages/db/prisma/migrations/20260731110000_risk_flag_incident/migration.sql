-- [Trục C L4] CỜ RỦI RO (sinh tự động) + LUỒNG SỰ CỐ
--
-- K8: cờ rủi ro SINH TỰ ĐỘNG từ sự kiện ĐÃ CÓ SẴN trong hệ — không có màn "nhập cờ".
-- Lý do bất biến này quan trọng hơn nó thoạt nghe: một sổ rủi ro nhập tay đo lường sự CHĂM CHỈ
-- của người nhập, không đo lường rủi ro. Nó đầy lúc mới triển khai rồi rỗng dần, và cái rỗng
-- đó bị đọc nhầm thành "hệ thống an toàn". Cờ suy ra từ sự kiện thì rỗng chỉ có một nghĩa:
-- không có sự kiện nào xảy ra.
--
-- Nguồn sự kiện, tất cả đã tồn tại trước lát này (không bịa nguồn mới):
--   · audit_log 'policy.denied'            — chính sách ABAC từ chối
--   · audit_log 'sod.violation_blocked'    — vi phạm phân tách nhiệm vụ (5 module dùng chung)
--   · audit_log 'admin.role_grant_denied'  — chặn leo thang khi gán vai (J1)
--   · audit_log 'admin.impersonation_denied' — chặn mở phiên đóng vai (J12)
--   · audit_log 'authoring.grant_denied' / 'ai_golden.sod_denied'
--   · audit_log 'policy.exception_denied' / 'policy.exception_used'  — trục C L3
--   · audit_log 'export.blocked'           — THÊM Ở LÁT NÀY, xem ghi chú dưới
--   · ai_interaction status='blocked'      — egress AI bị chặn
--
-- ⚠️ Lỗ hổng phát hiện khi rà nguồn cho lát này: **L1 chỉ ghi vết lần xuất THÀNH CÔNG**
-- (`export_log` do interceptor ghi sau khi guard cho qua). Lần xuất bị CHẶN không để lại dấu
-- gì ngoài một mã 403 trả về cho client. Nhưng "ai đó vừa thử mang dữ liệu `restricted` ra
-- ngoài" đúng là tín hiệu an ninh mà B0/B5 cần thấy NHẤT — thành công thì đã đúng chính sách,
-- còn thất bại mới là lúc có người chạm vào tường. Lát này bổ sung audit `export.blocked` ở
-- `ExportGuard` để nguồn cờ đó tồn tại thật.

CREATE TABLE "risk_flag" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- Loại cờ — khai trong MÃ (`RISK_RULES` ở @ipms/shared), không phải bảng tham chiếu:
    -- thêm loại cờ là một thay đổi có người rà, không phải một hàng ai đó chèn lúc 2 giờ sáng.
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    -- Nguồn gốc: cặp (source_type, source_ref) là KHOÁ CHỐNG TRÙNG. Bộ sinh chạy bao nhiêu
    -- lần cũng ra cùng một tập cờ — nghĩa là nó chạy được theo lịch, theo yêu cầu, hay hai
    -- lần liên tiếp, mà không nhân bản.
    "source_type" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "actor_user_id" UUID,
    "summary" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    -- Gắn vào một sự cố. Đây là THAY ĐỔI DUY NHẤT được phép trên một dòng cờ (trigger dưới).
    "incident_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_flag_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "risk_flag" ADD CONSTRAINT "risk_flag_severity_check"
  CHECK (severity IN ('low', 'medium', 'high'));

-- Chống trùng ở TẦNG DB, không chỉ ở logic bộ sinh: một `ON CONFLICT DO NOTHING` chỉ an toàn
-- khi có ràng buộc thật để mà conflict.
CREATE UNIQUE INDEX "risk_flag_source_key" ON "risk_flag"("tenant_id", "source_type", "source_ref");
CREATE INDEX "risk_flag_tenant_occurred" ON "risk_flag"("tenant_id", "occurred_at" DESC);
CREATE INDEX "risk_flag_incident" ON "risk_flag"("incident_id") WHERE "incident_id" IS NOT NULL;

ALTER TABLE risk_flag ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON risk_flag FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- KHÔNG cấp DELETE: cờ là SỰ KIỆN ĐÃ XẢY RA, không phải việc-cần-làm mà ai đó gạch đi cho
-- gọn danh sách. Muốn "xử lý" một cờ thì gắn nó vào một sự cố và đóng sự cố đó — có người
-- phụ trách, có nguyên nhân, có mốc thời gian. Cùng tinh thần K6 với audit_log/export_log.
GRANT SELECT, INSERT, UPDATE ON risk_flag TO ipms_app;

-- K8 ở tầng DB: nội dung cờ BẤT BIẾN, chỉ `incident_id` đổi được. Không có đường "sửa mức độ
-- cho đỡ đỏ" hay "đổi mô tả cho dễ nhìn" — kể cả bằng UPDATE thẳng.
CREATE OR REPLACE FUNCTION risk_flag_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind <> OLD.kind
     OR NEW.severity <> OLD.severity
     OR NEW.source_type <> OLD.source_type
     OR NEW.source_ref <> OLD.source_ref
     OR NEW.summary <> OLD.summary
     OR NEW.occurred_at <> OLD.occurred_at
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.detail::text <> OLD.detail::text THEN
    RAISE EXCEPTION 'risk_flag: cờ rủi ro là sự kiện đã xảy ra — chỉ gắn/gỡ sự cố được (K8)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_flag_immutable_trg
  BEFORE UPDATE ON risk_flag
  FOR EACH ROW EXECUTE FUNCTION risk_flag_immutable();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SỰ CỐ: mở → điều tra → khắc phục → đóng
CREATE TABLE "incident" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignee_user_id" UUID,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    -- Nguyên nhân gốc: BẮT BUỘC khi đóng (constraint dưới). Một sự cố đóng mà không ghi
    -- nguyên nhân là một sự cố sẽ xảy ra lại.
    "root_cause" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "incident" ADD CONSTRAINT "incident_severity_check"
  CHECK (severity IN ('low', 'medium', 'high'));
ALTER TABLE "incident" ADD CONSTRAINT "incident_status_check"
  CHECK (status IN ('open', 'investigating', 'remediating', 'closed'));
-- Đóng ⇒ phải có nguyên nhân ĐỦ DÀI (≥20 ký tự, cùng ngưỡng với lý do đóng vai/ngoại lệ:
-- "đã xong" không phải một nguyên nhân) + mốc đóng + người đóng.
ALTER TABLE "incident" ADD CONSTRAINT "incident_closed_shape"
  CHECK (
    status <> 'closed'
    OR (root_cause IS NOT NULL AND char_length(btrim(root_cause)) >= 20
        AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  );

CREATE INDEX "incident_tenant_status" ON "incident"("tenant_id", "status");

ALTER TABLE incident ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incident FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON incident TO ipms_app;

-- Trạng thái đi MỘT CHIỀU. Đóng rồi mở lại là một sự cố MỚI tham chiếu sự cố cũ — không phải
-- cùng một hàng đổi trạng thái, vì như vậy `closed_at`/`root_cause` của lần đóng trước bị ghi
-- đè và hồ sơ mất đúng phần đáng đọc nhất.
CREATE OR REPLACE FUNCTION incident_forward_only() RETURNS TRIGGER AS $$
DECLARE
  rank_old INT;
  rank_new INT;
BEGIN
  rank_old := CASE OLD.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1
                              WHEN 'remediating' THEN 2 ELSE 3 END;
  rank_new := CASE NEW.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1
                              WHEN 'remediating' THEN 2 ELSE 3 END;
  IF rank_new < rank_old THEN
    RAISE EXCEPTION 'incident: trạng thái chỉ đi một chiều (% → % không hợp lệ)', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'incident: sự cố đã đóng — mở lại phải là một sự cố MỚI';
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incident_forward_only_trg
  BEFORE UPDATE ON incident
  FOR EACH ROW EXECUTE FUNCTION incident_forward_only();
