-- [Trục D L1] `ai_interaction` ghi MỨC PHÂN LOẠI và NHÓM DỮ LIỆU của từng lượt gọi.
--
-- `Spec_AI_Assistant.md:211` khai hai thông tin này từ đầu ("ai_interaction APPEND-ONLY:
-- agent, provider, model, tokensIn/Out, costUsd, **dataClass**, có-scrub-hay-không,
-- promptVersion, kết quả") — nhưng bảng chưa bao giờ có cột. Hệ quả: nhật ký AI không trả lời
-- được câu hỏi trung tâm của BR-M09-02 — *lượt gọi này xử lý dữ liệu mức nào*.
--
-- Quan trọng hơn: hai cột này ghi lại KẾT QUẢ SUY DIỄN của gateway (max rank của các nhóm
-- chạm tới, tra từ `data_asset`), KHÔNG phải lời khai của người gọi. Trước trục D, mức là thứ
-- người gọi tự khai và không được lưu ở đâu cả — nghĩa là không kiểm chứng lại được.
--
-- NULL = lượt gọi ghi TRƯỚC lát này. Cố ý không backfill: suy ngược mức phân loại cho 14.532
-- dòng lịch sử là bịa ra một con số chưa từng được tính. Cột NULL nói đúng sự thật "không
-- biết", một giá trị mặc định nói dối rằng biết.

ALTER TABLE "ai_interaction" ADD COLUMN "data_class" TEXT;
ALTER TABLE "ai_interaction" ADD COLUMN "data_assets" JSONB;

-- Bốn mức của `data_asset` (trục C L0), không hơn. NULL vẫn hợp lệ (dòng lịch sử).
ALTER TABLE "ai_interaction" ADD CONSTRAINT "ai_interaction_data_class_check"
  CHECK (data_class IS NULL OR data_class IN ('public', 'internal', 'confidential', 'restricted'));

-- `restricted` KHÔNG BAO GIỜ được phép là mức của một lượt gọi AI (N6). Chốt ở DDL chứ không
-- chỉ ở service: nếu một dòng như thế xuất hiện, nghĩa là ba cổng N1/N2/N3 đã hở và ta muốn
-- biết ngay tại chỗ ghi, không phải sáu tháng sau khi ai đó rà sổ.
ALTER TABLE "ai_interaction" ADD CONSTRAINT "ai_interaction_no_restricted_check"
  CHECK (data_class IS NULL OR data_class <> 'restricted');

CREATE INDEX "ai_interaction_tenant_data_class_idx" ON "ai_interaction"("tenant_id", "data_class");
