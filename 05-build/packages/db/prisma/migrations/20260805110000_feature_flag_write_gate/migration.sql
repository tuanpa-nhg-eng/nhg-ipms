-- ═══════════════════════════════════════════════════════════════════════════════
-- [F195 — Reviewer 05/08] Cổng GUC `app.platform_write` trên `feature_flag` KHÔNG chặn thật.
--
-- Lỗ: từ Phase 0, `feature_flag` đã có policy PERMISSIVE `tenant_or_global` khai FOR ALL và
-- CHỈ có USING:
--
--     USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::uuid)
--
-- Với policy áp cho INSERT/UPDATE mà không khai WITH CHECK, Postgres LẤY LUÔN biểu thức USING
-- làm WITH CHECK. Khi ấy một hàng cờ toàn cục (`tenant_id IS NULL`) tự nó thoả điều kiện.
--
-- Cộng thêm: nhiều policy PERMISSIVE được **OR** với nhau. Nên khi L2 thêm `platform_flag_write`
-- (đòi GUC) thì phép kiểm thực tế trở thành:
--
--     (tenant_id IS NULL OR tenant_id = app.tenant_id)  OR  (app.platform_write = 'on')
--
-- — vế trái đã đúng sẵn, vế phải không bao giờ cần tới. Tức là kể từ L2, `ipms_app` (đã được
-- GRANT INSERT, UPDATE ở migration đó) ghi được cờ tính năng mà KHÔNG cần đi qua
-- `withPlatformWrite()`. Tầng ứng dụng vẫn chặn đúng (permission `flag:write` chỉ tầng nền
-- tảng có), nên chưa có đường khai thác thực tế — nhưng lớp phòng thủ ở DB, thứ được dựng ra
-- để sống sót một lỗi ở tầng trên, thì đã mất mà không ai biết.
--
-- Vì sao dùng RESTRICTIVE thay vì sửa `tenant_or_global` thành FOR SELECT:
--   · policy RESTRICTIVE được **AND** vào kết quả, nên nó đúng bất kể sau này ai thêm bao
--     nhiêu policy PERMISSIVE nữa — sửa `tenant_or_global` chỉ vá đúng một đường vòng đang
--     thấy, còn đây là chặn cả họ đường vòng đó;
--   · `tenant_or_global` vẫn giữ đúng vai trò ban đầu của nó là phép lọc ĐỌC;
--   · giữ nguyên [F1] "app chỉ đọc feature_flag" ở dạng mạnh hơn: nay muốn ghi thì phải bật
--     GUC, và trong mã chỉ đúng một hàm bật được GUC đó (`withPlatformWrite`).
--
-- Ca đối chứng nằm ở `platform-admin.spec`: cùng lệnh ghi, chạy ngoài `withPlatformWrite()`
-- phải bị DB từ chối.

CREATE POLICY platform_flag_write_required ON feature_flag AS RESTRICTIVE FOR INSERT
  WITH CHECK (current_setting('app.platform_write', true) = 'on');

CREATE POLICY platform_flag_update_required ON feature_flag AS RESTRICTIVE FOR UPDATE
  USING (current_setting('app.platform_write', true) = 'on')
  WITH CHECK (current_setting('app.platform_write', true) = 'on');

-- Cùng một cái bẫy trên bảng `tenant` thì KHÔNG tồn tại, và lý do đáng ghi lại để lần sau khỏi
-- kiểm tra lại: `tenant_isolation` là `USING (id = app.tenant_id)`, nên khi dùng làm WITH CHECK
-- cho INSERT nó so id của hàng MỚI với đơn vị hiện tại và luôn cho FALSE. Ở đó vế PERMISSIVE
-- kia thực sự là vế duy nhất mở đường, đúng như thiết kế L2 mô tả.
--
-- Bảng `role` cũng có `tenant_or_global` khai FOR ALL chỉ-USING, nhưng `ipms_app` KHÔNG hề
-- được GRANT INSERT/UPDATE trên đó (bất biến Phase 0, xem ghi chú ở `policy-exception.service`)
-- ⇒ không có đường ghi nào để mà lọt. Ghi ra đây vì "policy lỏng" và "có đường ghi" là hai
-- điều kiện phải xảy ra CÙNG LÚC mới thành lỗ — và chỉ `feature_flag` hội đủ cả hai.
