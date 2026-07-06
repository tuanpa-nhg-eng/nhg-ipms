---
name: audit-followup
description: Theo dõi khắc phục kiến nghị kiểm toán - mở sổ theo dõi sau khi báo cáo final, cập nhật trạng thái, xác minh bằng chứng khắc phục, báo cáo định kỳ tình hình khắc phục toàn hàng. Dùng khi cần "theo dõi kiến nghị", "follow-up", "khắc phục", kiểm tra tiến độ thực hiện kiến nghị, hoặc báo cáo quý về khắc phục.
---

# Theo dõi khắc phục kiến nghị

Skill bước ⑦ — khép vòng đời. Trạng thái chuẩn: `../audit-common/thang-xep-hang.md` §4 (`open → in-progress → implemented → verified` | `overdue` | `risk-accepted`).

## Hai cấp sổ theo dõi

1. **Cấp cuộc:** `{NĂM}/{MÃ-CUỘC}/06-theo-doi/theo-doi-khac-phuc.md` — mở ngay sau báo cáo final, mỗi kiến nghị một dòng: mã (`{MÃ-CUỘC}/PH-xx/KN-n`) · nội dung · mức độ · vai trò phụ trách · hạn cam kết · trạng thái · bằng chứng xác minh · ngày verified.
2. **Cấp toàn hàng:** `00-quan-tri/so-theo-doi-kien-nghi.md` — gộp mọi cuộc, là nguồn cho báo cáo UBKT. Mỗi lần cập nhật sổ cuộc phải đồng bộ sổ toàn hàng (giữ 2 sổ nhất quán — đối chiếu khi cập nhật).

## Quy tắc chuyển trạng thái

- `implemented` = đơn vị BÁO đã xong — chưa phải xong. Chỉ chuyển `verified` khi KTNB đã xem bằng chứng (văn bản ban hành, cấu hình hệ thống, mẫu tái test) và ghi tham chiếu bằng chứng vào sổ. Kiến nghị mức **Cao: bắt buộc tái test** (mini-WP trong `06-theo-doi/`), không nhận bằng chứng giấy tờ đơn thuần.
- `overdue` = quá hạn cam kết mà chưa `implemented` → tự động gắn khi cập nhật sổ; quá hạn lần 2 → đề xuất leo thang lên cấp trên của vai trò phụ trách.
- `risk-accepted` chỉ hợp lệ khi có văn bản phê duyệt đúng cấp thẩm quyền (mức Cao: Tổng giám đốc/UBKT) — ghi tham chiếu văn bản, không nhận chấp thuận miệng.

## Báo cáo định kỳ (quý)

Khi user yêu cầu, tổng hợp từ sổ toàn hàng: tỷ lệ verified/tổng, số overdue theo mức độ, top kiến nghị Cao còn mở, xu hướng theo quý. Xuất Markdown; bản trình UBKT làm HTML A4 song ngữ theo NHG Design System (như `/audit-report`).

## Nhắc lịch

Khi mở sổ cuộc, đề xuất user tạo lịch kiểm tra định kỳ (skill `/schedule` của Claude Code) theo hạn gần nhất trong sổ — không tự tạo lịch khi chưa được đồng ý.
