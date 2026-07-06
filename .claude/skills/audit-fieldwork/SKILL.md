---
name: audit-fieldwork
description: Thực hiện giai đoạn thực địa kiểm toán - walkthrough, test of controls, substantive test, chọn mẫu, phân tích dữ liệu, lập working paper (hồ sơ làm việc). Dùng khi cần "working paper", "chọn mẫu kiểm toán", "test kiểm soát", "walkthrough", ghi nhận kết quả kiểm tra, hoặc phân tích dữ liệu phục vụ kiểm toán.
---

# Thực địa & hồ sơ làm việc (working papers)

Skill bước ④. Tiền đề: chương trình kiểm toán đã duyệt ở `02-chuong-trinh/`. Template: `../audit-common/templates/working-paper.md`. Cỡ mẫu: `../audit-common/chuan-muc.md` §5.

## Đầu ra

- `03-thuc-hien/WP-{X}{NN}-{mô-tả}.md` — mỗi thủ tục một working paper
- `03-thuc-hien/nhat-ky-thuc-dia.md` — nhật ký: ngày, việc, người gặp (vai trò), vướng mắc
- `03-thuc-hien/evidence/WP-xxx/` — bằng chứng đính kèm

## Chuẩn working paper "đứng một mình được"

Người soát xét KHÔNG tham gia cuộc vẫn phải tái lập được kết luận chỉ từ WP: mục tiêu → tổng thể (kèm căn cứ đầy đủ của tổng thể) → phương pháp chọn mẫu (tái lập được: ghi seed/quy tắc) → thuộc tính test → kết quả từng mẫu → đánh giá ngoại lệ → kết luận. Thiếu mắt xích nào bổ sung mắt xích đó trước khi kết luận.

## Kỹ thuật theo phân vùng

- **A — Walkthrough:** chọn 1 giao dịch, đi đầu-cuối qua mọi bước quy trình, ghi ai làm gì trên hệ thống nào, đối chiếu quy trình văn bản vs thực tế. Kết luận ToD cho từng kiểm soát trong RCM.
- **B — Test of controls:** chọn mẫu theo tần suất kiểm soát; test đúng thuộc tính đã định nghĩa. **Gặp ngoại lệ:** dừng lại tìm nguyên nhân trước, KHÔNG tự động mở rộng mẫu để "pha loãng" tỷ lệ lỗi.
- **C — Substantive:** đối chiếu độc lập 2 nguồn (VD: danh sách thu học phí vs sổ kế toán vs sao kê ngân hàng), tính lại (recalculation), xác nhận bên thứ ba khi cần.
- **D — Data analytics:** khi có dữ liệu số (CSV/Excel/DB), viết script phân tích (Python/SQL) test 100% tổng thể thay vì chọn mẫu: trùng lặp, ngoài ngưỡng, sai kỳ, phân quyền xung đột (SoD), Benford khi nghi ngờ gian lận số liệu. Lưu script vào `evidence/` để tái lập.

## Kỷ luật bằng chứng

- Bằng chứng phải **đầy đủ – tin cậy – liên quan – hữu ích**; nguồn độc lập > nguồn do đơn vị cung cấp; văn bản > lời nói. Lời phỏng vấn phải được chứng thực (corroborate) trước khi làm căn cứ phát hiện.
- Không dán PII trực tiếp vào WP — dùng mã tham chiếu (quy ước §6).
- Ngoại lệ đã xác nhận với đơn vị (ghi vai trò + ngày trao đổi) → chuyển `/audit-finding` soạn phát hiện; cập nhật cột trạng thái trong chương trình kiểm toán sau mỗi WP hoàn tất.

## Soát xét (HITL)

WP xong → đặt `trang_thai: reviewed` CHỈ SAU khi trưởng đoàn soát xét thật; skill không tự đặt reviewed.
