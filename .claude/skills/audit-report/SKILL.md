---
name: audit-report
description: Soạn báo cáo kiểm toán nội bộ - draft, tiếp nhận phản hồi đơn vị, bản final, kèm bản HTML A4 song ngữ trình lãnh đạo theo NHG Design System. Dùng khi cần "báo cáo kiểm toán", "audit report", executive summary kiểm toán, hoặc chuyển bộ phát hiện thành báo cáo hoàn chỉnh.
---

# Báo cáo kiểm toán

Skill bước ⑥. Đề cương chuẩn: `../audit-common/templates/report-outline.md`. Đầu vào: toàn bộ `04-phat-hien/` (đã trao đổi với đơn vị) + `02-chuong-trinh/` (phạm vi thực tế) + thang ý kiến tổng thể `../audit-common/thang-xep-hang.md` §3.

## Đầu ra & luồng phiên bản

```
05-bao-cao/bao-cao-draft-v1.md   → gửi đơn vị lấy ý kiến (NĐ 05/2019 Đ.16: BẮT BUỘC)
05-bao-cao/phan-hoi-don-vi.md    → ghi nhận phản hồi + xử lý từng điểm (chấp nhận/bác + lý do)
05-bao-cao/bao-cao-final.md      → trạng thái final, không sửa đè
05-bao-cao/bao-cao-final.html    → bản A4 song ngữ VI/EN trình lãnh đạo (khi user yêu cầu)
```

## Quy trình

1. **Đối chiếu đầy đủ:** mọi phát hiện trong `tong-hop-phat-hien.md` phải xuất hiện trong báo cáo hoặc có ghi chú lý do loại (đã khắc phục ngay trong cuộc → chuyển mục ghi nhận; gộp vào phát hiện khác…). Không "rơi" phát hiện im lặng.
2. **Soạn draft theo đề cương** — phát hiện xếp mức độ giảm dần; mỗi phát hiện tóm 5C gọn (chi tiết đã có file PH-xx), kèm kế hoạch hành động thống nhất.
3. **Executive Summary viết SAU CÙNG**, ≤ 1 trang, cho người đọc 3 phút: ý kiến tổng thể + bảng đếm phát hiện + 3–5 thông điệp. Ý kiến tổng thể đề xuất theo thang §3 nhưng ghi rõ "đề xuất — Trưởng KTNB quyết định".
4. **Vòng phản hồi:** nhận ý kiến đơn vị → lập bảng xử lý từng điểm trong `phan-hoi-don-vi.md` → cập nhật draft-v2 nếu có thay đổi. Thay đổi mức độ/bỏ phát hiện sau phản hồi phải có lý do bằng chứng, không vì áp lực.
5. **Final + phát hành:** khối ký (Trưởng đoàn → Trưởng KTNB), danh sách nơi nhận (Tổng giám đốc, UBKT/HĐQT theo Đ.16, lãnh đạo đơn vị). Sau final → nhắc user chạy `/audit-followup` để mở sổ theo dõi.

## Bản HTML song ngữ (khi trình lãnh đạo)

Theo NHG Design System (Be Vietnam Pro, xanh `#037236`, đỏ `#ED2024`; token ở `design-system/styles/`), khổ A4, self-contained. Bố cục: trang bìa → executive summary có huy hiệu màu theo ý kiến tổng thể (Đạt = xanh, Cần cải thiện = vàng, Không đạt = đỏ) → bảng phát hiện → kế hoạch hành động. Song ngữ VI chính, EN phụ (in nghiêng hoặc cột phụ).

## Văn phong

Khách quan, dữ kiện, không quy kết cá nhân (vai trò thay tên — quy ước §6); nhận định trọng yếu truy vết được về WP; viết cho lãnh đạo không chuyên kiểm toán — tránh thuật ngữ không giải thích.
