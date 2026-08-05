-- ═══════════════════════════════════════════════════════════════════════════════
-- [F194 — Reviewer 05/08] Lưu SỐ GIỜ NGƯỜI XIN ĐỀ NGHỊ
--
-- Vấn đề: `requestedHours` được validate lúc nộp đơn, ghi vào `audit_log`, rồi BIẾN MẤT khỏi
-- bảng. Người duyệt mở đơn ra không nhìn thấy người xin đề nghị bao nhiêu giờ — muốn biết thì
-- phải đi tra sổ vết kiểm toán, thứ mà `data_steward` cố ý KHÔNG có quyền đọc (J3).
--
-- Hệ quả cộng hưởng với `hours ?? cap` ở service: bấm duyệt mà không điền gì = cấp trần tối đa
-- 72 giờ, kể cả khi người xin chỉ đề nghị 2 giờ. Con đường ngắn nhất (bấm duyệt) trở thành con
-- đường nới rộng nhất — đúng loại thiết kế mà mọi hệ phân quyền phải tránh.
--
-- Cột NULLABLE vì các đơn đã tạo trước bản này không có thông tin đó, và bịa một giá trị cho
-- chúng còn tệ hơn: service sẽ ĐÒI người duyệt nhập giờ tường minh khi gặp đơn cũ.
ALTER TABLE "policy_exception" ADD COLUMN "requested_hours" INTEGER;

-- Thuộc nhóm ③ "xin cái gì, vì sao, cho ai" — đóng băng sau khi tạo, cùng lý do với `reason`.
-- Không đóng băng thì người duyệt sửa được con số đề nghị rồi duyệt theo con số của chính mình,
-- và cả hồ sơ trông vẫn khớp.
--
-- `IS DISTINCT FROM` chứ không `<>`: cột nullable, mà `NULL <> NULL` cho ra NULL (không phải
-- TRUE), nên phép so bằng `<>` sẽ bỏ lọt mọi thay đổi dính NULL — cùng họ với chính lỗi NULL
-- mà F191 vừa vá ở tầng ứng dụng.
CREATE OR REPLACE FUNCTION policy_exception_immutable() RETURNS TRIGGER AS $$
BEGIN
  -- ③ đóng băng phần mô tả "xin cái gì, vì sao, cho ai"
  IF NEW.requester_user_id <> OLD.requester_user_id
     OR NEW.grantee_user_id <> OLD.grantee_user_id
     OR NEW.permission_code <> OLD.permission_code
     OR NEW.scope_type <> OLD.scope_type
     OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
     OR NEW.reason <> OLD.reason
     OR NEW.requested_hours IS DISTINCT FROM OLD.requested_hours
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
