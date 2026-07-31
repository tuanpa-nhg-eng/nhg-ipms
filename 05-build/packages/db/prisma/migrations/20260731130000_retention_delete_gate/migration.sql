-- [Trục C L5 — tự bắt khi chạy driver] CỔNG XOÁ CÓ ĐIỀU KIỆN cho job lưu trữ.
--
-- Lượt chạy thật đầu tiên ăn `permission denied for table ai_interaction`: `ipms_app` cố ý
-- KHÔNG có quyền DELETE trên bảng nhật ký. Đây là bất biến có thật của hệ (cùng họ với phát
-- hiện ở L3: tầng ứng dụng không đúc được `role`) — dữ liệu nhật ký chỉ thêm, không xoá.
--
-- Nhưng L5 tồn tại CHÍNH VÌ có lúc phải xoá: NĐ13 nói không giữ lâu hơn mức cần thiết. Nên
-- câu hỏi không phải "có cho xoá không" mà "cho xoá ở ĐÚNG một đường nào".
--
-- Cách sửa SAI đã loại: `GRANT DELETE ON ai_interaction TO ipms_app` trần trụi. Nó mở khả
-- năng xoá cho MỌI đoạn mã trong ứng dụng — kể cả một lỗi lập trình ở một route không liên
-- quan. Đổi một bất biến kiến trúc lấy sự tiện lợi của một hàm.
--
-- Cách chọn — đúng khuôn `app.platform_write` mà L2 đã dựng: cấp quyền, nhưng chốt sau một
-- GUC mà TRONG MÃ chỉ có đúng một hàm bật (`withRetention`), và hàm đó chỉ được gọi từ nhánh
-- `apply` của `RetentionService`. Xoá ngoài đường lưu trữ ⇒ trigger chặn, kể cả khi quyền có.
GRANT DELETE ON ai_interaction TO ipms_app;

CREATE OR REPLACE FUNCTION ai_interaction_delete_gate() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.retention_run', true) <> 'on' THEN
    RAISE EXCEPTION 'ai_interaction: chỉ xoá được trong một lượt chạy lưu trữ (L5) — đường xoá khác không tồn tại';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_interaction_delete_gate_trg
  BEFORE DELETE ON ai_interaction
  FOR EACH ROW EXECUTE FUNCTION ai_interaction_delete_gate();
