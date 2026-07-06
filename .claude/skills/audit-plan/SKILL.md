---
name: audit-plan
description: Lập kế hoạch kiểm toán nội bộ năm (annual audit plan) dựa trên kết quả đánh giá rủi ro - chọn cuộc kiểm toán, phân bổ nguồn lực, lịch trình, trình phê duyệt. Dùng khi cần "kế hoạch kiểm toán năm", "annual audit plan", phân bổ ngày công kiểm toán, hoặc điều chỉnh kế hoạch giữa năm.
---

# Kế hoạch kiểm toán năm (risk-based)

Skill bước ② trong vòng đời KTNB. Đầu vào bắt buộc: `07-kiem-toan-noi-bo/00-quan-tri/danh-gia-rui-ro-{NĂM}.md` (chạy `/audit-risk-assessment` trước nếu chưa có). Đọc `../audit-common/quy-uoc.md` để đặt mã cuộc.

## Đầu ra

`07-kiem-toan-noi-bo/00-quan-tri/ke-hoach-nam-{NĂM}.md` — cấu trúc:

1. **Căn cứ lập kế hoạch** — kết quả risk assessment, chỉ đạo của HĐQT/UBKT, yêu cầu pháp lý.
2. **Danh mục cuộc kiểm toán** — bảng: mã cuộc (`KTNB-{NĂM}-nn-TÊN`) · đối tượng (AU-xx) · điểm rủi ro · loại (đảm bảo/tư vấn/theo dõi khắc phục) · quý dự kiến · ngày công · trưởng đoàn (vai trò).
3. **Ngân sách nguồn lực** — tổng ngày công khả dụng = số kiểm toán viên × ngày làm việc − đào tạo − quản trị − dự phòng đột xuất (**giữ 15–20% dự phòng**). Đối chiếu tổng ngày công kế hoạch ≤ khả dụng.
4. **Vùng rủi ro cao KHÔNG kiểm toán năm nay** — nêu rõ + lý do + biện pháp giám sát thay thế (bắt buộc, để lãnh đạo chấp nhận rủi ro một cách tường minh).
5. **Phê duyệt** — khối chữ ký: Trưởng KTNB lập → cấp thẩm quyền duyệt (theo NĐ 05/2019 Đ.14, duyệt TRƯỚC năm tài chính).

## Nguyên tắc chọn cuộc

- Rất cao: bắt buộc vào kế hoạch. Cao: vào trừ khi có lý do ghi rõ. TB/Thấp: theo chu kỳ hoặc luân phiên.
- Cân đối coverage: không dồn hết vào 1 khối; mỗi OpCo trọng yếu nên được "chạm" ít nhất gián tiếp.
- Cuộc đầu tiên với đơn vị mới nên phạm vi hẹp, ngày công +20% so ước tính.

## Điều chỉnh giữa năm

Khi thêm/bớt/hoãn cuộc: KHÔNG sửa đè bản đã duyệt — tạo `ke-hoach-nam-{NĂM}-dieu-chinh-v2.md` ghi thay đổi, lý do, và trạng thái phê duyệt lại.
