---
name: audit-program
description: Lập kế hoạch cuộc kiểm toán (engagement) - thông báo kiểm toán, tìm hiểu quy trình, Ma trận Rủi ro-Kiểm soát (RCM), chương trình kiểm toán chi tiết. Dùng khi bắt đầu một cuộc kiểm toán mới, cần "chương trình kiểm toán", "RCM", "audit program", "thông báo kiểm toán".
---

# Chương trình cuộc kiểm toán + RCM

Skill bước ③. Đọc trước: `../audit-common/quy-uoc.md` (mã cuộc, cấu trúc thư mục), `../audit-common/thang-xep-hang.md`, `../audit-common/chuan-muc.md` §4. Template: `../audit-common/templates/rcm.md`.

## Khởi tạo hồ sơ cuộc

Nếu chưa có, tạo cây thư mục `07-kiem-toan-noi-bo/{NĂM}/{MÃ-CUỘC}/01..06` theo quy ước. Mã cuộc lấy từ kế hoạch năm; nếu là kiểm toán đột xuất, thêm hậu tố `-DX` và ghi căn cứ yêu cầu.

## Quy trình

### Bước 1 — Thông báo kiểm toán → `01-ke-hoach/thong-bao-kiem-toan.md`
Nội dung: căn cứ, mục tiêu, phạm vi (quy trình + kỳ dữ liệu + đơn vị), thời gian dự kiến, thành phần đoàn (vai trò), danh mục tài liệu yêu cầu cung cấp trước (PBC list — Provided By Client, đánh số PBC-01…), đầu mối phối hợp. Gửi trước thực địa ≥ 5 ngày làm việc (trừ kiểm toán bất ngờ có phê duyệt riêng).

### Bước 2 — Tìm hiểu đối tượng
Thu thập & đọc: quy chế/quy trình nội bộ, sơ đồ tổ chức, báo cáo kỳ trước, dữ liệu khối lượng giao dịch, hệ thống CNTT sử dụng. Với NHG: khai thác Từ điển Tác vụ (`06-tu-dien-tac-vu/`) nếu quy trình đã được mô hình hóa — Task Cell có sẵn RACI, I/O, KPI là nguyên liệu tốt cho RCM. Ghi tóm tắt hiểu biết vào `01-ke-hoach/pham-vi-nguon-luc.md`.

### Bước 3 — Lập RCM → `02-chuong-trinh/rcm.md`
Theo template. Trình tự tư duy: **mục tiêu quy trình → rủi ro (what can go wrong) → kiểm soát hiện hữu → khoảng trống**. Mỗi rủi ro chấm L×I theo thang 5×5. Rủi ro KHÔNG có kiểm soát = ứng viên phát hiện "thiếu kiểm soát" — đánh dấu ngay. Chỉ đưa vào test những rủi ro điểm ≥ 8 (Cao/Rất cao) trừ khi ngày công cho phép rộng hơn.

### Bước 4 — Chương trình kiểm toán → `02-chuong-trinh/chuong-trinh-kiem-toan.md`
Bảng thủ tục: mã WP dự kiến (quy ước A/B/C/D theo `quy-uoc.md` §3) · rủi ro/kiểm soát tham chiếu (R0x/C0x) · mô tả thủ tục · loại test (ToD/ToE/substantive) · cỡ mẫu dự kiến (bảng `chuan-muc.md` §5) · người thực hiện · ngày công. Cuối file: khối phê duyệt của Trưởng đoàn/Trưởng KTNB (HITL — chương trình chưa duyệt thì chưa thực địa).

## Nguyên tắc

- Mọi thủ tục phải truy vết về ít nhất 1 rủi ro trong RCM; không test "cho có".
- Phạm vi đã thông báo là ranh giới — mở rộng phạm vi giữa chừng phải có phê duyệt bổ sung ghi văn bản.
- Kiểm tra xung đột lợi ích thành viên đoàn (NĐ 05/2019 Đ.6 — quy tắc 3 năm) và ghi xác nhận vào `pham-vi-nguon-luc.md`.
