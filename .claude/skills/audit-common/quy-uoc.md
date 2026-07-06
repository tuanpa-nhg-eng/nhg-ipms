# Quy ước hồ sơ Kiểm toán Nội bộ

## 1. Mã cuộc kiểm toán (Engagement ID)

Định dạng: `KTNB-{NĂM}-{SỐ THỨ TỰ 2 chữ số}-{TÊN NGẮN}`

- Ví dụ: `KTNB-2026-01-TUYENSINH`, `KTNB-2026-02-MUASAM`, `KTNB-2026-03-HOCPHI`
- TÊN NGẮN: viết hoa, không dấu, không khoảng trắng, ≤ 12 ký tự.
- Kiểm toán đột xuất thêm hậu tố `-DX`: `KTNB-2026-04-CNTT-DX`.

## 2. Cấu trúc thư mục hồ sơ (tính từ gốc dự án)

```
07-kiem-toan-noi-bo/
├── 00-quan-tri/
│   ├── audit-universe.md            # danh mục đối tượng kiểm toán
│   ├── danh-gia-rui-ro-{NĂM}.md     # kết quả risk assessment năm
│   ├── ke-hoach-nam-{NĂM}.md        # kế hoạch kiểm toán năm
│   └── so-theo-doi-kien-nghi.md     # sổ theo dõi khắc phục TOÀN HÀNG (mọi cuộc)
└── {NĂM}/
    └── {MÃ-CUỘC}/
        ├── 01-ke-hoach/
        │   ├── thong-bao-kiem-toan.md
        │   └── pham-vi-nguon-luc.md
        ├── 02-chuong-trinh/
        │   ├── rcm.md               # Ma trận Rủi ro – Kiểm soát
        │   └── chuong-trinh-kiem-toan.md
        ├── 03-thuc-hien/
        │   ├── WP-A01-....md        # working papers, xem mục 3
        │   └── nhat-ky-thuc-dia.md
        ├── 04-phat-hien/
        │   ├── PH-01-....md         # từng phát hiện 5C
        │   └── tong-hop-phat-hien.md
        ├── 05-bao-cao/
        │   ├── bao-cao-draft-v1.md
        │   ├── phan-hoi-don-vi.md
        │   └── bao-cao-final.md     # + bản HTML A4 song ngữ nếu trình lãnh đạo
        └── 06-theo-doi/
            └── theo-doi-khac-phuc.md
```

## 3. Đặt tên working paper

Định dạng: `WP-{PHÂN VÙNG}{SỐ 2 chữ số}-{mô-tả-ngắn}.md`

Phân vùng theo mục tiêu kiểm toán trong chương trình:
- `A` = tìm hiểu quy trình / walkthrough
- `B` = test of controls (kiểm tra kiểm soát)
- `C` = substantive test (kiểm tra chi tiết)
- `D` = phân tích dữ liệu (data analytics)

Ví dụ: `WP-B03-test-phe-duyet-mien-giam-hoc-phi.md`

## 4. Đặt tên phát hiện

`PH-{SỐ 2 chữ số}-{mô-tả-ngắn}.md` — đánh số theo thứ tự phát hiện trong cuộc, KHÔNG theo mức độ. Ví dụ: `PH-02-thieu-doi-chieu-hoc-phi.md`

## 5. Trạng thái tài liệu

Mọi file hồ sơ có frontmatter tối thiểu:

```yaml
---
ma_cuoc: KTNB-2026-01-TUYENSINH
loai: working-paper | phat-hien | bao-cao | ke-hoach | rcm | theo-doi
trang_thai: draft | reviewed | final
nguoi_lap: <tên hoặc "Claude hỗ trợ, <tên> soát xét">
ngay_lap: 2026-07-06
---
```

**Bất biến:** file `trang_thai: final` không sửa nội dung — muốn thay đổi thì tạo phiên bản mới (`-v2`) và ghi lý do.

## 6. Ẩn danh & bảo mật

- Deliverable trình bày ngoài phòng KTNB: gọi theo **vai trò/chức danh**, không nêu tên cá nhân (theo yêu cầu chung của user với deliverable NHG).
- Không dán dữ liệu cá nhân (PII), lương, số tài khoản vào hồ sơ; dùng mã hóa tham chiếu (VD: `NV-047`).

## 7. Định dạng deliverable

- Hồ sơ làm việc nội bộ: **Markdown**.
- Báo cáo/tài liệu trình lãnh đạo: **HTML A4 song ngữ VI/EN** theo NHG Design System (font Be Vietnam Pro, xanh `#037236`, đỏ `#ED2024`, token ở `18062026-nhg-design-system/` hoặc `design-system/`).
