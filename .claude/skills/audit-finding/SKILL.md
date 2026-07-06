---
name: audit-finding
description: Soạn và hoàn thiện phát hiện kiểm toán theo cấu trúc 5C (Criteria, Condition, Cause, Consequence, Corrective action), xếp hạng mức độ Cao/Trung bình/Thấp, tổng hợp danh sách phát hiện. Dùng khi cần "viết phát hiện", "finding", "5C", xếp hạng phát hiện, hoặc chuyển ngoại lệ từ working paper thành phát hiện chính thức.
---

# Phát hiện kiểm toán (5C)

Skill bước ⑤. Template: `../audit-common/templates/finding-5c.md`. Thang mức độ: `../audit-common/thang-xep-hang.md` §2.

## Đầu ra

- `04-phat-hien/PH-{NN}-{mô-tả}.md` — mỗi phát hiện một file
- `04-phat-hien/tong-hop-phat-hien.md` — bảng tổng: mã · tiêu đề · mức độ · WP nguồn · trạng thái trao đổi với đơn vị

## Quy trình soạn 1 phát hiện

1. **Kiểm tra bằng chứng trước khi viết:** phát hiện phải trỏ về ≥ 1 working paper có ngoại lệ đã xác nhận. Không có WP → quay lại `/audit-fieldwork` bổ sung, không viết phát hiện "theo cảm nhận".
2. **Viết đủ 5C** theo template — thứ tự tư duy nên là Condition (sự kiện) → Criteria (chuẩn bị vi phạm) → Cause (5-Whys tới nguyên nhân gốc) → Consequence → Corrective action.
3. **Xếp mức độ** theo thang §2, ghi 1 câu căn cứ xếp mức. Áp quy tắc nâng mức: ≥ 3 phát hiện TB cùng nguyên nhân gốc → đề xuất gộp thành 1 phát hiện Cao (hỏi trưởng đoàn trước khi gộp).
4. **Kiến nghị phải chữa nguyên nhân gốc**, cụ thể - đo được - có vai trò phụ trách - có thời hạn phù hợp mức độ (Cao ≤ 30 ngày, TB ≤ 90, Thấp ≤ 180). Tránh kiến nghị kiểu "tăng cường", "nâng cao nhận thức" — không đo được.
5. **Trao đổi với đơn vị** (trưởng đoàn thực hiện) → điền mục "Ý kiến đơn vị". Đơn vị không đồng ý → ghi trung thực cả hai quan điểm + bằng chứng mỗi bên; KHÔNG hạ mức độ chỉ vì đơn vị phản đối.

## Kiểm tra chất lượng trước khi chốt (chạy cho từng phát hiện)

- [ ] Condition chỉ chứa sự kiện khách quan, có số liệu n/N, không tính từ cảm tính
- [ ] Criteria trích dẫn văn bản cụ thể (tên, số, điều khoản); nếu không có quy định → criteria là thông lệ tốt/khung COSO và ghi rõ
- [ ] Cause là nguyên nhân GỐC, không phải triệu chứng ("nhân viên quên" chưa phải gốc)
- [ ] Mỗi kiến nghị map 1-1 với cause hoặc consequence
- [ ] Không nêu tên cá nhân — chỉ vai trò
- [ ] Mức độ nhất quán với thang chung (so với các phát hiện khác trong cuộc)

## Dấu hiệu gian lận

Nếu bằng chứng gợi ý **cố ý/gian lận**: DỪNG quy trình thường, không trao đổi với đối tượng nghi vấn, báo ngay Trưởng KTNB để quyết định hướng xử lý (điều tra riêng, pháp chế). Skill chỉ hỗ trợ bảo toàn bằng chứng, không tự kết luận gian lận.
