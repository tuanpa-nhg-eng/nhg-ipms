# Đối chiếu năng lực & khoảng trống (Fit-Gap)

> Template này sinh **hai file**. Đừng gộp. Bản nội bộ có ngày công và ghi chú thương mại; bản trình khách không có.

---

## ⛔ BẢN A — `fit-gap-noi-bo.md`

```yaml
---
ma_kh: KH-{NĂM}-{nn}-{TÊNNGẮN}
loai: fit-gap
trang_thai: draft
pham_vi_luu_hanh: noi-bo
ngay_lap: {YYYY-MM-DD}
---
```

**Đối chiếu sổ năng lực ngày {ngày}** · Sổ cũ hơn 30 ngày? ☐ đã đọc lại `STATUS.md` + `OWNER_DIGEST.md`

### A1. Bảng đối chiếu đầy đủ

| BR | Ưu tiên | Mức nền tảng (VH/BẬT/CH/PT/NPV) | Mức fit trình khách | Ngày công ước tính | Phụ thuộc | Ghi chú nội bộ |
|---|---|---|---|---|---|---|
| BR-E-01 | M | VH | Sẵn sàng | 0 | — | |
| BR-L-03 | M | BẬT | Sẵn sàng — cần kích hoạt | {n} (tích hợp) | tenant Azure của khách | chưa từng cắm OIDC thật, tính đệm |
| BR-H-02 | M | PT | Cần phát triển | {n} | API hệ nguồn | rủi ro hệ mua ngoài không mở API |

### A2. Rủi ro thương mại

| # | Rủi ro | Ảnh hưởng ngày công / giá | Cách xử lý trong đàm phán |
|---|---|---|---|

### A3. Cảnh báo bắt buộc rà

- [ ] Mọi `M` × PT/NPV đã có phương án và đã vào `RR` mức Cao của BRD.
- [ ] Mọi BẬT đã có dòng phụ thuộc phía khách + hạn cần có.
- [ ] Không hạng mục nào được ghi "Sẵn sàng" mà sổ năng lực ghi PT.
- [ ] Ngày công của hạng mục PT đã do người thật ước lượng, không do skill tự đoán.

---

## BẢN B — `fit-gap-trinh-khach.md`

```yaml
---
ma_kh: KH-{NĂM}-{nn}-{TÊNNGẮN}
loai: fit-gap
trang_thai: draft
pham_vi_luu_hanh: trinh-khach
ngay_lap: {YYYY-MM-DD}
---
```

### B1. Tổng quan mức đáp ứng

| Mức đáp ứng | Số yêu cầu | Trong đó Must have |
|---|---|---|
| Sẵn sàng | | |
| Sẵn sàng — cần kích hoạt | | |
| Đáp ứng bằng cấu hình | | |
| Cần phát triển | | |
| Ngoài phạm vi đợt này | | |

### B2. Chi tiết theo phân hệ

| Phân hệ | Yêu cầu chính của quý vị | Mức đáp ứng | Diễn giải |
|---|---|---|---|
| E · Khung KPI | {…} | Sẵn sàng | {một câu, lấy từ cột "Câu trình khách" của sổ năng lực} |

### B3. Khoảng trống & phương án

| BR | Khoảng trống | Phương án đề xuất | Điều kiện |
|---|---|---|---|
| {…} | {…} | Phát triển bổ sung / Thay bằng cách làm khác / Hoãn sang đợt sau | {…} |

### B4. Việc quý vị cần chuẩn bị

| # | Hạng mục | Phục vụ yêu cầu | Hạn đề nghị |
|---|---|---|---|

**Không có trong bản B:** ngày công, đơn giá, ghi chú nội bộ, tình trạng phát triển nội bộ, tên khách hàng khác.

<!-- ra-hang-rao: CHƯA CHẠY -->
