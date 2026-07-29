# Bộ skill của dự án

Hai bộ độc lập trong thư mục này:

| Bộ | Skill | Kho chung | Hồ sơ đầu ra |
|---|---|---|---|
| **Kiểm toán nội bộ** | 7 skill `audit-*` | `audit-common/` | `07-kiem-toan-noi-bo/` |
| **Tiền bán hàng iPMS** | `ipms-brd` | `ipms-presales-common/` | `12-khach-hang/` |

---

# Hệ thống Skill Kiểm toán Nội bộ (Internal Audit Skill Suite)

Bộ skill phủ trọn **vòng đời kiểm toán nội bộ** theo chuẩn IIA IPPF + Nghị định 05/2019/NĐ-CP, dùng cho Tập đoàn Nguyễn Hoàng (NHG).

## Bản đồ vòng đời → skill

```
[Quản trị chức năng KTNB — cấp năm]
  /audit-risk-assessment  ①  Audit Universe + đánh giá rủi ro toàn hàng
  /audit-plan             ②  Kế hoạch kiểm toán năm (risk-based)

[Từng cuộc kiểm toán — engagement]
  /audit-program          ③  Chương trình kiểm toán + Ma trận Rủi ro–Kiểm soát (RCM)
  /audit-fieldwork        ④  Thực địa: walkthrough, test kiểm soát, chọn mẫu, hồ sơ làm việc
  /audit-finding          ⑤  Soạn phát hiện theo 5C + xếp hạng mức độ
  /audit-report           ⑥  Báo cáo kiểm toán (draft → final, song ngữ VI/EN)
  /audit-followup         ⑦  Theo dõi khắc phục kiến nghị
```

## Kho dùng chung (`audit-common/` — KHÔNG phải skill)

- `quy-uoc.md` — mã cuộc kiểm toán, cấu trúc thư mục hồ sơ, đặt tên file
- `thang-xep-hang.md` — thang rủi ro 5×5, thang mức độ phát hiện (Cao/TB/Thấp)
- `chuan-muc.md` — tóm tắt IIA IPPF + NĐ 05/2019/NĐ-CP
- `templates/` — mẫu RCM, working paper, phát hiện 5C, đề cương báo cáo

## Hồ sơ đầu ra

Mọi work product ghi vào `07-kiem-toan-noi-bo/` ở gốc dự án (xem `audit-common/quy-uoc.md`):

```
07-kiem-toan-noi-bo/
├── 00-quan-tri/                    # audit universe, kế hoạch năm, quy chế
└── {NĂM}/{MÃ-CUỘC}/                # ví dụ 2026/KTNB-2026-03-TUYENSINH/
    ├── 01-ke-hoach/                # thông báo, phạm vi, nguồn lực
    ├── 02-chuong-trinh/            # RCM, chương trình kiểm toán
    ├── 03-thuc-hien/               # working papers WP-xxx
    ├── 04-phat-hien/               # phát hiện 5C, tổng hợp
    ├── 05-bao-cao/                 # draft, phản hồi đơn vị, final
    └── 06-theo-doi/                # sổ theo dõi khắc phục
```

## Nguyên tắc xuyên suốt

1. **Độc lập – khách quan**: skill chỉ hỗ trợ soạn thảo/phân tích; kết luận & phê duyệt luôn là con người (HITL).
2. **Bằng chứng trước, kết luận sau**: mọi phát hiện phải trỏ về working paper có bằng chứng.
3. **Xếp hạng nhất quán**: dùng duy nhất thang trong `audit-common/thang-xep-hang.md`.
4. **Song ngữ**: deliverable trình lãnh đạo dạng HTML A4 song ngữ VI/EN theo NHG Design System; hồ sơ làm việc dạng Markdown.
