# 12 · Hồ sơ Khách hàng (Tiền bán hàng iPMS)

Hồ sơ khảo sát yêu cầu và BRD cho khách hàng có nhu cầu về Nền tảng iPMS. NHG ở vai **nhà cung cấp**.

## Dùng thế nào

Gõ **`/ipms-brd`** — skill dẫn trọn quy trình: nạp đầu vào → chuẩn hoá thành yêu cầu `BR` truy vết → đối chiếu năng lực → BRD bản A4 song ngữ trình khách ký.

Quy ước, thang đo và sổ năng lực nằm ở `.claude/skills/ipms-presales-common/`:

| File | Nội dung |
|---|---|
| `quy-uoc.md` | Mã khách hàng, cây thư mục, **hàng rào nội bộ ↔ trình khách** |
| `so-nang-luc-ipms.md` | **Nguồn sự thật duy nhất** cho câu "iPMS đáp ứng…" — 13 phân hệ × 5 mức trưởng thành |
| `thang-do.md` | MoSCoW · 5 mức đáp ứng · mức trưởng thành khách · phân loại dữ liệu |
| `templates/` | `ho-so.mau.json` (khuôn nguồn), A4 html bản ký, ma trận truy vết, biên bản khảo sát, fit-gap, phiếu tự khai |
| `scripts/xuat-ho-so.py` | Bộ sinh bộ hồ sơ gửi khách — **hàng rào nội bộ nằm bên trong nó** |

## Bộ hồ sơ gửi khách

Một nguồn `ho-so.json` → hai file:

```bash
py .claude/skills/ipms-presales-common/scripts/xuat-ho-so.py 12-khach-hang/{NĂM}/{MÃ-KH}/03-yeu-cau/ho-so.json
```

| File | Vai trò |
|---|---|
| `01_BRD_{MÃ-KH}_{v}.docx` | 15 mục — khách rà bằng Track Changes |
| `02_Phu_luc_{MÃ-KH}_{v}.xlsx` | 7 sheet — khách ghi ý kiến, chốt ưu tiên tự đếm |

Bản mẫu xem trước: [`00-tai-san-ban-hang/bo-ho-so-mau/`](00-tai-san-ban-hang/bo-ho-so-mau/).

Ghi chú nội bộ để trong khoá `_noibo` của JSON. Bộ sinh file loại chúng theo cấu trúc trước khi dựng tài liệu — không có đường nào để chúng ra tới khách.

Bộ câu hỏi khảo sát đầy đủ (13 phân hệ A–M, 5 lớp, 4 vòng phỏng vấn): [`11-khao-sat-yeu-cau/`](../11-khao-sat-yeu-cau/) — tài liệu công tác nội bộ của BA.

## Cấu trúc

```
12-khach-hang/
├── 00-tai-san-ban-hang/          # bản TRẮNG, dùng lại cho mọi khách
│   └── phieu-khach-tu-khai.html  # gửi khách tự điền trước buổi làm việc
└── {NĂM}/{MÃ-KH}/                # ví dụ 2026/KH-2026-01-VANLANG/
    ├── 01-tiep-can/              # thông tin khách, phiếu tự khai đã điền, NDA
    ├── 02-khao-sat/              # biên bản BB-nn + bang-chung/BC-nn
    ├── 03-yeu-cau/               # BRD + ma trận truy vết + bản A4 trình khách
    ├── 04-fit-gap/               # fit-gap nội bộ (⛔) + fit-gap trình khách
    └── 05-ban-giao/              # BRD đã ký + nhật ký thay đổi phạm vi
```

## Ba nguyên tắc không thương lượng

1. **Hàng rào nội bộ.** Vé nội bộ, tiến độ build, ngân sách, tên hệ thống nội bộ, tên cá nhân — không bao giờ ra khỏi tài liệu nội bộ. Mọi bản trình khách phải qua rà hàng rào và mang dấu `<!-- ra-hang-rao: PASS -->`.
2. **Bằng chứng trước, yêu cầu sau.** Không có file thật thì viết câu hỏi mở, không viết yêu cầu.
3. **Không cam kết mốc thời gian trong BRD.** BRD chốt *cái gì*; *bao giờ* và *bao nhiêu* thuộc tài liệu đề xuất giải pháp.

## Bảo mật

Dữ liệu khách thu thập là **Mật**. Không đưa thông tin cá nhân vào BRD; gọi theo chức danh, không nêu tên người. Có NDA trước khi nhận file thật.
