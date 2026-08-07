-- [Trục D — vá Reviewer F203 + F214] Hai CHECK đóng hai lỗ mà L1 để lại trong danh bạ agent.

-- ═══ F203 — hai DDL đang nói ngược nhau về `restricted`
--
-- `ai_agent_max_data_class_check` (L0) CHO PHÉP 'restricted' làm trần agent, trong khi
-- `ai_interaction_no_restricted_check` (L1) CẤM 'restricted' làm mức của một lượt gọi. Cây cầu
-- duy nhất giữa hai câu đó là một unit test chạy trên DỮ LIỆU SEED — mà `registerTestAgent()`
-- ghi thẳng bằng kết nối owner, đi vòng qua đúng cây cầu ấy.
--
-- Hậu quả nếu một agent như thế tồn tại: lượt gọi chạm nhóm 'restricted' QUA được kiểm trần
-- (rank bằng nhau), chạy tới mock, RỒI mới nổ ở CHECK lúc ghi sổ ⇒ 500 sau khi việc đã xảy ra,
-- thay vì 403 trước khi nó xảy ra. N6 ("restricted không tới BẤT KỲ nhà cung cấp nào") khi đó
-- đúng chỉ nhờ một sự tình cờ: chưa ai khai trần đó.
--
-- Nay N6 được giữ ở BA tầng độc lập: ① cổng `resolveAndGuardAgent` phát biểu trực tiếp
-- ② CHECK này — không đúc được agent có trần 'restricted' ③ CHECK trên `ai_interaction`.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_ceiling_not_restricted_check"
  CHECK (max_data_class <> 'restricted');

-- ═══ F214 — tiền tố `test.` là quy ước dọn rác, phải được giữ bằng ràng buộc
--
-- `cleanupTestAgents()` xoá theo tiền tố `test.`. Không gì cấm một agent NGHIỆP VỤ thật mang
-- tiền tố đó, và ngày ai đó đặt tên như vậy thì một lượt chạy test sẽ xoá nó khỏi danh bạ
-- chuẩn tập đoàn. Quy ước chỉ là quy ước cho tới khi có ràng buộc.
--
-- Agent test dùng `kind='infrastructure'` nên vẫn đăng ký được — ngoại lệ nằm đúng chỗ hẹp.
ALTER TABLE "ai_agent" ADD CONSTRAINT "ai_agent_test_prefix_check"
  CHECK (kind <> 'business' OR code NOT LIKE 'test.%');
