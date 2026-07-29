# Thang đo dùng chung — Tiền bán hàng iPMS

Mọi tài liệu trong `12-khach-hang/` dùng **duy nhất** các thang dưới đây. Không tự chế thang mới.

## 1. Mức ưu tiên — MoSCoW

| Mức | Nghĩa | Luật |
|---|---|---|
| **M** — Must have | Thiếu là dự án thất bại, khách không nghiệm thu | Mọi `M` phải có tiêu chí chấp nhận đo được |
| **S** — Should have | Quan trọng, hoãn được sang đợt sau mà không sập nghiệp vụ | |
| **C** — Could have | Làm nếu còn nguồn lực | |
| **W** — Won't have this time | **Hai bên thống nhất** loại khỏi đợt này | Phải ghi rõ trong BRD §3 "Ngoài phạm vi" — đây là điều khoản bảo vệ cả hai bên |

⚠️ Nếu >60% yêu cầu là `M` ⇒ khách chưa thực sự ưu tiên. Quay lại làm việc lại về phạm vi trước khi phát hành BRD.

## 2. Mức đáp ứng của iPMS (fit) — 5 mức

Suy ra từ `so-nang-luc-ipms.md`, **không** đánh theo cảm tính.

| Mức trình khách | Suy từ mức nền tảng | Ý nghĩa với khách | Ý nghĩa với báo giá |
|---|---|---|---|
| **Sẵn sàng** | VH | Dùng được ngay sau khi khởi tạo | 0 ngày công phát triển |
| **Sẵn sàng — cần kích hoạt** | BẬT | Có sẵn, chờ khách cung cấp khoá/token/hạ tầng/tenant | 0 ngày công build; **có phụ thuộc phía khách** — luôn ghi vào §13 Phụ thuộc |
| **Đáp ứng bằng cấu hình** | CH | Nhà cung cấp hoặc chính khách cấu hình, không sửa mã | Ngày công cấu hình + đào tạo |
| **Cần phát triển** | PT | Chưa có, làm được, phải ước lượng | Ngày công phát triển — **bắt buộc** hiện ở mục Gap |
| **Ngoài phạm vi đợt này** | NPV | Không đưa vào cam kết lần này | Đánh giá riêng |

**Luật bất biến:** một yêu cầu `Must have` rơi vào **Cần phát triển** hoặc **Ngoài phạm vi** là **rủi ro đỏ** — phải xuất hiện ở BRD §14 Rủi ro, kèm phương án (giảm phạm vi / hoãn / phát triển có tính phí).

## 3. Mức trưởng thành quản trị hiệu suất của khách

Dùng để đặt kỳ vọng và chọn điểm khởi đầu. Ghi vào BRD §2.

| Mức | Dấu hiệu | Hệ quả triển khai |
|---|---|---|
| **M0 — Chưa có khung** | Không có KPI chính thức, đánh giá cảm tính | Phải làm chuẩn hoá KPI trước; kỳ vọng "bật lên là chạy" là sai |
| **M1 — KPI thủ công rời rạc** | Excel theo phòng, công thức không nhất quán | Trọng tâm đợt đầu: Từ điển KPI + chuẩn hoá |
| **M2 — Có khung, chưa xuyên suốt** | Có KPI/OKR nhưng không phân rã tới cá nhân, không gắn kết quả | Trọng tâm: cascade + trọn vòng đánh giá |
| **M3 — Đã có hệ, muốn nâng cấp** | Đang chạy phần mềm khác, cần thay/mở rộng | Trọng tâm: di trú dữ liệu + tích hợp + tính năng còn thiếu; phải khảo sát hệ cũ |

## 4. Phân loại dữ liệu (dùng cho phân hệ I và L)

Khớp đúng phân loại đang dùng trong sản phẩm — quyết định dữ liệu nào được gọi mô hình AI ngoài.

| Mức | Ví dụ tại khách | Ràng buộc |
|---|---|---|
| **Công khai** | Tên phòng ban, cơ cấu tổ chức công bố | Không hạn chế |
| **Nội bộ** | Danh mục KPI, mô tả tác vụ | Được xử lý qua mô hình ngoài nếu khách đồng ý |
| **Mật** | Điểm đánh giá cá nhân, công thức lương | Mặc định **không** rời hạ tầng; cần quyết định tường minh của khách |
| **Dữ liệu cá nhân (PII)** | Họ tên, email, hồ sơ nhân sự | Khử danh trước khi xử lý; không đưa vào tài liệu |

## 5. Mức rủi ro dự án (BRD §14)

| Mức | Tiêu chí |
|---|---|
| **Cao** | Chặn nghiệm thu đợt đầu, hoặc phụ thuộc bên thứ ba không kiểm soát được |
| **Trung bình** | Làm chậm tiến độ hoặc tăng ngày công đáng kể |
| **Thấp** | Xử lý được trong quá trình triển khai |

Mỗi rủi ro ghi đủ: **hiện tượng → ảnh hưởng → phương án giảm thiểu → ai chịu trách nhiệm (khách hay nhà cung cấp)**.

## 6. Cờ chất lượng khảo sát (kế thừa từ playbook)

| Cờ | Nghĩa |
|---|---|
| ★ | Câu bắt buộc hỏi — chưa có câu trả lời thì **không** được phát hành BRD |
| ○ ◐ ● | Khai thác · Đào sâu · Xác nhận |
| ⚠ | Cờ rủi ro — câu trả lời rơi vào mẫu này thì mở ngay một mục `RR-nn` |
