---
name: audit-risk-assessment
description: Xây dựng/cập nhật Audit Universe và đánh giá rủi ro toàn hàng cho kiểm toán nội bộ (risk assessment cấp năm). Dùng khi cần lập danh mục đối tượng kiểm toán, chấm điểm rủi ro đơn vị/quy trình, hoặc chuẩn bị đầu vào cho kế hoạch kiểm toán năm. Triggers - "audit universe", "đánh giá rủi ro kiểm toán", "risk assessment", "danh mục kiểm toán".
---

# Đánh giá rủi ro & Audit Universe

Skill bước ① trong vòng đời KTNB. Đọc trước: `../audit-common/quy-uoc.md` và `../audit-common/thang-xep-hang.md` (thang 5×5 — BẮT BUỘC dùng thang này).

## Đầu ra

- `07-kiem-toan-noi-bo/00-quan-tri/audit-universe.md`
- `07-kiem-toan-noi-bo/00-quan-tri/danh-gia-rui-ro-{NĂM}.md`

## Quy trình

### Bước 1 — Dựng/cập nhật Audit Universe
Liệt kê đối tượng kiểm toán (auditable entity) theo 2 chiều cắt, chọn chiều chính phù hợp tổ chức:
- **Theo đơn vị:** OpCo/trường/khối chức năng (với NHG: từng OpCo + khối tập đoàn).
- **Theo quy trình:** tuyển sinh, học phí & công nợ, mua sắm, nhân sự & lương, tài chính kế toán, CNTT (gồm iPMS/OneOffice), an toàn trường học, truyền thông, pháp chế…

Mỗi entity ghi: mã (`AU-xx`), mô tả, chủ sở hữu (vai trò), lần kiểm toán gần nhất, hệ thống CNTT liên quan. Nếu dự án đã có tài liệu tổ chức (org chart ở `00-boi-canh/`, Từ điển Tác vụ ở `06-tu-dien-tac-vu/`), khai thác để không bỏ sót quy trình.

### Bước 2 — Chấm điểm rủi ro từng entity
Với mỗi entity, chấm **Likelihood × Impact** theo thang 5×5, có cột "căn cứ chấm điểm" (bắt buộc — không chấm chay). Yếu tố cộng thêm khi xét đoán: thay đổi lớn (hệ thống mới, tái cơ cấu, nhân sự chủ chốt thay), khối lượng giao dịch/tiền, kết quả kiểm toán kỳ trước, thời gian từ lần kiểm toán cuối, mức độ tự động hóa, dấu hiệu bất thường từ tố giác/đường dây nóng.

### Bước 3 — Xếp hạng & heatmap
Bảng xếp hạng giảm dần theo điểm + heatmap 5×5 dạng bảng Markdown. Gắn hạng Rất cao/Cao/TB/Thấp → tần suất kiểm toán đề xuất (theo `thang-xep-hang.md` §1).

### Bước 4 — Bàn giao
Kết quả là ĐẦU VÀO cho `/audit-plan`. Ghi rõ giả định, nguồn thông tin còn thiếu, và mục "cần lãnh đạo xác nhận" — **skill không tự kết luận thay Trưởng KTNB**.

## Lưu ý

- Phỏng vấn lãnh đạo là nguồn quan trọng: nếu chưa có, soạn sẵn bộ câu hỏi phỏng vấn (10–12 câu) kèm file kết quả.
- Cập nhật lại giữa năm khi có biến động trọng yếu (NĐ 05/2019 Đ.14 cho phép điều chỉnh kế hoạch).
